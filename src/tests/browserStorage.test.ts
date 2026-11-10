import { describe, it, expect, beforeEach } from 'vitest';
import { BrowserStorageAdapter } from '../services/storage/BrowserStorageAdapter';
import { Entity, Relationship, Source } from '../types';

describe('BrowserStorageAdapter', () => {
  beforeEach(() => {
    const store: Record<string, string> = {};
    (globalThis as any).localStorage = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = String(v); },
      removeItem: (k: string) => { delete store[k]; },
      clear: () => { for (const k in store) delete store[k]; },
      get length() { return Object.keys(store).length; },
      key: (i: number) => Object.keys(store)[i] ?? null,
    };
  });

  it('sets activeProjectId properly when creating a project without explicit id', async () => {
    const adapter = new BrowserStorageAdapter();
    const proj = await adapter.createProject('My Investigation');
    expect(proj.id).toBeDefined();

    const ws = await adapter.getWorkspace();
    expect(ws.activeProjectId).toBe(proj.id);
  });

  it('refuses an existing explicit case ID without replacing its contents', async () => {
    const adapter = new BrowserStorageAdapter();
    await adapter.createProject('Original case', '', 'same-id');
    await expect(adapter.createProject('Replacement case', '', 'same-id')).rejects.toThrow('already exists');
    expect((await adapter.getProject('same-id'))?.project.name).toBe('Original case');
  });

  it('cascade deletes connected relationships when an entity is deleted', async () => {
    const adapter = new BrowserStorageAdapter();
    const proj = await adapter.createProject('Cascade Project');

    const e1: Entity = {
      id: 'ent-1',
      name: 'Alpha Target',
      type: 'person',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      aliases: [],
      tags: [],
      attributes: {},
    };
    const e2: Entity = {
      id: 'ent-2',
      name: 'Beta Target',
      type: 'company',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      aliases: [],
      tags: [],
      attributes: {},
    };
    const rel: Relationship = {
      id: 'rel-1-2',
      source_entity: 'ent-1',
      target_entity: 'ent-2',
      type: 'director_of',
      directed: true,
      status: 'confirmed',
      confidence: 90,
      evidence: [],
      created_at: new Date().toISOString(),
    };

    await adapter.saveEntity(proj.id, e1);
    await adapter.saveEntity(proj.id, e2);
    await adapter.saveRelationship(proj.id, rel);

    let data = await adapter.getProject(proj.id);
    expect(data?.entities.length).toBe(2);
    expect(data?.relationships.length).toBe(1);

    // Deleting ent-1 should cascade delete rel-1-2
    await adapter.deleteEntity(proj.id, 'ent-1');
    data = await adapter.getProject(proj.id);
    expect(data?.entities.length).toBe(1);
    expect(data?.relationships.length).toBe(0);
  });

  it('prunes deleted source references from relationships', async () => {
    const adapter = new BrowserStorageAdapter();
    const proj = await adapter.createProject('Source Ref Project');

    const src: Source = {
      id: 'src-100',
      title: 'Leaked Registry',
      source_type: 'registry',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const rel: Relationship = {
      id: 'rel-1',
      source_entity: 'e1',
      target_entity: 'e2',
      type: 'co_owner',
      directed: false,
      status: 'supported',
      evidence: ['src-100', 'src-other'],
      created_at: new Date().toISOString(),
    };

    await adapter.saveSource(proj.id, src);
    await adapter.saveRelationship(proj.id, rel);

    await adapter.deleteSource(proj.id, 'src-100');

    const data = await adapter.getProject(proj.id);
    expect(data?.sources.find((s) => s.id === 'src-100')).toBeUndefined();
    const updatedRel = data?.relationships.find((r) => r.id === 'rel-1');
    expect(updatedRel?.evidence).toEqual(['src-other']);
  });

  it('updates activeProjectId to remaining project when active project is deleted', async () => {
    const adapter = new BrowserStorageAdapter();
    const proj1 = await adapter.createProject('Project 1', undefined, 'proj-1');
    const proj2 = await adapter.createProject('Project 2', undefined, 'proj-2');

    let ws = await adapter.getWorkspace();
    expect(ws.activeProjectId).toBe('proj-2');

    await adapter.deleteProject('proj-2');
    ws = await adapter.getWorkspace();
    expect(ws.activeProjectId).toBe('proj-1');
  });
});
