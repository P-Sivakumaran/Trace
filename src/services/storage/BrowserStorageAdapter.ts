import JSZip from 'jszip';
import {
  Entity,
  GraphLayout,
  Note,
  Project,
  ProjectData,
  ProjectRemoveMode,
  ProjectSummary,
  Relationship,
  SearchResult,
  Source,
  StorageChangeEvent,
  StorageUsage,
  Workspace,
} from '@/types';
import { IStorageService } from './IStorageService';
import { createSampleProject } from './sampleData';
import {
  parseEntityFile,
  parseNoteFile,
  parseProjectFile,
  parseRelationshipFile,
  parseSourceFile,
  serializeEntityFile,
  serializeNoteFile,
  serializeProjectFile,
  serializeRelationshipFile,
  serializeSourceFile,
} from '../markdownParser';
import { sqliteIndexService } from '../sqliteIndex';
import { applyImportTarget, readCaseBundle, zipToBundleFiles, type CaseBundle, type ImportedCase } from '../import/caseBundle';

const STORAGE_KEY_PREFIX = 'trace_osint_';
const KEY_WORKSPACE = `${STORAGE_KEY_PREFIX}workspace`;
const KEY_PROJECT_PREFIX = `${STORAGE_KEY_PREFIX}project_`;
const KEY_GRAPH_PREFIX = `${STORAGE_KEY_PREFIX}graph_`;

export class BrowserStorageAdapter implements IStorageService {
  private listeners: ((event: StorageChangeEvent) => void)[] = [];
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;

  isDesktop(): boolean {
    return false;
  }

  private async ensureInitialized(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        const sample = createSampleProject();
        const wsRaw = localStorage.getItem(KEY_WORKSPACE);
        let hasValidProject = false;

        // Ensure Getting Started sample project is ALWAYS seeded for every user
        const existingGettingStarted = this.loadProjectDataFromStorage(sample.project.id);
        if (!existingGettingStarted) {
          this.saveProjectDataToStorage(sample);
        }

        if (wsRaw) {
          try {
            const ws: Workspace = JSON.parse(wsRaw);
            const targetId = ws.activeProjectId || sample.project.id;
            const activeData = this.loadProjectDataFromStorage(targetId);
            if (activeData) {
              hasValidProject = true;
              this.isInitialized = true;
              // Background non-blocking SQLite indexing
              sqliteIndexService.init().then(() => {
                sqliteIndexService.rebuildIndex(activeData);
              }).catch((err) => {
                console.warn('Background SQLite indexing error:', err);
              });
            }
          } catch (e) {
            console.error('Error parsing existing workspace:', e);
          }
        }

        if (!hasValidProject) {
          const now = new Date().toISOString();
          const initialWorkspace: Workspace = {
            id: 'default-workspace',
            name: 'Browser Local Workspace',
            activeProjectId: sample.project.id,
            created_at: now,
            updated_at: now,
          };

          localStorage.setItem(KEY_WORKSPACE, JSON.stringify(initialWorkspace));
          this.saveProjectDataToStorage(sample);
          this.isInitialized = true;

          sqliteIndexService.init().then(() => {
            sqliteIndexService.rebuildIndex(sample);
          }).catch((err) => {
            console.warn('Background SQLite indexing error:', err);
          });
        }
      } catch (err) {
        console.error('ensureInitialized unexpected error:', err);
      } finally {
        this.isInitialized = true;
      }
    })();

    return this.initPromise;
  }

  private saveProjectDataToStorage(data: ProjectData): void {
    const serialized = {
      project: serializeProjectFile(data.project),
      entities: data.entities.map((e) => ({ id: e.id, raw: serializeEntityFile(e) })),
      relationships: data.relationships.map((r) => ({ id: r.id, raw: serializeRelationshipFile(r) })),
      sources: data.sources.map((s) => ({ id: s.id, raw: serializeSourceFile(s) })),
      notes: data.notes.map((n) => ({ id: n.id, raw: serializeNoteFile(n) })),
    };
    localStorage.setItem(`${KEY_PROJECT_PREFIX}${data.project.id}`, JSON.stringify(serialized));
  }

  private loadProjectDataFromStorage(projectId: string): ProjectData | null {
    const raw = localStorage.getItem(`${KEY_PROJECT_PREFIX}${projectId}`);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw);
      const project = parseProjectFile(parsed.project, projectId);
      const entities = (parsed.entities || []).map((e: { id: string; raw: string }) =>
        parseEntityFile(e.raw, e.id)
      );
      const relationships = (parsed.relationships || []).map((r: { id: string; raw: string }) =>
        parseRelationshipFile(r.raw, r.id)
      );
      const sources = (parsed.sources || []).map((s: { id: string; raw: string }) =>
        parseSourceFile(s.raw, s.id)
      );
      const notes = (parsed.notes || []).map((n: { id: string; raw: string }) =>
        parseNoteFile(n.raw, n.id)
      );

      return { project, entities, relationships, sources, notes };
    } catch (err) {
      console.error('Failed to parse project data:', err);
      return null;
    }
  }

  async getWorkspace(): Promise<Workspace> {
    await this.ensureInitialized();
    const raw = localStorage.getItem(KEY_WORKSPACE);
    if (!raw) {
      throw new Error('Workspace not initialized');
    }
    return JSON.parse(raw);
  }

  async saveWorkspace(workspace: Workspace): Promise<void> {
    workspace.updated_at = new Date().toISOString();
    localStorage.setItem(KEY_WORKSPACE, JSON.stringify(workspace));
    this.notifyListeners({ type: 'update', targetType: 'project' });
  }

  async listProjects(): Promise<ProjectSummary[]> {
    await this.ensureInitialized();
    const summaries: ProjectSummary[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(KEY_PROJECT_PREFIX)) {
        const projectId = key.substring(KEY_PROJECT_PREFIX.length);
        const data = this.loadProjectDataFromStorage(projectId);
        if (data) {
          summaries.push({
            id: data.project.id,
            name: data.project.name,
            entityCount: data.entities.length,
            relationshipCount: data.relationships.length,
            sourceCount: data.sources.length,
            noteCount: data.notes.length,
            updated_at: data.project.updated_at,
          });
        }
      }
    }

    return summaries.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }

  async createProject(name: string, description?: string, id?: string): Promise<Project> {
    await this.ensureInitialized();
    const now = new Date().toISOString();
    const projectId = id || `project-${Date.now().toString(36)}`;

    const project: Project = {
      id: projectId,
      type: 'project',
      name,
      created_at: now,
      updated_at: now,
      markdownBody: `# ${name}\n\n## Objective\n\n${description || 'Document investigation goals and scope.'}\n\n## Notes\n\nInitial findings...`,
    };

    const data: ProjectData = {
      project,
      entities: [],
      relationships: [],
      sources: [],
      notes: [],
    };

    this.saveProjectDataToStorage(data);
    sqliteIndexService.rebuildIndex(data);

    // Switch active project
    const ws = await this.getWorkspace();
    ws.activeProjectId = projectId;
    await this.saveWorkspace(ws);

    this.notifyListeners({ type: 'create', targetType: 'project', targetId: projectId });
    return project;
  }

  async getProject(id: string): Promise<ProjectData | null> {
    await this.ensureInitialized();
    return this.loadProjectDataFromStorage(id);
  }

  async saveProject(project: Project): Promise<void> {
    const data = await this.getProject(project.id);
    if (!data) return;

    data.project = {
      ...project,
      updated_at: new Date().toISOString(),
    };

    this.saveProjectDataToStorage(data);
    this.notifyListeners({ type: 'update', targetType: 'project', targetId: project.id });
  }

  async getStorageUsage(): Promise<StorageUsage> {
    await this.ensureInitialized();
    // localStorage stores UTF-16: two bytes per character, keys included.
    const bytesOf = (key: string) => (key.length + (localStorage.getItem(key) ?? '').length) * 2;
    const projects: StorageUsage['projects'] = [];
    let other = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key.startsWith(KEY_PROJECT_PREFIX)) {
        const id = key.substring(KEY_PROJECT_PREFIX.length);
        const layout = localStorage.getItem(`${KEY_GRAPH_PREFIX}${id}`) ? bytesOf(`${KEY_GRAPH_PREFIX}${id}`) : 0;
        projects.push({ id, name: this.loadProjectDataFromStorage(id)?.project.name || id, bytes: bytesOf(key) + layout });
      } else if (!key.startsWith(KEY_GRAPH_PREFIX)) {
        other += bytesOf(key);
      }
    }
    projects.sort((a, b) => b.bytes - a.bytes);
    const projectsBytes = projects.reduce((n, p) => n + p.bytes, 0);
    let browserUsageBytes: number | undefined;
    let browserQuotaBytes: number | undefined;
    try {
      const est = await navigator.storage?.estimate?.();
      browserUsageBytes = est?.usage;
      browserQuotaBytes = est?.quota;
    } catch {
      /* estimate unavailable */
    }
    return {
      kind: 'browser',
      location: 'Browser local storage',
      projects,
      projectsBytes,
      removedBytes: 0,
      toolsBytes: 0,
      pythonBytes: 0,
      totalBytes: projectsBytes + other,
      browserUsageBytes,
      browserQuotaBytes,
    };
  }

  async deleteProject(id: string, _mode?: ProjectRemoveMode): Promise<void> {
    localStorage.removeItem(`${KEY_PROJECT_PREFIX}${id}`);
    localStorage.removeItem(`${KEY_GRAPH_PREFIX}${id}`);

    const ws = await this.getWorkspace();
    if (ws.activeProjectId === id) {
      const remaining = await this.listProjects();
      ws.activeProjectId = remaining.length > 0 ? remaining[0].id : undefined;
      await this.saveWorkspace(ws);
    }

    this.notifyListeners({ type: 'delete', targetType: 'project', targetId: id });
  }

  async saveEntity(projectId: string, entity: Entity): Promise<void> {
    const data = await this.getProject(projectId);
    if (!data) return;

    const idx = data.entities.findIndex((e) => e.id === entity.id);
    entity.updated_at = new Date().toISOString();

    if (idx >= 0) {
      data.entities[idx] = entity;
    } else {
      data.entities.push(entity);
    }

    this.saveProjectDataToStorage(data);
    sqliteIndexService.indexEntity(projectId, entity);
    this.notifyListeners({ type: 'update', targetType: 'entity', targetId: entity.id });
  }

  async deleteEntity(projectId: string, entityId: string): Promise<void> {
    const data = await this.getProject(projectId);
    if (!data) return;

    data.entities = data.entities.filter((e) => e.id !== entityId);
    // Also remove cascade relationships connected to this entity
    const removedRelIds: string[] = [];
    data.relationships = data.relationships.filter((r) => {
      if (r.source_entity === entityId || r.target_entity === entityId) {
        removedRelIds.push(r.id);
        return false;
      }
      return true;
    });

    this.saveProjectDataToStorage(data);
    sqliteIndexService.removeDoc(entityId);
    for (const relId of removedRelIds) {
      sqliteIndexService.removeDoc(relId);
    }
    this.notifyListeners({ type: 'delete', targetType: 'entity', targetId: entityId });
  }

  async saveRelationship(projectId: string, rel: Relationship): Promise<void> {
    const data = await this.getProject(projectId);
    if (!data) return;

    const idx = data.relationships.findIndex((r) => r.id === rel.id);
    if (idx >= 0) {
      data.relationships[idx] = rel;
    } else {
      data.relationships.push(rel);
    }

    this.saveProjectDataToStorage(data);
    sqliteIndexService.indexRelationship(projectId, rel);
    this.notifyListeners({ type: 'update', targetType: 'relationship', targetId: rel.id });
  }

  async deleteRelationship(projectId: string, relId: string): Promise<void> {
    const data = await this.getProject(projectId);
    if (!data) return;

    data.relationships = data.relationships.filter((r) => r.id !== relId);
    this.saveProjectDataToStorage(data);
    sqliteIndexService.removeDoc(relId);
    this.notifyListeners({ type: 'delete', targetType: 'relationship', targetId: relId });
  }

  async saveSource(projectId: string, source: Source): Promise<void> {
    const data = await this.getProject(projectId);
    if (!data) return;

    const idx = data.sources.findIndex((s) => s.id === source.id);
    if (idx >= 0) {
      data.sources[idx] = source;
    } else {
      data.sources.push(source);
    }

    this.saveProjectDataToStorage(data);
    sqliteIndexService.indexSource(projectId, source);
    this.notifyListeners({ type: 'update', targetType: 'source', targetId: source.id });
  }

  async deleteSource(projectId: string, sourceId: string): Promise<void> {
    const data = await this.getProject(projectId);
    if (!data) return;

    data.sources = data.sources.filter((s) => s.id !== sourceId);
    // Remove references to this source in relationships
    const touchedRels: Relationship[] = [];
    data.relationships.forEach((rel) => {
      if (rel.evidence.includes(sourceId)) {
        rel.evidence = rel.evidence.filter((e) => e !== sourceId);
        touchedRels.push(rel);
      }
    });

    this.saveProjectDataToStorage(data);
    sqliteIndexService.removeDoc(sourceId);
    for (const rel of touchedRels) {
      sqliteIndexService.indexRelationship(projectId, rel);
    }
    this.notifyListeners({ type: 'delete', targetType: 'source', targetId: sourceId });
  }

  async saveNote(projectId: string, note: Note): Promise<void> {
    const data = await this.getProject(projectId);
    if (!data) return;

    const idx = data.notes.findIndex((n) => n.id === note.id);
    note.updated_at = new Date().toISOString();

    if (idx >= 0) {
      data.notes[idx] = note;
    } else {
      data.notes.push(note);
    }

    this.saveProjectDataToStorage(data);
    sqliteIndexService.indexNote(projectId, note);
    this.notifyListeners({ type: 'update', targetType: 'note', targetId: note.id });
  }

  async deleteNote(projectId: string, noteId: string): Promise<void> {
    const data = await this.getProject(projectId);
    if (!data) return;

    data.notes = data.notes.filter((n) => n.id !== noteId);
    this.saveProjectDataToStorage(data);
    sqliteIndexService.removeDoc(noteId);
    this.notifyListeners({ type: 'delete', targetType: 'note', targetId: noteId });
  }

  async getGraphLayout(projectId: string): Promise<GraphLayout> {
    const raw = localStorage.getItem(`${KEY_GRAPH_PREFIX}${projectId}`);
    if (!raw) return { positions: {} };
    try {
      return JSON.parse(raw);
    } catch {
      return { positions: {} };
    }
  }

  async saveGraphLayout(projectId: string, layout: GraphLayout): Promise<void> {
    localStorage.setItem(`${KEY_GRAPH_PREFIX}${projectId}`, JSON.stringify(layout));
  }

  async search(projectId: string, query: string): Promise<SearchResult[]> {
    await this.ensureInitialized();
    return sqliteIndexService.search(projectId, query);
  }

  async rebuildIndex(projectId: string): Promise<void> {
    await this.ensureInitialized();
    const data = await this.getProject(projectId);
    if (data) {
      sqliteIndexService.rebuildIndex(data);
      this.notifyListeners({ type: 'reload', targetType: 'project', targetId: projectId });
    }
  }

  async exportProjectZip(projectId: string): Promise<Blob> {
    const data = await this.getProject(projectId);
    if (!data) throw new Error('Project not found');

    const zip = new JSZip();
    const root = zip.folder(`projects/${data.project.id}`);
    if (!root) throw new Error('Zip creation failed');

    // 1. project.md
    root.file('project.md', serializeProjectFile(data.project));

    // 2. graph-layout.json
    const layout = await this.getGraphLayout(projectId);
    root.file('graph-layout.json', JSON.stringify(layout, null, 2));

    // 3. entities/
    const entFolder = root.folder('entities');
    for (const ent of data.entities) {
      entFolder?.file(`${ent.id}.md`, serializeEntityFile(ent));
    }

    // 4. relationships/
    const relFolder = root.folder('relationships');
    for (const rel of data.relationships) {
      relFolder?.file(`${rel.id}.md`, serializeRelationshipFile(rel));
    }

    // 5. sources/
    const srcFolder = root.folder('sources');
    for (const src of data.sources) {
      srcFolder?.file(`${src.id}.md`, serializeSourceFile(src));
    }

    // 6. notes/
    const noteFolder = root.folder('notes');
    for (const note of data.notes) {
      noteFolder?.file(`${note.id}.md`, serializeNoteFile(note));
    }

    return zip.generateAsync({ type: 'blob' });
  }

  async importProjectZip(file: File | ArrayBuffer): Promise<string> {
    const bundle = await readCaseBundle(await zipToBundleFiles(file), file instanceof File ? file.name.replace(/\.zip$/i, '') : 'archive');
    return (await this.importProjectBundle(bundle)).id;
  }

  /** Stores an incoming case as a new project; an existing id is never overwritten. */
  async importProjectBundle(incoming: CaseBundle): Promise<ImportedCase> {
    await this.ensureInitialized();
    const existing = (await this.listProjects()).map((p) => p.id);
    const { bundle, summary } = applyImportTarget(incoming, existing);
    const importedData: ProjectData = bundle.data;

    this.saveProjectDataToStorage(importedData);
    await this.saveGraphLayout(importedData.project.id, bundle.layout);
    sqliteIndexService.rebuildIndex(importedData);

    // Switch active project
    const ws = await this.getWorkspace();
    ws.activeProjectId = importedData.project.id;
    await this.saveWorkspace(ws);

    this.notifyListeners({ type: 'create', targetType: 'project', targetId: importedData.project.id });
    return summary;
  }

  async openInExplorer(projectId?: string): Promise<boolean> {
    if (projectId) {
      try {
        const blob = await this.exportProjectZip(projectId);
        const data = this.loadProjectDataFromStorage(projectId);
        const name = data?.project.name || 'project';
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_bundle.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
        return true;
      } catch (err) {
        console.error('Failed to export in browser:', err);
      }
    }
    return false;
  }

  async selectDirectory(): Promise<string | null> {
    return null;
  }

  onStorageChange(listener: (event: StorageChangeEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notifyListeners(event: StorageChangeEvent) {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('Storage change listener error:', err);
      }
    }
  }
}
