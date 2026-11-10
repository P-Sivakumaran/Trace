import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { agentResponseJsonSchema, responseSchema, type AgentProvider, type AgentAnswer, type ProviderStatus } from '../../src/services/agent/contracts.js';

export function providerExecutable(provider: AgentProvider): string | null {
  const names = process.platform === 'win32' ? [`${provider}.exe`] : [provider];
  const directories = process.platform === 'win32' ? (process.env.PATH ?? '').split(path.delimiter) : ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', path.join(os.homedir(), '.local/bin')];
  for (const directory of directories) for (const name of names) {
    const file = path.join(directory, name);
    try { fs.accessSync(file, fs.constants.X_OK); if (fs.statSync(file).isFile()) return file; } catch { /* Try the next installation location. */ }
  }
  return null;
}
export function providerEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const name of ['HOME', 'USER', 'LOGNAME', 'TMPDIR', 'TEMP', 'SYSTEMROOT', 'APPDATA', 'LOCALAPPDATA', 'USERPROFILE']) if (process.env[name]) env[name] = process.env[name];
  env.PATH = process.platform === 'win32' ? process.env.PATH : '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin';
  for (const name of ['CODEX_HOME', 'CLAUDE_CONFIG_DIR']) if (process.env[name] && path.isAbsolute(process.env[name]!)) env[name] = process.env[name];
  env.CLAUDE_CODE_SAFE_MODE = '1';
  return env;
}
export function providerArguments(provider: AgentProvider, model: string, schemaFile: string): string[] {
  if (provider === 'codex') return ['--ask-for-approval', 'never', 'exec', '--ignore-user-config', '--ignore-rules', '--ephemeral', '--skip-git-repo-check', '--sandbox', 'read-only', '--color', 'never', '--json',
    '--disable', 'shell_tool', '--disable', 'view_image', '--disable', 'apps', '--disable', 'multi_agent',
    '--disable', 'plugins', '--disable', 'hooks', '--disable', 'computer_use', '--disable', 'image_generation', '--disable', 'code_mode', '--disable', 'code_mode_host',
    '-c', 'web_search="disabled"', '-c', 'project_doc_max_bytes=0', '-c', 'features.skill_mcp_dependency_install=false',
    '--output-schema', schemaFile, ...(model ? ['--model', model] : []), '-'];
  return ['--safe-mode', '--print', '--output-format', 'json', '--no-session-persistence', '--tools', '', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--setting-sources', '', '--disable-slash-commands', '--permission-mode', 'dontAsk',
    '--json-schema', fs.readFileSync(schemaFile, 'utf8'), ...(model ? ['--model', model] : [])];
}
export async function runProcess(command: string, args: string[], cwd: string, input: string, signal: AbortSignal, maxBytes = 1_500_000): Promise<{ stdout: string; code: number | null; authHint?: 'subscription' | 'api' }> {
  if (signal.aborted) throw new Error('Cancelled');
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: providerEnvironment(), shell: false, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = ''; let bytes = 0; let failure: Error | undefined; let killTimer: ReturnType<typeof setTimeout> | undefined;
    let authHint: 'subscription' | 'api' | undefined;
    const decoder = new StringDecoder('utf8');
    const stop = (reason: string) => {
      if (failure) return; failure = new Error(reason);
      const kill = (signal: NodeJS.Signals) => { try { if (child.pid && process.platform !== 'win32') process.kill(-child.pid, signal); else child.kill(signal); } catch { /* Child already exited. */ } };
      kill('SIGTERM'); killTimer = setTimeout(() => kill('SIGKILL'), 1500);
    };
    const abort = () => stop('Cancelled'); signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => stop('Provider exceeded the three-minute time limit'), 180000);
    child.stdout.on('data', (chunk: Buffer) => { bytes += chunk.length; if (bytes > maxBytes) stop('Provider output exceeded its limit'); else stdout += decoder.write(chunk); });
    child.stderr.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (args[0] === 'login' && args[1] === 'status') {
        if (/Logged in using ChatGPT/i.test(chunk.toString())) authHint = 'subscription';
        else if (/Logged in using.*API key/i.test(chunk.toString())) authHint = 'api';
      }
      if (bytes > maxBytes) stop('Provider output exceeded its limit');
    });
    const clean = () => { clearTimeout(timer); clearTimeout(killTimer); signal.removeEventListener('abort', abort); };
    child.once('error', () => { clean(); reject(new Error('Could not start the selected provider CLI')); });
    child.once('close', code => { clean(); stdout += decoder.end(); if (failure) reject(failure); else resolve({ stdout, code, authHint }); });
    child.stdin.on('error', () => { /* Early provider exit is handled by close. */ });
    child.stdin.end(input);
    if (signal.aborted) abort();
  });
}
export function parseAnswer(provider: AgentProvider, output: string): AgentAnswer {
  let value: unknown;
  if (provider === 'claude') {
    const result = JSON.parse(output);
    if (result.is_error) throw new Error('Claude could not answer. Check its login, model access and usage limits.');
    value = result.structured_output ?? JSON.parse(result.result);
  } else {
    for (const line of output.split('\n').filter(Boolean)) {
      const event = JSON.parse(line);
      if (event.type === 'turn.failed' || event.type === 'error') throw new Error('Codex could not answer. Check its login, model access and usage limits.');
      if (event.type === 'item.completed' && event.item?.type === 'agent_message') value = JSON.parse(event.item.text);
      if (event.item && ['command_execution', 'file_change', 'mcp_tool_call', 'web_search'].includes(event.item.type)) throw new Error('Provider attempted an unsupported tool. No response was accepted.');
    }
  }
  const parsed = responseSchema.safeParse(value);
  if (!parsed.success) throw new Error('Provider returned an invalid structured answer. Try another message or model.');
  return parsed.data;
}
export function classifyAccount(provider: AgentProvider, auth: { code: number | null; stdout: string; authHint?: 'subscription' | 'api' }): ProviderStatus['account'] {
  if (provider === 'codex') return auth.code === 0 ? auth.authHint ?? 'unknown' : 'unknown';
  try {
    const result = JSON.parse(auth.stdout);
    if (result.loggedIn === false) return 'signed_out';
    if (auth.code !== 0) return 'unknown';
    if (['claude.ai', 'oauth_token'].includes(result.authMethod)) return 'subscription';
    if (['api_key', 'api_key_helper', 'third_party'].includes(result.authMethod)) return 'api';
  } catch { /* Unrecognized output is not proof of an account login. */ }
  return 'unknown';
}
async function accountStatus(provider: AgentProvider, executable: string, cwd: string, signal: AbortSignal) {
  const timeout = AbortSignal.timeout(15000);
  try {
    const auth = await runProcess(executable, provider === 'codex' ? ['login', 'status'] : ['auth', 'status', '--json'], cwd, '', AbortSignal.any([signal, timeout]), 100000);
    return classifyAccount(provider, auth);
  } catch (error) {
    if (timeout.aborted && !signal.aborted) throw new Error('Account check timed out. Open the provider CLI in your terminal, then refresh the account checks.');
    throw error;
  }
}
export async function invokeProvider(options: { provider: AgentProvider; model: string; prompt: string; scratch: string; signal: AbortSignal }): Promise<AgentAnswer> {
  const executable = providerExecutable(options.provider);
  if (!executable) throw new Error(`Install ${options.provider === 'codex' ? 'Codex CLI' : 'Claude Code'} and sign in to your account first.`);
  fs.mkdirSync(options.scratch, { recursive: true, mode: 0o700 });
  const account = await accountStatus(options.provider, executable, options.scratch, options.signal);
  if (account !== 'subscription') throw new Error(account === 'api' ? 'API authentication is active. Sign in with your plan account before using Trace subscription chat.' : `Plan account login is not confirmed. Run ${options.provider === 'codex' ? 'codex login' : 'claude auth login'} in your terminal, then refresh account checks.`);
  const schemaFile = path.join(options.scratch, 'response-schema.json');
  // Providers own their auth; only the public response schema is written to their working directory.
  fs.writeFileSync(schemaFile, JSON.stringify(agentResponseJsonSchema), { mode: 0o600 });
  const result = await runProcess(executable, providerArguments(options.provider, options.model, schemaFile), options.scratch, options.prompt, options.signal);
  if (result.code !== 0) throw new Error(`${options.provider === 'codex' ? 'Codex' : 'Claude'} exited without an answer. Check sign-in, supported CLI version, model access and usage limits in its terminal.`);
  return parseAnswer(options.provider, result.stdout);
}
export async function inspectProviders(cwd: string): Promise<ProviderStatus[]> {
  return Promise.all((['codex', 'claude'] as const).map(async provider => {
    const executable = providerExecutable(provider);
    if (!executable) return { provider, installed: false, account: 'unknown' as const, detail: 'CLI not installed. Install it and sign in in your terminal.' };
    try {
      const timeout = AbortSignal.timeout(15000);
      const version = await runProcess(executable, ['--version'], cwd, '', timeout, 100000);
      const account = await accountStatus(provider, executable, cwd, timeout);
      // Only the auth method is retained; identity details and raw CLI diagnostics are discarded.
      return { provider, installed: true, version: version.stdout.trim().slice(0, 100), account, detail: account === 'subscription' ? 'Account login detected. Provider plan limits apply.' : account === 'api' ? 'API authentication detected. Sign in with your plan account; Trace subscription mode does not use API billing.' : account === 'signed_out' ? 'Sign in in your terminal before sending.' : 'Account type is unverified. Refresh the checks or sign in with your plan account in the terminal before sending.' };
    } catch { return { provider, installed: true, account: 'unknown' as const, detail: 'Could not verify account status. Check this CLI in your terminal.' }; }
  }));
}
