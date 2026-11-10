import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport, type StdioServerParameters } from '@modelcontextprotocol/client/stdio';
import { reconConfigSchema, type ReconConfig } from '../../src/services/recon/contracts.js';

export function runnerProcess(config: ReconConfig, localServer: string, nodeExecutable: string, fixture = false): StdioServerParameters {
  config = reconConfigSchema.parse(config);
  const args = ['--scope-b64', Buffer.from(JSON.stringify(config.scope)).toString('base64')];
  if (config.mode === 'ssh') {
    return { command: '/usr/bin/ssh', args: ['-T', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ForwardAgent=no', '-o', 'ClearAllForwardings=yes', '-o', 'ConnectTimeout=8', '--', `${config.sshUser}@${config.sshHost}`, '/usr/bin/node', config.remoteServer!, ...args],
      env: process.env.SSH_AUTH_SOCK ? { SSH_AUTH_SOCK: process.env.SSH_AUTH_SOCK } : undefined };
  }
  return { command: nodeExecutable, args: [localServer, ...args, ...(fixture ? ['--fixture'] : [])], env: { ELECTRON_RUN_AS_NODE: '1' } };
}

export async function callRunner(config: ReconConfig, localServer: string, nodeExecutable: string, tool: string, args: Record<string, unknown>, signal: AbortSignal, fixture = false): Promise<unknown> {
  const transport = new StdioClientTransport({ ...runnerProcess(config, localServer, nodeExecutable, fixture), stderr: 'pipe' });
  // Consume bounded diagnostics without forwarding private runner stderr into the renderer or logs.
  let stderrSize = 0;
  transport.stderr?.on('data', (chunk: Buffer) => { stderrSize += chunk.length; if (stderrSize > 200_000) void transport.close(); });
  const client = new Client({ name: 'trace-desktop', version: '0.1.0' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } });
  const close = () => { void client.close(); };
  signal.addEventListener('abort', close, { once: true });
  try {
    if (signal.aborted) throw new Error('Job cancelled');
    await client.connect(transport, { timeout: 12_000 });
    const result = await client.callTool({ name: tool, arguments: args }, { signal, timeout: 55_000 });
    if (result.isError) throw new Error('Runner rejected collection; check scope, profile availability and connectivity');
    if (!result.structuredContent) throw new Error('Runner returned no structured result');
    return result.structuredContent;
  } finally { signal.removeEventListener('abort', close); await client.close(); }
}
