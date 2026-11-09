import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { WorkspaceReader } from '../core/fsWorkspace';
import { InvestigationIndex } from '../core/investigation';
import { TOOL_DEFINITIONS, callTool } from '../mcp/tools';
import { createMcpHandler } from '../mcp/server';
import { createSampleProject } from '../services/storage/sampleData';
import {
  serializeEntityFile,
  serializeNoteFile,
  serializeProjectFile,
  serializeRelationshipFile,
  serializeSourceFile,
} from '../services/markdownParser';
import type { ProjectData } from '../types';

let ws: string;
let outside: string;
let sample: ProjectData;

/** Hash of every file under a directory — used to prove nothing was written. */
function snapshot(dir: string): string {
  const h = crypto.createHash('sha256');
  const walk = (d: string) => {
    for (const name of fs.readdirSync(d).sort()) {
      const p = path.join(d, name);
      const st = fs.lstatSync(p);
      h.update(p + st.mtimeMs);
      if (st.isDirectory()) walk(p);
      else if (st.isFile()) h.update(fs.readFileSync(p));
    }
  };
  walk(dir);
  return h.digest('hex');
}

function writeProject(root: string, data: ProjectData) {
  const dir = path.join(root, 'projects', data.project.id);
  for (const sub of ['entities', 'relationships', 'sources', 'notes']) fs.mkdirSync(path.join(dir, sub), { recursive: true });
  fs.writeFileSync(path.join(dir, 'project.md'), serializeProjectFile(data.project));
  data.entities.forEach((e) => fs.writeFileSync(path.join(dir, 'entities', `${e.id}.md`), serializeEntityFile(e)));
  data.relationships.forEach((r) => fs.writeFileSync(path.join(dir, 'relationships', `${r.id}.md`), serializeRelationshipFile(r)));
  data.sources.forEach((s) => fs.writeFileSync(path.join(dir, 'sources', `${s.id}.md`), serializeSourceFile(s)));
  data.notes.forEach((n) => fs.writeFileSync(path.join(dir, 'notes', `${n.id}.md`), serializeNoteFile(n)));
}

beforeAll(() => {
  ws = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-mcp-'));
  outside = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-outside-'));
  sample = createSampleProject();
  writeProject(ws, sample);
  // A project directory that is a symlink pointing outside the workspace.
  fs.mkdirSync(path.join(outside, 'secret'), { recursive: true });
  fs.writeFileSync(path.join(outside, 'secret', 'project.md'), '---\nid: secret\ntype: project\nname: Secret\ncreated_at: x\nupdated_at: x\n---\n');
  fs.symlinkSync(path.join(outside, 'secret'), path.join(ws, 'projects', 'escape'));
  // A symlinked entity file inside a legit project is ignored too.
  fs.writeFileSync(path.join(outside, 'leak.md'), '---\nid: leak\ntype: person\nname: LEAKED\ncreated_at: x\nupdated_at: x\n---\n');
  fs.symlinkSync(path.join(outside, 'leak.md'), path.join(ws, 'projects', sample.project.id, 'entities', 'leak.md'));
});

afterAll(() => {
  fs.rmSync(ws, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
});

const reader = () => new WorkspaceReader(ws);
const call = (name: string, args?: unknown) => callTool(reader(), name, args);

describe('WorkspaceReader (read-only, sandboxed)', () => {
  it('lists real projects and skips symlinked escapes', () => {
    const ids = reader().listProjects().map((p) => p.id);
    expect(ids).toEqual([sample.project.id]);
  });

  it('loads a project but ignores symlinked files', () => {
    const data = reader().loadProject(sample.project.id)!;
    expect(data.entities.length).toBe(sample.entities.length);
    expect(data.entities.some((e) => e.name === 'LEAKED')).toBe(false);
  });

  it('rejects traversal and malformed ids', () => {
    for (const bad of ['..', '.', '../outside', 'a/b', '/etc', 'escape', '', 'x'.repeat(200)]) {
      expect(reader().loadProject(bad as string)).toBeNull();
    }
  });
});

describe('MCP tools', () => {
  it('exposes exactly the eight read-only tools', () => {
    expect(TOOL_DEFINITIONS.map((t) => t.name).sort()).toEqual(
      ['find_paths', 'get_entity', 'get_entity_neighbors', 'get_evidence', 'get_project_summary', 'get_relationship', 'list_projects', 'search_entities'].sort(),
    );
    for (const t of TOOL_DEFINITIONS) {
      expect(t.annotations.readOnlyHint).toBe(true);
      expect(t.annotations.destructiveHint).toBe(false);
      expect(t.name).not.toMatch(/create|update|delete|set|add|write|remove/);
    }
  });

  it('lists projects and summarises one', async () => {
    const list = await call('list_projects');
    expect(list.ok).toBe(true);
    const s: any = (await call('get_project_summary', { project_id: sample.project.id }));
    expect(s.ok).toBe(true);
    expect(s.data.counts.entities).toBe(sample.entities.length);
    expect(s.data.counts.relationships).toBe(sample.relationships.length);
    expect(Object.keys(s.data.relationships_by_evidence_class)).toEqual(['observed', 'hypothesis', 'disproven']);
  });

  it('searches, details, neighbours, relationships and evidence', async () => {
    const pid = sample.project.id;
    const rel = sample.relationships.find((r) => r.evidence.length > 0) ?? sample.relationships[0];
    const ent = sample.entities.find((e) => e.id === rel.source_entity)!;

    const search: any = await call('search_entities', { project_id: pid, query: ent.name.slice(0, 4) });
    expect(search.data.results.some((r: any) => r.id === ent.id)).toBe(true);

    const det: any = await call('get_entity', { project_id: pid, entity_id: ent.id });
    expect(det.data).toMatchObject({ id: ent.id, name: ent.name, provenance: { origin: 'manual' } });

    const nb: any = await call('get_entity_neighbors', { project_id: pid, entity_id: ent.id, depth: 1 });
    expect(nb.data.relationships.length).toBeGreaterThan(0);
    for (const r of nb.data.relationships) {
      const ids = new Set([ent.id, ...nb.data.nodes.map((n: any) => n.id)]);
      expect(ids.has(r.source) && ids.has(r.target)).toBe(true);
    }

    const rd: any = await call('get_relationship', { project_id: pid, relationship_id: rel.id });
    expect(rd.data.source_entity.id).toBe(rel.source_entity);
    expect(rd.data.evidence.length).toBe(rel.evidence.length);

    const ev: any = await call('get_evidence', { project_id: pid, entity_id: ent.id });
    expect(ev.data.entity.id).toBe(ent.id);
    expect(await call('get_evidence', { project_id: pid })).toMatchObject({ ok: false });
    expect(await call('get_evidence', { project_id: pid, entity_id: ent.id, relationship_id: rel.id })).toMatchObject({ ok: false });
  });

  it('finds shortest paths between entities', async () => {
    const rel = sample.relationships[0];
    const p: any = await call('find_paths', { project_id: sample.project.id, from_entity_id: rel.source_entity, to_entity_id: rel.target_entity });
    expect(p.data.found).toBe(true);
    expect(p.data.length).toBe(1);
    expect(p.data.paths[0].nodes[0].id).toBe(rel.source_entity);
  });

  it('handles malformed requests and missing data safely', async () => {
    expect(await call('get_entity', { project_id: '../../etc', entity_id: 'passwd' })).toMatchObject({ ok: false });
    expect(await call('get_entity', { project_id: sample.project.id, entity_id: 'nope' })).toMatchObject({ ok: false, error: 'Entity not found: nope' });
    expect(await call('get_project_summary', { project_id: 'missing' })).toMatchObject({ ok: false });
    expect(await call('get_project_summary', 'string-args')).toMatchObject({ ok: false });
    expect(await call('get_project_summary', { project_id: sample.project.id, extra: 1 })).toMatchObject({ ok: false });
    expect(await call('search_entities', { project_id: sample.project.id, query: 5 })).toMatchObject({ ok: false });
    expect(await call('delete_entity', { project_id: sample.project.id })).toMatchObject({ ok: false });
  });

  it('never modifies the workspace', async () => {
    const before = snapshot(ws);
    const pid = sample.project.id;
    for (const t of TOOL_DEFINITIONS) await call(t.name, { project_id: pid });
    await call('search_entities', { project_id: pid, query: '' });
    await call('find_paths', { project_id: pid, from_entity_id: sample.entities[0].id, to_entity_id: sample.entities[1].id });
    expect(snapshot(ws)).toBe(before);
  });
});

describe('MCP JSON-RPC handler', () => {
  const handle = createMcpHandler(new WorkspaceReader(''), '0.0.0-test');

  it('initialises and advertises tools only', async () => {
    const r: any = await handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } });
    expect(r.result.protocolVersion).toBe('2025-06-18');
    expect(Object.keys(r.result.capabilities)).toEqual(['tools']);
  });

  it('returns protocol errors for bad input', async () => {
    expect(await handle({ jsonrpc: '1.0', id: 2, method: 'x' } as any)).toMatchObject({ error: { code: -32600 } });
    expect(await handle({ jsonrpc: '2.0', id: 3, method: 'resources/read' })).toMatchObject({ error: { code: -32601 } });
    expect(await handle({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: {} })).toMatchObject({ error: { code: -32602 } });
    expect(await handle({ jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull();
  });

  it('wraps tool errors as isError results', async () => {
    const r: any = await handle({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'get_entity', arguments: { project_id: '..', entity_id: 'x' } } });
    expect(r.result.isError).toBe(true);
  });
});

describe('InvestigationIndex', () => {
  it('handles relationships with dangling endpoints', () => {
    const data: ProjectData = {
      ...sample,
      relationships: [...sample.relationships, { ...sample.relationships[0], id: 'dangling', target_entity: 'ghost' }],
    };
    const idx = new InvestigationIndex(data);
    expect(idx.summary().counts.relationships).toBe(sample.relationships.length + 1);
    expect(idx.findPaths(sample.relationships[0].source_entity, 'ghost')).toBeNull();
  });
});
