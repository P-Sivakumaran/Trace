import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { normalizeDomain, reconConfigSchema, runnerHealthSchema, validateCollection, withinScope } from '../services/recon/contracts';
import { ReconBroker } from '../../electron/recon/broker';
import { inside } from '../../electron/recon/paths';
import { runnerProcess, callRunner } from '../../electron/recon/client';
import { trustedDocument } from '../../electron/recon/trusted-renderer';
import { parseSourceFile, serializeSourceFile } from '../services/markdownParser';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
const roots: string[] = [];
afterEach(() => { roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })); });
function setup() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-recon-')); roots.push(workspace);
  for (const id of ['case-a', 'case-b']) { fs.mkdirSync(path.join(workspace, 'projects', id), { recursive: true }); fs.writeFileSync(path.join(workspace, 'projects', id, 'project.md'), `# ${id}`); }
  const broker = new ReconBroker({ workspace: () => workspace, profile: path.join(workspace, 'profile'), localServer: path.resolve('dist-mcp/mcp/kali-server.js'), nodeExecutable: process.execPath, fixture: true });
  broker.saveConfig({ mode: 'local', scope: ['example.com'] });
  return { broker, workspace, root: path.join(workspace, 'projects/case-a') };
}
async function completed(broker: ReconBroker, id: string) {
  for (let index = 0; index < 150; index++) { const job = broker.list('case-a').find(j => j.id === id)!; if (!['queued', 'running'].includes(job.status)) return job; await new Promise(resolve => setTimeout(resolve, 50)); }
  throw new Error('Job did not finish');
}
describe('recon policy', () => {
  it('rejects malformed health and unknown operations before offering profiles', () => {
    const health = { name: 'runner', version: '1', platform: 'darwin', kali: false, synthetic: false, scope: ['example.com'], operations: ['certificate_transparency'], harvesterVersion: null };
    expect(runnerHealthSchema.parse(health).operations).toEqual(['certificate_transparency']);
    expect(() => runnerHealthSchema.parse({ ...health, operations: ['arbitrary_shell'] })).toThrow();
    expect(() => runnerHealthSchema.parse({ ...health, kali: 'true' })).toThrow();
  });
  it('normalizes international domains and enforces registrable boundaries', () => {
    expect(normalizeDomain('BÜCHER.de.')).toBe('xn--bcher-kva.de');
    for (const invalid of ['co.uk', '127.0.0.1', 'localhost', 'https://example.com', 'example.com;id', 'example.com/../x']) expect(() => normalizeDomain(invalid)).toThrow();
    expect(withinScope('www.example.com', ['example.com'])).toBe(true);
    expect(withinScope('badexample.com', ['example.com'])).toBe(false);
    expect(withinScope('example.com.evil.org', ['example.com'])).toBe(false);
  });
  it('rejects SSH command injection and fixes transport options', () => {
    const config = reconConfigSchema.parse({ mode: 'ssh', scope: ['example.com'], sshHost: 'kali-vm', sshUser: 'analyst', remoteServer: '/opt/trace/runner.js' });
    const command = runnerProcess(config, '/unused', process.execPath);
    expect(command.command).toBe('/usr/bin/ssh'); expect(command.args).toContain('StrictHostKeyChecking=yes'); expect(command.args).toContain('ForwardAgent=no');
    expect(() => runnerProcess({ ...config, sshHost: 'host;id' }, '', '')).toThrow();
    expect(() => runnerProcess({ ...config, remoteServer: '/tmp/x$(id).js' }, '', '')).toThrow();
  });
  it('trusts only the application document and rejects symlink escapes', () => {
    expect(trustedDocument('http://localhost:8090/#graph', 'http://localhost:8090/')).toBe(true);
    expect(trustedDocument('https://evil.org/', 'http://localhost:8090/')).toBe(false);
    expect(trustedDocument('file:///tmp/evil.html', 'file:///app/index.html')).toBe(false);
    const { root } = setup(); fs.symlinkSync('/does-not-exist', path.join(root, 'escape'));
    expect(() => inside(root, path.join(root, 'escape/file'))).toThrow('Symlink');
    expect(() => inside(root, path.join(root, '../case-b'))).toThrow('outside');
  });
  it('rejects wrong provenance and out-of-scope runner results', () => {
    const collection = { target: 'example.com', operation: 'certificate_transparency', collectedAt: new Date().toISOString(), toolVersion: 'test', sourceUrl: 'https://crt.sh/?q=example.com', domains: ['evil.org'], raw: '[]', synthetic: true };
    expect(() => validateCollection(collection, 'example.com', 'certificate_transparency')).toThrow('out-of-scope');
    expect(() => validateCollection({ ...collection, domains: [], sourceUrl: 'https://evil.org/' }, 'example.com', 'certificate_transparency')).toThrow('provenance');
  });
});
describe('MCP collection and operator review', () => {
  it('serves legacy MCP clients alongside the current protocol', async () => {
    const client = new Client({ name: 'legacy-test', version: '1' }, { versionNegotiation: { mode: 'legacy' } });
    try {
      await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.resolve('dist-mcp/mcp/kali-server.js'), '--scope-b64', Buffer.from('["example.com"]').toString('base64'), '--fixture'], stderr: 'ignore' }));
      const health = await client.callTool({ name: 'runner_health', arguments: {} });
      expect(health.structuredContent?.synthetic).toBe(true);
    } finally { await client.close(); }
  }, 10000);

  it('uses the real stdio protocol, retains raw evidence, and imports only selected candidates once', async () => {
    const { broker, root, workspace } = setup();
    const health = await broker.health() as { synthetic: boolean }; expect(health.synthetic).toBe(true);
    expect(() => broker.start({ caseId: 'case-a', target: 'evil.org', operation: 'certificate_transparency' })).toThrow('scope');
    const queued = broker.start({ caseId: 'case-a', target: 'example.com', operation: 'certificate_transparency' });
    const job = await completed(broker, queued.id); expect(job.status).toBe('succeeded'); expect(job.synthetic).toBe(true);
    expect(fs.existsSync(path.join(root, 'entities'))).toBe(false);
    expect(() => broker.accept('case-b', job.id, ['www.example.com'])).toThrow();
    expect(() => broker.accept('case-a', job.id, ['evil.org'])).toThrow('outside');
    const imported = broker.accept('case-a', job.id, ['www.example.com']); expect(imported.status).toBe('imported');
    expect(fs.readdirSync(path.join(root, 'entities'))).toHaveLength(2);
    expect(fs.readdirSync(path.join(root, 'relationships'))).toHaveLength(1);
    expect(fs.readdirSync(path.join(root, 'sources'))).toHaveLength(1);
    const raw = broker.readArtifact('case-a', job.id).raw;
    const source = fs.readFileSync(path.join(root, `sources/recon-${job.id}.md`), 'utf8');
    expect(serializeSourceFile(parseSourceFile(source, 'fallback'))).toContain(raw);
    expect(source).toContain('SYNTHETIC FIXTURE');
    broker.accept('case-a', job.id, ['www.example.com']); expect(fs.readdirSync(path.join(root, 'relationships'))).toHaveLength(1);
    expect(fs.existsSync(path.join(workspace, 'projects/case-b/entities'))).toBe(false);
  }, 15000);
  it('detects evidence tampering and cancels a queued job without importing', async () => {
    const { broker, root } = setup();
    const first = broker.start({ caseId: 'case-a', target: 'example.com', operation: 'certificate_transparency' });
    const second = broker.start({ caseId: 'case-a', target: 'example.com', operation: 'certificate_transparency' }); broker.cancel('case-a', second.id);
    expect(broker.list('case-a').find(j => j.id === second.id)?.status).toBe('cancelled');
    const job = await completed(broker, first.id); expect(job.status).toBe('succeeded');
    fs.appendFileSync(path.join(root, `.trace/recon/jobs/${job.id}/raw.txt`), 'tampered');
    expect(() => broker.accept('case-a', job.id, ['www.example.com'])).toThrow('hash');
    expect(fs.existsSync(path.join(root, 'entities'))).toBe(false);
  }, 15000);
  it('replays a partial import with the same selection without overwriting a conflicting record', async () => {
    const { broker, root } = setup();
    const queued = broker.start({ caseId: 'case-a', target: 'example.com', operation: 'certificate_transparency' });
    const job = await completed(broker, queued.id);
    const relation = `recon-link-${job.id}-${createHash('sha256').update('www.example.com').digest('hex').slice(0, 16)}.md`;
    fs.mkdirSync(path.join(root, 'relationships')); fs.writeFileSync(path.join(root, 'relationships', relation), 'Keep this conflicting file');
    expect(() => broker.accept('case-a', job.id, ['www.example.com'])).toThrow('different content');
    expect(fs.readFileSync(path.join(root, 'relationships', relation), 'utf8')).toBe('Keep this conflicting file');
    expect(() => broker.accept('case-a', job.id, ['mail.example.com'])).toThrow('same selection');
    fs.unlinkSync(path.join(root, 'relationships', relation));
    expect(broker.accept('case-a', job.id, ['www.example.com']).status).toBe('imported');
    expect(fs.readdirSync(path.join(root, 'entities'))).toHaveLength(2);
    expect(fs.readdirSync(path.join(root, 'sources'))).toHaveLength(1);
    expect(fs.readdirSync(path.join(root, 'relationships'))).toHaveLength(1);
  }, 15000);
  it('aborts active work, bounds the queue and never creates graph files', async () => {
    const { workspace, root } = setup();
    const broker = new ReconBroker({ workspace: () => workspace, profile: path.join(workspace, 'profile'), localServer: '', nodeExecutable: process.execPath,
      call: async (_config, _server, _node, _tool, _args, signal) => new Promise((_resolve, reject) => { signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true }); }) });
    const job = broker.start({ caseId: 'case-a', target: 'example.com', operation: 'certificate_transparency' });
    await new Promise(resolve => setTimeout(resolve, 0));
    for (let index = 0; index < 4; index++) broker.start({ caseId: 'case-a', target: 'example.com', operation: 'certificate_transparency' });
    expect(() => broker.start({ caseId: 'case-a', target: 'example.com', operation: 'certificate_transparency' })).toThrow('full');
    broker.stop(); expect((await completed(broker, job.id)).status).toBe('cancelled');
    expect(broker.list('case-a').every(item => item.status === 'cancelled')).toBe(true);
    expect(fs.existsSync(path.join(root, 'entities'))).toBe(false);
  });
  it('rejects collection requests outside the runner scope over MCP', async () => {
    await expect(callRunner({ mode: 'local', scope: ['example.com'] }, path.resolve('dist-mcp/mcp/kali-server.js'), process.execPath, 'kali_collect_domain', { target: 'evil.org', operation: 'certificate_transparency' }, AbortSignal.timeout(5000), true)).rejects.toThrow('rejected');
  }, 10000);
  it('case MCP reads only its bound case and stages proposals without writing graph records', async () => {
    const { broker, root, workspace } = setup();
    const client = new Client({ name: 'test', version: '1' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } });
    try {
      await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.resolve('dist-mcp/mcp/trace-server.js'), '--workspace', workspace, '--case-id', 'case-a', '--scope-b64', Buffer.from('["example.com"]').toString('base64')], stderr: 'ignore' }));
      const brief = await client.callTool({ name: 'trace_read_case', arguments: {} }); expect(brief.structuredContent?.caseId).toBe('case-a');
      const outside = await client.callTool({ name: 'trace_propose_findings', arguments: { target: 'evil.org', domains: ['www.evil.org'], summary: 'Reject' } }); expect(outside.isError).toBe(true);
      const proposed = await client.callTool({ name: 'trace_propose_findings', arguments: { target: 'example.com', domains: ['www.example.com'], summary: 'Unverified research lead' } });
      expect(proposed.structuredContent?.graphChanged).toBe(false); expect(fs.existsSync(path.join(root, 'entities'))).toBe(false);
      const proposal = broker.proposals('case-a')[0]; const job = broker.stageProposal('case-a', proposal.id); expect(job.operation).toBe('assistant_proposal');
      expect(fs.existsSync(path.join(root, 'entities'))).toBe(false);
      broker.accept('case-a', job.id, ['www.example.com']);
      const source = fs.readFileSync(path.join(root, `sources/recon-${job.id}.md`), 'utf8'); expect(source).toContain('No collection or independent verification');
    } finally { await client.close(); }
  }, 15000);
});
