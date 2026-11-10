import JSZip from 'jszip';
import {
  Entity,
  GraphLayout,
  Note,
  Project,
  ProjectData,
  ProjectSummary,
  Relationship,
  SearchResult,
  Source,
  StorageChangeEvent,
  Workspace,
} from '@/types';
import { IStorageService } from './IStorageService';
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
import type { ReconApi } from '../recon/contracts';
import type { AgentApi } from '../agent/contracts';

declare global {
  interface Window {
    electronAPI?: {
      isDesktop: boolean;
      recon?: ReconApi;
      agent?: AgentApi;
      getWorkspace: () => Promise<Workspace>;
      saveWorkspace: (ws: Workspace) => Promise<void>;
      listProjects: () => Promise<ProjectSummary[]>;
      createProject: (name: string, description?: string, id?: string) => Promise<Project>;
      getProject: (id: string) => Promise<{
        projectRaw: string;
        entities: { id: string; raw: string }[];
        relationships: { id: string; raw: string }[];
        sources: { id: string; raw: string }[];
        notes: { id: string; raw: string }[];
      } | null>;
      saveProject: (raw: string) => Promise<void>;
      deleteProject: (id: string) => Promise<void>;
      saveEntity: (projectId: string, entityId: string, raw: string) => Promise<void>;
      deleteEntity: (projectId: string, entityId: string) => Promise<{ removedRelIds?: string[] } | void>;
      saveRelationship: (projectId: string, relId: string, raw: string) => Promise<void>;
      deleteRelationship: (projectId: string, relId: string) => Promise<void>;
      saveSource: (projectId: string, sourceId: string, raw: string) => Promise<void>;
      deleteSource: (projectId: string, sourceId: string) => Promise<void>;
      saveNote: (projectId: string, noteId: string, raw: string) => Promise<void>;
      deleteNote: (projectId: string, noteId: string) => Promise<void>;
      getGraphLayout: (projectId: string) => Promise<GraphLayout>;
      saveGraphLayout: (projectId: string, layout: GraphLayout) => Promise<void>;
      openInExplorer: (projectId?: string) => Promise<boolean>;
      importProjectZip: (buffer: ArrayBuffer) => Promise<string>;
      onStorageChange: (callback: (event: StorageChangeEvent) => void) => () => void;
      selectDirectory: () => Promise<string | null>;
      sendApiRequest?: (req: {
        url: string;
        method?: string;
        headers?: Record<string, string>;
        body?: string;
      }) => Promise<{
        success: boolean;
        status?: number;
        statusText?: string;
        headers?: Record<string, string>;
        data?: any;
        error?: string;
        durationMs?: number;
      }>;
      getVersion?: () => Promise<string>;
    };
  }
}

export class ElectronStorageAdapter implements IStorageService {
  isDesktop(): boolean {
    return true;
  }

  private get api() {
    if (!window.electronAPI) {
      throw new Error('Electron API is not available in browser mode');
    }
    return window.electronAPI;
  }

  async getWorkspace(): Promise<Workspace> {
    return this.api.getWorkspace();
  }

  async saveWorkspace(workspace: Workspace): Promise<void> {
    return this.api.saveWorkspace(workspace);
  }

  async listProjects(): Promise<ProjectSummary[]> {
    return this.api.listProjects();
  }

  async createProject(name: string, description?: string, id?: string): Promise<Project> {
    return this.api.createProject(name, description, id);
  }

  async getProject(id: string): Promise<ProjectData | null> {
    const rawData = await this.api.getProject(id);
    if (!rawData || !rawData.projectRaw) return null;

    const project = parseProjectFile(rawData.projectRaw, id);
    const entities = (rawData.entities || []).map((e) => parseEntityFile(e.raw, e.id));
    const relationships = (rawData.relationships || []).map((r) => parseRelationshipFile(r.raw, r.id));
    const sources = (rawData.sources || []).map((s) => parseSourceFile(s.raw, s.id));
    const notes = (rawData.notes || []).map((n) => parseNoteFile(n.raw, n.id));

    const projectData: ProjectData = {
      project,
      entities,
      relationships,
      sources,
      notes,
    };

    // Lazily populate SQLite search index in the background without blocking UI
    setTimeout(() => {
      sqliteIndexService.init().then(() => {
        sqliteIndexService.rebuildIndex(projectData);
      }).catch(() => {});
    }, 1500);

    return projectData;
  }

  async saveProject(project: Project): Promise<void> {
    const raw = serializeProjectFile(project);
    return this.api.saveProject(raw);
  }

  async deleteProject(id: string): Promise<void> {
    return this.api.deleteProject(id);
  }

  async saveEntity(projectId: string, entity: Entity): Promise<void> {
    const raw = serializeEntityFile(entity);
    await this.api.saveEntity(projectId, entity.id, raw);
    sqliteIndexService.indexEntity(projectId, entity);
  }

  async deleteEntity(projectId: string, entityId: string): Promise<void> {
    const res = await this.api.deleteEntity(projectId, entityId);
    sqliteIndexService.removeDoc(projectId, entityId, 'entity');
    if (res?.removedRelIds && Array.isArray(res.removedRelIds)) {
      for (const relId of res.removedRelIds) {
        sqliteIndexService.removeDoc(projectId, relId, 'relationship');
      }
    }
  }

  async saveRelationship(projectId: string, rel: Relationship): Promise<void> {
    const raw = serializeRelationshipFile(rel);
    await this.api.saveRelationship(projectId, rel.id, raw);
    sqliteIndexService.indexRelationship(projectId, rel);
  }

  async deleteRelationship(projectId: string, relId: string): Promise<void> {
    await this.api.deleteRelationship(projectId, relId);
    sqliteIndexService.removeDoc(projectId, relId, 'relationship');
  }

  async saveSource(projectId: string, source: Source): Promise<void> {
    const raw = serializeSourceFile(source);
    await this.api.saveSource(projectId, source.id, raw);
    sqliteIndexService.indexSource(projectId, source);
  }

  async deleteSource(projectId: string, sourceId: string): Promise<void> {
    await this.api.deleteSource(projectId, sourceId);
    sqliteIndexService.removeDoc(projectId, sourceId, 'source');
  }

  async saveNote(projectId: string, note: Note): Promise<void> {
    const raw = serializeNoteFile(note);
    await this.api.saveNote(projectId, note.id, raw);
    sqliteIndexService.indexNote(projectId, note);
  }

  async deleteNote(projectId: string, noteId: string): Promise<void> {
    await this.api.deleteNote(projectId, noteId);
    sqliteIndexService.removeDoc(projectId, noteId, 'note');
  }

  async getGraphLayout(projectId: string): Promise<GraphLayout> {
    return this.api.getGraphLayout(projectId);
  }

  async saveGraphLayout(projectId: string, layout: GraphLayout): Promise<void> {
    return this.api.saveGraphLayout(projectId, layout);
  }

  async search(projectId: string, query: string): Promise<SearchResult[]> {
    return sqliteIndexService.search(projectId, query);
  }

  async rebuildIndex(projectId: string): Promise<void> {
    const data = await this.getProject(projectId);
    if (!data) return;
    await sqliteIndexService.rebuildIndex(data);
  }

  async exportProjectZip(projectId: string): Promise<Blob> {
    const data = await this.getProject(projectId);
    if (!data) throw new Error(`Project ${projectId} not found`);

    const zip = new JSZip();
    zip.file('project.md', serializeProjectFile(data.project));

    const entFolder = zip.folder('entities');
    data.entities.forEach((ent) => {
      entFolder?.file(`${ent.id}.md`, serializeEntityFile(ent));
    });

    const relFolder = zip.folder('relationships');
    data.relationships.forEach((rel) => {
      relFolder?.file(`${rel.id}.md`, serializeRelationshipFile(rel));
    });

    const srcFolder = zip.folder('sources');
    data.sources.forEach((src) => {
      srcFolder?.file(`${src.id}.md`, serializeSourceFile(src));
    });

    const noteFolder = zip.folder('notes');
    data.notes.forEach((note) => {
      noteFolder?.file(`${note.id}.md`, serializeNoteFile(note));
    });

    const layout = await this.getGraphLayout(projectId);
    zip.file('graph-layout.json', JSON.stringify(layout, null, 2));

    return zip.generateAsync({ type: 'blob' });
  }

  async importProjectZip(file: File | ArrayBuffer): Promise<string> {
    // The main process stages and validates the whole case before it ever touches
    // `projects/`, so a disk-full write or a crash mid-import can't leave a partial case.
    const buffer = file instanceof Blob ? await file.arrayBuffer() : file;
    const id = await this.api.importProjectZip(buffer);
    await this.rebuildIndex(id);
    const workspace = await this.getWorkspace();
    await this.saveWorkspace({ ...workspace, activeProjectId: id });
    return id;
  }

  async openInExplorer(projectId?: string): Promise<boolean> {
    return this.api.openInExplorer(projectId);
  }

  async selectDirectory(): Promise<string | null> {
    return this.api.selectDirectory();
  }

  onStorageChange(listener: (event: StorageChangeEvent) => void): () => void {
    return this.api.onStorageChange(listener);
  }
}
