import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';
import { spawn } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { domainSchema, operationSchema, withinScope, type Collection } from '../src/services/recon/contracts.js';

const scopeArg = process.argv.indexOf('--scope-b64');
const scope = z.array(domainSchema).min(1).max(30).parse(JSON.parse(Buffer.from(process.argv[scopeArg + 1] ?? '', 'base64').toString()));
if (scopeArg < 0) throw new Error('An explicit domain scope is required');
const fixture = process.argv.includes('--fixture');
const tool = '/usr/bin/theHarvester';
let kali = false;
try { kali = /^ID=kali$/m.test((await readFile('/etc/os-release', 'utf8')).replaceAll('"', '')); } catch { /* Local passive runner on non-Linux hosts. */ }

function textResult(value: Record<string, unknown>) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value) }], structuredContent: value };
}

async function runHarvester(args: string[], signal: AbortSignal, limit = 1_500_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(tool, args, { shell: false, detached: process.platform !== 'win32',
      env: { PATH: '/usr/local/bin:/usr/bin:/bin', LANG: 'C.UTF-8', PYTHONUNBUFFERED: '1' } });
    let text = ''; let failure: Error | undefined; let killTimer: ReturnType<typeof setTimeout> | undefined;
    const stop = (reason: string) => {
      if (failure) return;
      failure = new Error(reason);
      try { if (child.pid && process.platform !== 'win32') process.kill(-child.pid, 'SIGTERM'); else child.kill(); } catch { /* Process already exited. */ }
      killTimer = setTimeout(() => { try { if (child.pid && process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); } catch { /* Already exited. */ } }, 1500);
    };
    const abort = () => stop('Collection cancelled');
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    const timer = setTimeout(() => stop('Collection exceeded its time limit'), 45_000);
    child.stdout.on('data', (chunk: Buffer) => { text += chunk.toString(); if (Buffer.byteLength(text) > limit) stop('Collection exceeded its output limit'); });
    child.stderr.on('data', () => { /* Do not put arbitrary stderr or credentials into MCP responses. */ });
    child.once('error', (error) => { clearTimeout(timer); clearTimeout(killTimer); signal.removeEventListener('abort', abort); reject(error); });
    child.once('close', (code) => { clearTimeout(timer); clearTimeout(killTimer); signal.removeEventListener('abort', abort); if (failure) reject(failure); else if (code !== 0) reject(new Error(`theHarvester exited with code ${code}`)); else resolve(text); });
  });
}

async function capabilities(signal: AbortSignal) {
  let harvesterVersion: string | null = null;
  if (kali) {
    try {
      await access(tool, constants.X_OK);
      const help = await runHarvester(['--help'], signal, 100_000);
      if (help.includes('crtsh')) harvesterVersion = help.match(/(?:theHarvester|version)\s*[:v]?\s*(\d+\.\d+(?:\.\d+)?)/i)?.[1] ?? 'version not reported';
    } catch { /* Missing/unsupported CLI profiles are unavailable, not silently substituted. */ }
  }
  return { name: 'trace-kali-runner', version: '1', platform: process.platform, kali,
    synthetic: fixture, scope, operations: ['certificate_transparency', ...(harvesterVersion ? ['theharvester_crtsh'] : [])], harvesterVersion };
}

async function boundedText(response: Response, signal: AbortSignal): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Empty certificate-index response');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      if (signal.aborted) throw new Error('Collection cancelled');
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength; if (size > 1_500_000) throw new Error('Certificate-index response exceeds the limit');
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally { await reader.cancel().catch(() => {}); }
}

export async function collect(target: string, operation: z.infer<typeof operationSchema>, signal: AbortSignal): Promise<Collection> {
  if (!withinScope(target, scope)) throw new Error('Target is outside the configured scope');
  const url = new URL('https://crt.sh/'); url.searchParams.set('q', `%.${target}`); url.searchParams.set('output', 'json');
  let raw: string; let names: string[]; let version: string;
  if (fixture) {
    raw = JSON.stringify([{ name_value: `www.${target}\nmail.${target}` }]); names = [`www.${target}`, `mail.${target}`]; version = 'synthetic fixture';
  } else if (operation === 'certificate_transparency') {
    const timeout = AbortSignal.timeout(30_000);
    const combined = AbortSignal.any([signal, timeout]);
    const response = await fetch(url, { signal: combined, redirect: 'error', headers: { 'User-Agent': 'Trace/0.1 passive certificate-index research' } });
    if (!response.ok) throw new Error(`Certificate index returned HTTP ${response.status}`);
    raw = await boundedText(response, combined);
    const rows = z.array(z.object({ name_value: z.string().max(10_000) })).max(10_000).parse(JSON.parse(raw));
    names = rows.flatMap((row) => row.name_value.split('\n')); version = `trace-ct/1; node ${process.versions.node}`;
  } else {
    const caps = await capabilities(signal);
    if (!caps.harvesterVersion) throw new Error('This Kali runner has no supported theHarvester crtsh profile');
    raw = await runHarvester(['-d', target, '-b', 'crtsh', '-l', '100'], signal);
    names = raw.match(/\b[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}\b/g) ?? [];
    version = `theHarvester ${caps.harvesterVersion}; source crtsh`;
  }
  const domains = [...new Set(names.flatMap((name) => {
    const parsed = domainSchema.safeParse(name.replace(/^\*\./, ''));
    return parsed.success && withinScope(parsed.data, [target]) ? [parsed.data] : [];
  }))].sort();
  if (domains.length > 500) throw new Error('More than 500 domains found; narrow the target scope');
  return { target, operation, sourceUrl: url.toString(), toolVersion: version, collectedAt: new Date().toISOString(), domains, raw, synthetic: fixture };
}

serveStdio(() => {
  const server = new McpServer({ name: 'trace-kali-runner', version: '1.0.0' });
  server.registerTool('runner_health', { description: 'Report runtime, Kali detection and permitted passive profiles.', inputSchema: z.object({}).strict() }, async (_args, ctx) => textResult(await capabilities(ctx.mcpReq.signal)));
  server.registerTool('kali_collect_domain', { description: 'Collect certificate-index domain leads inside the operator-configured scope. No active scan or shell command.', inputSchema: z.object({ target: domainSchema, operation: operationSchema }).strict() }, async ({ target, operation }, ctx) => textResult(await collect(target, operation, ctx.mcpReq.signal)));
  return server;
});
