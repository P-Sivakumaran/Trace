import { contextBridge, ipcRenderer } from 'electron';

// Expose safe, isolated API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  isDesktop: true,

  // Workspace & Project operations
  getWorkspace: () => ipcRenderer.invoke('workspace:get'),
  saveWorkspace: (ws: any) => ipcRenderer.invoke('workspace:save', ws),
  listProjects: () => ipcRenderer.invoke('projects:list'),
  createProject: (name: string, description?: string, id?: string) =>
    ipcRenderer.invoke('projects:create', { name, description, id }),
  getProject: (id: string) => ipcRenderer.invoke('projects:get', id),
  saveProject: (raw: string) => ipcRenderer.invoke('projects:save', raw),
  deleteProject: (id: string, mode?: 'delete' | 'keep' | 'trash') => ipcRenderer.invoke('projects:delete', id, mode),
  getStorageUsage: () => ipcRenderer.invoke('storage:usage'),

  // Entities
  saveEntity: (projectId: string, entityId: string, raw: string) =>
    ipcRenderer.invoke('entities:save', { projectId, entityId, raw }),
  deleteEntity: (projectId: string, entityId: string) =>
    ipcRenderer.invoke('entities:delete', { projectId, entityId }),

  // Relationships
  saveRelationship: (projectId: string, relId: string, raw: string) =>
    ipcRenderer.invoke('relationships:save', { projectId, relId, raw }),
  deleteRelationship: (projectId: string, relId: string) =>
    ipcRenderer.invoke('relationships:delete', { projectId, relId }),

  // Sources
  saveSource: (projectId: string, sourceId: string, raw: string) =>
    ipcRenderer.invoke('sources:save', { projectId, sourceId, raw }),
  deleteSource: (projectId: string, sourceId: string) =>
    ipcRenderer.invoke('sources:delete', { projectId, sourceId }),

  // Notes
  saveNote: (projectId: string, noteId: string, raw: string) =>
    ipcRenderer.invoke('notes:save', { projectId, noteId, raw }),
  deleteNote: (projectId: string, noteId: string) =>
    ipcRenderer.invoke('notes:delete', { projectId, noteId }),

  // Graph Layout
  getGraphLayout: (projectId: string) => ipcRenderer.invoke('graph:getLayout', projectId),
  saveGraphLayout: (projectId: string, layout: any) =>
    ipcRenderer.invoke('graph:saveLayout', { projectId, layout }),

  // Search & Indexing
  search: (projectId: string, query: string) =>
    ipcRenderer.invoke('search:query', { projectId, query }),
  rebuildIndex: (projectId: string) => ipcRenderer.invoke('search:rebuild', projectId),

  // Import / Export
  exportProjectZip: (projectId: string) => ipcRenderer.invoke('projects:exportZip', projectId),
  importProjectZip: (buffer: ArrayBuffer) => ipcRenderer.invoke('projects:importZip', buffer),

  // File System Dialog & Open in Explorer
  selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory'),
  openInExplorer: (projectId?: string) => ipcRenderer.invoke('workspace:openInExplorer', projectId),

  // Storage Change Event Listener
  onStorageChange: (callback: (event: any) => void) => {
    const handler = (_: any, eventData: any) => callback(eventData);
    ipcRenderer.on('storage:changed', handler);
    return () => {
      ipcRenderer.removeListener('storage:changed', handler);
    };
  },

  // Platform & Window State
  platform: process.platform,
  isFullScreen: () => ipcRenderer.invoke('window:isFullScreen'),
  onFullScreenChange: (callback: (isFull: boolean) => void) => {
    const handler = (_: any, isFull: boolean) => callback(isFull);
    ipcRenderer.on('window:fullscreen-change', handler);
    return () => {
      ipcRenderer.removeListener('window:fullscreen-change', handler);
    };
  },

  // Network Request (Proxy for API Quick Sources)
  sendApiRequest: (req: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }) => ipcRenderer.invoke('net:request', req),

  // App version
  getVersion: () => ipcRenderer.invoke('app:getVersion'),

  // Import investigation (native dialog)
  pickImport: (mode: 'any' | 'zip' | 'folder') => ipcRenderer.invoke('import:pick', mode),

  // External tools (marketplace)
  tools: {
    status: () => ipcRenderer.invoke('tools:status'),
    install: (id: string) => ipcRenderer.invoke('tools:install', id),
    installPython: () => ipcRenderer.invoke('tools:installPython'),
    uninstall: (id: string) => ipcRenderer.invoke('tools:uninstall', id),
    run: (id: string, input: string, runId: string) => ipcRenderer.invoke('tools:run', { id, input, runId }),
    cancel: (runId: string) => ipcRenderer.invoke('tools:cancel', runId),
    onLog: (cb: (e: { runId: string; line: string; stream: string }) => void) => {
      const handler = (_: unknown, e: { runId: string; line: string; stream: string }) => cb(e);
      ipcRenderer.on('tools:log', handler);
      return () => ipcRenderer.removeListener('tools:log', handler);
    },
  },

  // Read-only MCP server switch
  mcp: {
    status: () => ipcRenderer.invoke('mcp:status'),
    setEnabled: (enabled: boolean) => ipcRenderer.invoke('mcp:setEnabled', enabled),
  },
});
