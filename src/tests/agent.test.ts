import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AgentBroker } from '../../electron/agent/broker';
import { parseAnswer, providerArguments, providerEnvironment, invokeProvider, classifyAccount, runProcess } from '../../electron/agent/providers';
import { snapshot, searchCase } from '../../electron/agent/case-tools';
import { agentResponseJsonSchema, responseSchema, type AgentAnswer } from '../services/agent/contracts';
const roots: string[] = [];
afterEach(() => { roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })); vi.unstubAllEnvs(); });
const answer = (text = 'Grounded answer'): AgentAnswer => ({ answer: text, citations: [], action: null });
function setup(invoke = vi.fn<typeof invokeProvider>(async () => answer())) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-agent-')); roots.push(workspace);
  for (const id of ['case-a', 'case-b']) {
    const root = path.join(workspace, 'projects', id); fs.mkdirSync(path.join(root, 'sources'), { recursive: true }); fs.mkdirSync(path.join(root, 'entities'));
    fs.writeFileSync(path.join(root, 'project.md'), `# ${id} private brief`);
    fs.writeFileSync(path.join(root, 'sources', 'source-one.md'), `---\nid: source-one\n---\n${id} certificate evidence`);
  }
  const broker = new AgentBroker({ workspace: () => workspace, profile: path.join(workspace, 'profile'), scope: () => ['example.com'], invoke });
  const chat = broker.create('case-a');
  const request = { caseId: 'case-a', conversationId: chat.id, provider: 'codex', model: '', message: 'Analyze this case', includeCase: false };
  return { broker, chat, workspace, root: path.join(workspace, 'projects/case-a'), request, invoke };
}
async function finished(broker: AgentBroker, id: string) {
  for (let i = 0; i < 100; i++) { const chat = broker.list('case-a').find(item => item.id === id)!; if (chat.messages.at(-1)?.status !== 'running') return chat; await new Promise(resolve => setTimeout(resolve, 10)); }
  throw new Error('Agent did not finish');
}
describe('subscription provider policy and parsing', () => {
  it('distinguishes plan, API and unverified account states without exposing identity', () => {
    expect(classifyAccount('codex', { code: 0, stdout: '', authHint: 'subscription' })).toBe('subscription');
    expect(classifyAccount('codex', { code: 0, stdout: '', authHint: 'api' })).toBe('api');
    expect(classifyAccount('codex', { code: 0, stdout: '' })).toBe('unknown');
    expect(classifyAccount('claude', { code: 0, stdout: '{"loggedIn":true,"authMethod":"claude.ai"}' })).toBe('subscription');
    expect(classifyAccount('claude', { code: 0, stdout: '{"loggedIn":true,"authMethod":"api_key"}' })).toBe('api');
    expect(classifyAccount('claude', { code: 1, stdout: '{"loggedIn":false}' })).toBe('signed_out');
    expect(classifyAccount('claude', { code: 1, stdout: 'Unrecognized CLI output' })).toBe('unknown');
  });
  it('uses fixed tool-restricted CLI arguments and does not inherit API secrets', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-schema-')); roots.push(root); const schema = path.join(root, 'schema.json'); fs.writeFileSync(schema, JSON.stringify(agentResponseJsonSchema));
    const codex = providerArguments('codex', 'test-model', schema); expect(codex).toContain('--ignore-user-config'); expect(codex).toContain('read-only'); expect(codex).toContain('shell_tool'); expect(codex).toContain('plugins'); expect(codex).toContain('computer_use'); expect(codex).not.toContain('--dangerously-bypass-approvals-and-sandbox');
    const claude = providerArguments('claude', '', schema); expect(claude).toContain('--safe-mode'); expect(claude[claude.indexOf('--tools') + 1]).toBe(''); expect(claude).toContain('--strict-mcp-config'); expect(claude).not.toContain('--dangerously-skip-permissions');
    vi.stubEnv('OPENAI_API_KEY', 'do-not-forward'); vi.stubEnv('ANTHROPIC_API_KEY', 'do-not-forward'); vi.stubEnv('NODE_OPTIONS', 'do-not-forward');
    expect(providerEnvironment()).not.toHaveProperty('OPENAI_API_KEY'); expect(providerEnvironment()).not.toHaveProperty('ANTHROPIC_API_KEY'); expect(providerEnvironment()).not.toHaveProperty('NODE_OPTIONS');
    vi.stubEnv('CLAUDE_CONFIG_DIR', '/synthetic/provider-profile'); expect(providerEnvironment().CLAUDE_CONFIG_DIR).toBe('/synthetic/provider-profile');
  });
  it('bounds child output and cancels actual provider-style processes', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-child-')); roots.push(cwd);
    await expect(runProcess(process.execPath, ['-e', 'process.stdout.write("x".repeat(4096))'], cwd, '', AbortSignal.timeout(5000), 128)).rejects.toThrow('output exceeded');
    await expect(runProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], cwd, '', AbortSignal.timeout(50))).rejects.toThrow('Cancelled');
  });
  it('preserves multibyte provider text across stdout chunks', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-unicode-')); roots.push(cwd);
    const result = await runProcess(process.execPath, ['-e', 'process.stdout.write(Buffer.from([0xe2,0x82]));setTimeout(()=>process.stdout.write(Buffer.from([0xac])),20)'], cwd, '', AbortSignal.timeout(5000));
    expect(result.stdout).toBe('€');
  });
  it('normalizes both provider formats and rejects errors and malformed answers', () => {
    expect(parseAnswer('codex', JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: JSON.stringify(answer()) } })).answer).toBe('Grounded answer');
    expect(parseAnswer('codex', [JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'Checking the supplied evidence.' } }), JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: JSON.stringify(answer()) } })].join('\n')).answer).toBe('Grounded answer');
    expect(parseAnswer('claude', JSON.stringify({ structured_output: answer(), is_error: false })).answer).toBe('Grounded answer');
    expect(() => parseAnswer('codex', JSON.stringify({ type: 'turn.failed' }))).toThrow('could not answer');
    expect(() => parseAnswer('claude', JSON.stringify({ is_error: true }))).toThrow('could not answer');
    expect(() => parseAnswer('claude', JSON.stringify({ structured_output: { answer: 'x' } }))).toThrow('invalid structured');
    expect(() => parseAnswer('codex', JSON.stringify({ type: 'item.completed', item: { type: 'command_execution' } }))).toThrow('unsupported tool');
  });
  it('has a serializable provider schema and rejects command-bearing model names', () => {
    expect(JSON.parse(JSON.stringify(agentResponseJsonSchema)).additionalProperties).toBe(false);
    expect(responseSchema.parse(answer()).action).toBeNull();
    const { broker, request } = setup(); expect(() => broker.send({ ...request, model: '--exec $(id)' })).toThrow();
    expect(() => broker.send({ ...request, model: '--dangerously-skip-permissions' })).toThrow();
  });
});
describe('case chat orchestration', () => {
  it('persists conversation and exact provider choice without exposing case data by default', async () => {
    const { broker, chat, request, invoke } = setup(); broker.send(request); const done = await finished(broker, chat.id);
    expect(done.messages).toHaveLength(2); expect(done.messages[1].status).toBe('completed'); expect(done.messages[1].provider).toBe('codex');
    const prompt = invoke.mock.calls[0][0].prompt; expect(prompt).not.toContain('case-a private brief'); expect(prompt).not.toContain('case-b private brief');
  });
  it('shares only the selected case when explicitly requested', async () => {
    const { broker, chat, request, invoke, root } = setup(); broker.send({ ...request, includeCase: true }); const done = await finished(broker, chat.id);
    expect(invoke.mock.calls[0][0].prompt).toContain('case-a private brief'); expect(invoke.mock.calls[0][0].prompt).not.toContain('case-b private brief');
    expect(() => broker.send({ ...request, caseId: 'case-b' })).toThrow();
    const message = done.messages[1]; expect(message.contextHash).toMatch(/^[a-f0-9]{64}$/);
    const retained = JSON.parse(fs.readFileSync(path.join(root, `.trace/chat-context/${message.id}.json`), 'utf8'));
    expect(retained.snapshot.text).toContain('case-a private brief'); expect(retained.snapshot.text).not.toContain('case-b private brief');
  });
  it('keeps models isolated and excludes case-assisted history when sharing is off', async () => {
    const invoke = vi.fn<typeof invokeProvider>(async () => answer('Private case-derived conclusion'));
    const { broker, chat, request } = setup(invoke); broker.send({ ...request, includeCase: true }); await finished(broker, chat.id);
    broker.send({ ...request, provider: 'claude', model: 'other-model', message: 'Generic question', includeCase: false }); await finished(broker, chat.id);
    expect(invoke.mock.calls[1][0].provider).toBe('claude'); expect(invoke.mock.calls[1][0].model).toBe('other-model');
    expect(invoke.mock.calls[1][0].prompt).not.toContain('Private case-derived conclusion'); expect(invoke.mock.calls[1][0].prompt).not.toContain('case-a private brief');
  });
  it('rejects case tool use without permission', async () => {
    const { broker, chat, request, root } = setup(vi.fn<typeof invokeProvider>(async () => ({ ...answer(), action: { type: 'search_case', query: 'evidence' } })));
    broker.send(request); const done = await finished(broker, chat.id); expect(done.messages[1].status).toBe('failed'); expect(done.messages[1].error).toContain('sharing is disabled'); expect(fs.existsSync(path.join(root, '.trace/recon'))).toBe(false);
  });
  it('reads sources through bounded tools and validates supplied citations', async () => {
    let step = 0;
    const invoke = vi.fn<typeof invokeProvider>(async () => ++step === 1 ? { ...answer(), action: { type: 'read_source' as const, sourceId: 'source-one' } } : { ...answer(), citations: ['source-one'] });
    const { broker, chat, request } = setup(invoke); broker.send({ ...request, includeCase: true }); const done = await finished(broker, chat.id);
    expect(done.messages[1].status).toBe('completed'); expect(done.messages[1].citations).toEqual(['source-one']); expect(done.messages[1].activity).toContain('Read source: source-one');
    expect(invoke.mock.calls[1][0].prompt).toContain('case-a certificate evidence');
  });
  it('rejects invented citations', async () => {
    const { broker, chat, request } = setup(vi.fn<typeof invokeProvider>(async () => ({ ...answer(), citations: ['not-provided'] })));
    broker.send({ ...request, includeCase: true }); const done = await finished(broker, chat.id); expect(done.messages[1].error).toContain('source that was not provided');
  });
  it('stages proposals without mutating graph and enforces domain scope', async () => {
    let step = 0;
    const { broker, chat, request, root } = setup(vi.fn<typeof invokeProvider>(async () => ++step === 1 ? { ...answer(), action: { type: 'propose_findings' as const, proposal: { target: 'example.com', domains: ['www.example.com'], summary: 'Unverified test proposal' } } } : answer('Proposal awaits review')));
    broker.send({ ...request, includeCase: true }); const done = await finished(broker, chat.id);
    expect(done.messages[1].proposalId).toBeTruthy(); expect(fs.readdirSync(path.join(root, 'entities'))).toHaveLength(0); expect(fs.existsSync(path.join(root, 'relationships'))).toBe(false);
    expect(fs.readdirSync(path.join(root, '.trace/recon/proposals'))).toHaveLength(1);
    const outside = setup(vi.fn<typeof invokeProvider>(async () => ({ ...answer(), action: { type: 'propose_findings', proposal: { target: 'evil.org', domains: ['www.evil.org'], summary: 'Reject' } } })));
    outside.broker.send({ ...outside.request, includeCase: true }); expect((await finished(outside.broker, outside.chat.id)).messages[1].error).toContain('outside');
  });
  it('stops at the tool budget rather than looping indefinitely', async () => {
    const invoke = vi.fn<typeof invokeProvider>(async () => ({ ...answer(), action: { type: 'search_case' as const, query: 'evidence' } }));
    const { broker, chat, request } = setup(invoke); broker.send({ ...request, includeCase: true }); const done = await finished(broker, chat.id);
    expect(invoke).toHaveBeenCalledTimes(4); expect(done.messages[1].error).toContain('tool limit');
  });
  it('cancels active work and does not silently fail over', async () => {
    const invoke = vi.fn<typeof invokeProvider>(async ({ signal }) => new Promise<AgentAnswer>((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true })));
    const { broker, chat, request } = setup(invoke); broker.send(request); expect(() => broker.send(request)).toThrow('already'); broker.cancel('case-a', chat.id);
    expect((await finished(broker, chat.id)).messages[1].status).toBe('cancelled'); expect(invoke).toHaveBeenCalledTimes(1);
  });
  it('marks interrupted responses failed on restart and rejects symlink context', () => {
    const { broker, chat, root, workspace } = setup();
    const file = path.join(root, `.trace/chat/${chat.id}.json`); const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    data.messages.push({ id: 'interrupted', role: 'assistant', content: '', createdAt: new Date().toISOString(), status: 'running', citations: [], activity: [], includeCase: false }); fs.writeFileSync(file, JSON.stringify(data));
    expect(broker.list('case-a')[0].messages[0].status).toBe('failed');
    fs.symlinkSync(path.join(workspace, 'projects/case-b/project.md'), path.join(root, 'sources/escape.md')); expect(() => snapshot(root)).toThrow('Symlink');
  });
  it('rechecks current domain scope before staging a delayed proposal', async () => {
    const { workspace, request, chat, root } = setup(); let scope = ['example.com']; let release!: (value: AgentAnswer) => void;
    const broker = new AgentBroker({ workspace: () => workspace, profile: path.join(workspace, 'profile'), scope: () => scope, invoke: async () => new Promise(resolve => { release = resolve; }) });
    broker.send({ ...request, includeCase: true }); scope = [];
    release({ ...answer(), action: { type: 'propose_findings', proposal: { target: 'example.com', domains: ['www.example.com'], summary: 'Must be rejected after scope changed' } } });
    expect((await finished(broker, chat.id)).messages[1].error).toContain('current allowed domains');
    expect(fs.existsSync(path.join(root, '.trace/recon/proposals'))).toBe(false);
  });
  it('marks truncated snapshots honestly and keeps category search coverage balanced', () => {
    const { root } = setup();
    for (let index = 0; index < 10; index++) fs.writeFileSync(path.join(root, `sources/large-${index}.md`), 'x'.repeat(20000));
    fs.writeFileSync(path.join(root, 'entities/domain.md'), 'entity evidence after large sources');
    expect(snapshot(root).truncated).toBe(true);
    expect(searchCase(root, 'entity evidence').some(record => record.category === 'entities')).toBe(true);
  });
});
