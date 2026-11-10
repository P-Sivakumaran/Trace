import { contextBridge, ipcRenderer } from 'electron';

// Expose safe, isolated API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  isDesktop: true,
  agent: {
    providers: () => ipcRenderer.invoke('agent:providers'),
    list: (caseId: string) => ipcRenderer.invoke('agent:list', caseId),
    get: (caseId: string, id: string) => ipcRenderer.invoke('agent:get', caseId, id),
    create: (caseId: string) => ipcRenderer.invoke('agent:create', caseId),
    send: (request: unknown) => ipcRenderer.invoke('agent:send', request),
    cancel: (caseId: string, id: string) => ipcRenderer.invoke('agent:cancel', caseId, id),
    context: (caseId: string) => ipcRenderer.invoke('agent:context', caseId),
  },
  recon: {
    getConfig: () => ipcRenderer.invoke('recon:getConfig'),
    saveConfig: (config: unknown) => ipcRenderer.invoke('recon:saveConfig', config),
    health: () => ipcRenderer.invoke('recon:health'),
    readArtifact: (caseId: string, id: string) => ipcRenderer.invoke('recon:readArtifact', caseId, id),
    listJobs: (caseId: string) => ipcRenderer.invoke('recon:listJobs', caseId),
    startJob: (request: unknown) => ipcRenderer.invoke('recon:startJob', request),
    cancelJob: (caseId: string, id: string) => ipcRenderer.invoke('recon:cancelJob', caseId, id),
    acceptJob: (caseId: string, id: string, domains: string[]) => ipcRenderer.invoke('recon:acceptJob', caseId, id, domains),
    listProposals: (caseId: string) => ipcRenderer.invoke('recon:listProposals', caseId),
    stageProposal: (caseId: string, id: string) => ipcRenderer.invoke('recon:stageProposal', caseId, id),
    caseMcpConfig: (caseId: string) => ipcRenderer.invoke('recon:caseMcpConfig', caseId),
  },

  // Workspace & Project operations
  getWorkspace: () => ipcRenderer.invoke('workspace:get'),
  saveWorkspace: (ws: any) => ipcRenderer.invoke('workspace:save', ws),
  listProjects: () => ipcRenderer.invoke('projects:list'),
  createProject: (name: string, description?: string, id?: string) =>
    ipcRenderer.invoke('projects:create', { name, description, id }),
  getProject: (id: string) => ipcRenderer.invoke('projects:get', id),
  saveProject: (raw: string) => ipcRenderer.invoke('projects:save', raw),
  deleteProject: (id: string) => ipcRenderer.invoke('projects:delete', id),

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

  // Import (export stays renderer-side; there's no partial-write risk reading existing data)
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
});
