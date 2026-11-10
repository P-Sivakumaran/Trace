import { app, BrowserWindow, ipcMain, dialog, shell, nativeImage } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { randomUUID } from 'node:crypto';
import { dump } from 'js-yaml';
import { ReconBroker } from './recon/broker';
import { inside, caseDirectory } from './recon/paths';
import { trustedDocument } from './recon/trusted-renderer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Explicit paths allow a portable workspace and an isolated desktop evaluation.
const workspaceOverride = process.env.TRACE_WORKSPACE_PATH;
const profileOverride = process.env.TRACE_USER_DATA_DIR;
for (const value of [workspaceOverride, profileOverride]) {
  if (value && !path.isAbsolute(value)) throw new Error('Trace override paths must be absolute');
}
if (profileOverride) {
  fs.mkdirSync(profileOverride, { recursive: true });
  app.setPath('userData', profileOverride);
}

let mainWindow: BrowserWindow | null = null;
let configPath = '';
let currentWorkspacePath = '';
let recon: ReconBroker;
const entryUrl = process.env.VITE_DEV_SERVER_URL || pathToFileURL(path.join(__dirname, '../dist/index.html')).href;

function loadConfig(): { workspacePath?: string } {
  try {
    if (configPath && fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch {}
  return {};
}

function saveConfig(cfg: { workspacePath?: string }) {
  if (!configPath) return;
  try {
    ensureDirSync(path.dirname(configPath));
    atomicWriteFileSync(configPath, JSON.stringify(cfg, null, 2));
  } catch (err) {
    console.error('Failed to save config:', err);
  }
}

function ensureDirSync(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function atomicWriteFileSync(filePath: string, data: string | Buffer) {
  ensureDirSync(path.dirname(filePath));
  const tempPath = `${filePath}.tmp.${Date.now()}`;
  fs.writeFileSync(tempPath, data);
  fs.renameSync(tempPath, filePath);
}

function sanitizeRelativePath(baseDir: string, targetPath: string): string {
  const baseResolved = path.resolve(baseDir);
  const resolved = path.resolve(baseDir, targetPath);
  if (resolved !== baseResolved && !resolved.startsWith(baseResolved + path.sep)) {
    throw new Error('Access denied: path traversal detected');
  }
  return inside(currentWorkspacePath, resolved);
}

function getProjectDir(projectId: string): string {
  if (
    !projectId ||
    typeof projectId !== 'string' ||
    !/^[a-zA-Z0-9_\-\.]+$/.test(projectId) ||
    projectId === '.' ||
    projectId === '..'
  ) {
    throw new Error('Access denied: invalid project identifier');
  }
  const projectsDir = path.resolve(currentWorkspacePath, 'projects');
  const projDir = path.resolve(projectsDir, projectId);
  if (projDir !== projectsDir && !projDir.startsWith(projectsDir + path.sep)) {
    throw new Error('Access denied: path traversal detected');
  }
  return inside(currentWorkspacePath, projDir);
}

function createWindow() {
  const iconPath = path.join(__dirname, '../build/icon.png');
  const isMac = process.platform === 'darwin';
  const isWin = process.platform === 'win32';

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1000,
    minHeight: 650,
    backgroundColor: '#111113',
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    titleBarOverlay: isWin
      ? {
          color: '#151517',
          symbolColor: '#cbd5e1',
          height: 30,
        }
      : undefined,
    trafficLightPosition: isMac ? { x: 14, y: 9 } : undefined,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  // Track and notify renderer of macOS full-screen state
  mainWindow.on('enter-full-screen', () => {
    mainWindow?.webContents.send('window:fullscreen-change', true);
  });

  mainWindow.on('leave-full-screen', () => {
    mainWindow?.webContents.send('window:fullscreen-change', false);
  });

  // Intercept external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!trustedDocument(url, entryUrl)) event.preventDefault();
  });
  mainWindow.webContents.on('will-attach-webview', (event) => event.preventDefault());

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  configPath = path.join(app.getPath('userData'), 'trace-config.json');
  const defaultTracePath = workspaceOverride || path.join(app.getPath('documents'), 'trace');
  const legacyTracePath = path.join(app.getPath('documents'), 'Trace-OSINT-Workspace');

  // Migrate legacy 'Trace-OSINT-Workspace' to 'trace' if needed
  try {
    if (!workspaceOverride && !fs.existsSync(defaultTracePath) && fs.existsSync(legacyTracePath)) {
      fs.renameSync(legacyTracePath, defaultTracePath);
    }
  } catch (err) {
    console.error('Failed to migrate legacy directory to trace:', err);
  }

  const initialConfig = workspaceOverride ? {} : loadConfig();
  currentWorkspacePath =
    initialConfig.workspacePath && fs.existsSync(initialConfig.workspacePath)
      ? initialConfig.workspacePath
      : defaultTracePath;

  ensureDirSync(currentWorkspacePath);

  recon = new ReconBroker({ workspace: () => currentWorkspacePath, profile: app.getPath('userData'),
    localServer: path.join(app.getAppPath(), 'dist-mcp/mcp/kali-server.js'), nodeExecutable: process.execPath });
  app.on('before-quit', () => recon.stop());

  // Set macOS dock icon in development (in packaged app Info.plist sets icon.icns)
  if (process.platform === 'darwin' && app.dock && !app.isPackaged) {
    const iconPath = path.join(__dirname, '../build/icon.png');
    if (fs.existsSync(iconPath)) {
      try {
        const img = nativeImage.createFromPath(iconPath);
        if (!img.isEmpty()) {
          app.dock.setIcon(img);
        }
      } catch {}
    }
  }

  setupIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

function setupIpcHandlers() {
  // Every privileged handler shares one top-frame/document check, including legacy storage IPC.
  const handle: typeof ipcMain.handle = (channel, listener) => ipcMain.handle(channel, (event, ...args) => {
    if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame || !trustedDocument(event.senderFrame.url, entryUrl)) {
      throw new Error('IPC request is not from the trusted application document');
    }
    return listener(event, ...args);
  });
  handle('recon:getConfig', () => recon.config());
  handle('recon:saveConfig', (_event, config) => recon.saveConfig(config));
  handle('recon:health', () => recon.health());
  handle('recon:readArtifact', (_event, caseId, id) => recon.readArtifact(caseId, id));
  handle('recon:listJobs', (_event, caseId) => recon.list(caseId));
  handle('recon:startJob', (_event, request) => recon.start(request));
  handle('recon:cancelJob', (_event, caseId, id) => recon.cancel(caseId, id));
  handle('recon:acceptJob', (_event, caseId, id, domains) => {
    const job = recon.accept(caseId, id, domains);
    mainWindow?.webContents.send('storage:changed', { type: 'reload', targetType: 'project', targetId: caseId });
    return job;
  });
  handle('recon:listProposals', (_event, caseId) => recon.proposals(caseId));
  handle('recon:stageProposal', (_event, caseId, id) => recon.stageProposal(caseId, id));
  handle('recon:caseMcpConfig', (_event, caseId) => {
    caseDirectory(currentWorkspacePath, caseId);
    const config = recon.config(); if (!config) throw new Error('Configure the case domain scope first');
    return { mcpServers: { 'trace-case': { command: process.execPath,
      args: [path.join(app.getAppPath(), 'dist-mcp/mcp/trace-server.js'), '--workspace', currentWorkspacePath, '--case-id', caseId, '--scope-b64', Buffer.from(JSON.stringify(config.scope)).toString('base64')],
      env: { ELECTRON_RUN_AS_NODE: '1' } } } };
  });
  // Dialog: Select directory
  handle('dialog:selectDirectory', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Trace Working Directory',
      defaultPath: currentWorkspacePath,
    });
    if (!result.canceled && result.filePaths.length > 0) {
      recon.stop();
      currentWorkspacePath = result.filePaths[0];
      ensureDirSync(currentWorkspacePath);
      ensureDirSync(path.join(currentWorkspacePath, 'projects'));
      saveConfig({ workspacePath: currentWorkspacePath });

      const wsFile = path.join(currentWorkspacePath, 'workspace.json');
      let ws: any = {
        id: 'workspace',
        name: path.basename(currentWorkspacePath),
        workspacePath: currentWorkspacePath,
        updated_at: new Date().toISOString(),
      };
      if (fs.existsSync(wsFile)) {
        try {
          ws = JSON.parse(fs.readFileSync(wsFile, 'utf-8'));
          ws.workspacePath = currentWorkspacePath;
        } catch {}
      } else {
        ws.created_at = new Date().toISOString();
      }
      atomicWriteFileSync(wsFile, JSON.stringify(ws, null, 2));

      mainWindow?.webContents.send('storage:changed', {
        type: 'workspace',
        action: 'updated',
        projectId: '',
      });

      return currentWorkspacePath;
    }
    return null;
  });

  // Workspace: Get
  handle('workspace:get', async () => {
    ensureDirSync(currentWorkspacePath);
    ensureDirSync(path.join(currentWorkspacePath, 'projects'));
    const wsFile = path.join(currentWorkspacePath, 'workspace.json');
    if (fs.existsSync(wsFile)) {
      try {
        const raw = fs.readFileSync(wsFile, 'utf-8');
        const parsed = JSON.parse(raw);
        parsed.workspacePath = currentWorkspacePath;
        return parsed;
      } catch (err) {
        console.error('Failed to parse workspace.json:', err);
      }
    }
    const now = new Date().toISOString();
    const defaultWs = {
      id: 'default-workspace',
      name: path.basename(currentWorkspacePath) || 'trace',
      workspacePath: currentWorkspacePath,
      created_at: now,
      updated_at: now,
    };
    atomicWriteFileSync(wsFile, JSON.stringify(defaultWs, null, 2));
    return defaultWs;
  });

  // Workspace: Save
  handle('workspace:save', async (_, ws) => {
    const wsFile = path.join(currentWorkspacePath, 'workspace.json');
    atomicWriteFileSync(wsFile, JSON.stringify(ws, null, 2));
  });

  // Projects: List
  handle('projects:list', async () => {
    const projectsDir = inside(currentWorkspacePath, path.join(currentWorkspacePath, 'projects'));
    ensureDirSync(projectsDir);

    const summaries: any[] = [];
    const entries = fs.readdirSync(projectsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const projDir = getProjectDir(entry.name);
        const projFile = inside(projDir, path.join(projDir, 'project.md'));
        if (fs.existsSync(projFile)) {
          const entitiesDir = path.join(projDir, 'entities');
          const relsDir = inside(projDir, path.join(projDir, 'relationships'));
          const sourcesDir = path.join(projDir, 'sources');
          const notesDir = path.join(projDir, 'notes');

          const entityCount = fs.existsSync(entitiesDir)
            ? fs.readdirSync(entitiesDir).filter((f) => f.endsWith('.md')).length
            : 0;
          const relationshipCount = fs.existsSync(relsDir)
            ? fs.readdirSync(relsDir).filter((f) => f.endsWith('.md')).length
            : 0;
          const sourceCount = fs.existsSync(sourcesDir)
            ? fs.readdirSync(sourcesDir).filter((f) => f.endsWith('.md')).length
            : 0;
          const noteCount = fs.existsSync(notesDir)
            ? fs.readdirSync(notesDir).filter((f) => f.endsWith('.md')).length
            : 0;

          let projName = entry.name;
          try {
            const raw = fs.readFileSync(projFile, 'utf-8');
            const match = raw.match(/^name:\s*["']?([^"'\n\r]+)["']?/m);
            if (match) projName = match[1].trim();
          } catch {}

          const stats = fs.statSync(projFile);
          summaries.push({
            id: entry.name,
            name: projName,
            entityCount,
            relationshipCount,
            sourceCount,
            noteCount,
            updated_at: stats.mtime.toISOString(),
          });
        }
      }
    }

    return summaries;
  });

  // Projects: Get
  handle('projects:get', async (_, id: string) => {
    const projDir = getProjectDir(id);
    const projFile = inside(projDir, path.join(projDir, 'project.md'));
    if (!fs.existsSync(projFile)) return null;

    const projectRaw = fs.readFileSync(projFile, 'utf-8');

    const readDirFiles = (subdir: string) => {
      const fullPath = inside(projDir, path.join(projDir, subdir));
      if (!fs.existsSync(fullPath)) return [];
      return fs
        .readdirSync(fullPath)
        .filter((f) => f.endsWith('.md'))
        .map((f) => ({
          id: f.replace('.md', ''),
          raw: fs.readFileSync(inside(projDir, path.join(fullPath, f)), 'utf-8'),
        }));
    };

    return {
      projectRaw,
      entities: readDirFiles('entities'),
      relationships: readDirFiles('relationships'),
      sources: readDirFiles('sources'),
      notes: readDirFiles('notes'),
    };
  });

  // Projects: Create
  handle('projects:create', async (_, { name, description, id }) => {
    if (typeof name !== 'string' || !name.trim()) throw new Error('A case name is required');
    let slug = id || (name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `proj-${randomUUID()}`);
    if (!id && fs.existsSync(getProjectDir(slug))) slug = `${slug}-${randomUUID()}`;
    const projDir = getProjectDir(slug);
    ensureDirSync(path.dirname(projDir));
    // Exclusive reservation prevents duplicate names/IDs from overwriting an existing case.
    fs.mkdirSync(projDir);
    ensureDirSync(path.join(projDir, 'entities'));
    ensureDirSync(path.join(projDir, 'relationships'));
    ensureDirSync(path.join(projDir, 'sources'));
    ensureDirSync(path.join(projDir, 'notes'));

    const projFile = inside(projDir, path.join(projDir, 'project.md'));
    const now = new Date().toISOString();
    const proj = {
      id: slug,
      type: 'project',
      name,
      description: description || '',
      created_at: now,
      updated_at: now,
    };
    const content = `---\n${dump(proj, { noRefs: true })}---\n\n# ${name}\n\n${description || ''}\n`;
    atomicWriteFileSync(projFile, content);
    return proj;
  });

  // Projects: Save
  handle('projects:save', async (_, raw: string) => {
    const idMatch = raw.match(/^id:\s*["']?([^"'\n\r]+)["']?/m);
    if (!idMatch) return;
    const projectId = idMatch[1].trim();
    const projDir = getProjectDir(projectId);
    ensureDirSync(projDir);
    const filePath = path.join(projDir, 'project.md');
    atomicWriteFileSync(filePath, raw);
  });

  // Projects: Delete
  handle('projects:delete', async (_, id: string) => {
    const projDir = getProjectDir(id);
    if (fs.existsSync(projDir)) {
      fs.rmSync(projDir, { recursive: true, force: true });
    }
  });

  // Entities: Save
  handle('entities:save', async (_, { projectId, entityId, raw }) => {
    const filePath = sanitizeRelativePath(
      path.join(getProjectDir(projectId), 'entities'),
      `${entityId}.md`
    );
    atomicWriteFileSync(filePath, raw);
  });

  // Entities: Delete
  handle('entities:delete', async (_, { projectId, entityId }) => {
    const projDir = getProjectDir(projectId);
    const filePath = sanitizeRelativePath(
      path.join(projDir, 'entities'),
      `${entityId}.md`
    );
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Cascade delete connected relationships on disk to prevent dangling references
    const relsDir = inside(projDir, path.join(projDir, 'relationships'));
    const removedRelIds: string[] = [];
    if (fs.existsSync(relsDir)) {
      const files = fs.readdirSync(relsDir).filter((f) => f.endsWith('.md'));
      for (const f of files) {
        try {
          const relPath = inside(projDir, path.join(relsDir, f));
          const raw = fs.readFileSync(relPath, 'utf-8');
          if (
            raw.includes(`source_entity: "${entityId}"`) ||
            raw.includes(`source_entity: '${entityId}'`) ||
            raw.includes(`target_entity: "${entityId}"`) ||
            raw.includes(`target_entity: '${entityId}'`) ||
            raw.includes(`source_entity: ${entityId}`) ||
            raw.includes(`target_entity: ${entityId}`)
          ) {
            fs.unlinkSync(relPath);
            removedRelIds.push(f.replace('.md', ''));
          }
        } catch {}
      }
    }
    return { removedRelIds };
  });

  // Relationships: Save
  handle('relationships:save', async (_, { projectId, relId, raw }) => {
    const filePath = sanitizeRelativePath(
      path.join(getProjectDir(projectId), 'relationships'),
      `${relId}.md`
    );
    atomicWriteFileSync(filePath, raw);
  });

  // Relationships: Delete
  handle('relationships:delete', async (_, { projectId, relId }) => {
    const filePath = sanitizeRelativePath(
      path.join(getProjectDir(projectId), 'relationships'),
      `${relId}.md`
    );
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  });

  // Sources: Save
  handle('sources:save', async (_, { projectId, sourceId, raw }) => {
    const filePath = sanitizeRelativePath(
      path.join(getProjectDir(projectId), 'sources'),
      `${sourceId}.md`
    );
    atomicWriteFileSync(filePath, raw);
  });

  // Sources: Delete
  handle('sources:delete', async (_, { projectId, sourceId }) => {
    const filePath = sanitizeRelativePath(
      path.join(getProjectDir(projectId), 'sources'),
      `${sourceId}.md`
    );
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  });

  // Notes: Save
  handle('notes:save', async (_, { projectId, noteId, raw }) => {
    const filePath = sanitizeRelativePath(
      path.join(getProjectDir(projectId), 'notes'),
      `${noteId}.md`
    );
    atomicWriteFileSync(filePath, raw);
  });

  // Notes: Delete
  handle('notes:delete', async (_, { projectId, noteId }) => {
    const filePath = sanitizeRelativePath(
      path.join(getProjectDir(projectId), 'notes'),
      `${noteId}.md`
    );
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  });

  // Graph Layout: Get & Save
  handle('graph:getLayout', async (_, projectId: string) => {
    const filePath = sanitizeRelativePath(
      getProjectDir(projectId),
      'graph-layout.json'
    );
    if (fs.existsSync(filePath)) {
      try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      } catch {}
    }
    return { positions: {} };
  });

  handle('graph:saveLayout', async (_, { projectId, layout }) => {
    const filePath = sanitizeRelativePath(
      getProjectDir(projectId),
      'graph-layout.json'
    );
    atomicWriteFileSync(filePath, JSON.stringify(layout, null, 2));
  });

  // Open Project / Workspace in Finder / File Explorer
  handle('workspace:openInExplorer', async (_, projectId?: string) => {
    let targetPath = currentWorkspacePath;
    if (projectId) {
      const projDir = getProjectDir(projectId);
      ensureDirSync(projDir);
      targetPath = projDir;
    } else {
      ensureDirSync(targetPath);
    }
    await shell.openPath(targetPath);
    return true;
  });

  // Window State & Platform
  handle('window:isFullScreen', () => mainWindow?.isFullScreen() || false);
  handle('app:getPlatform', () => process.platform);
  handle('app:getVersion', () => app.getVersion());

  // Network Request (Proxy to bypass CORS for API Quick Sources)
  handle('net:request', async (_, req: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }) => {
    const startTime = Date.now();
    try {
      const parsedUrl = new URL(req.url);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        throw new Error('Only HTTP and HTTPS protocols are permitted');
      }
      const isBodyAllowed = req.method && !['GET', 'HEAD'].includes(req.method.toUpperCase());
      const response = await fetch(req.url, {
        method: req.method || 'GET',
        headers: req.headers,
        body: isBodyAllowed ? req.body : undefined,
      });

      const contentType = response.headers.get('content-type') || '';
      let data: any;
      if (contentType.includes('application/json')) {
        try {
          data = await response.json();
        } catch {
          data = await response.text();
        }
      } else {
        data = await response.text();
      }

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((val, key) => {
        responseHeaders[key] = val;
      });

      return {
        success: true,
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        data,
        durationMs: Date.now() - startTime,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Network request failed',
        durationMs: Date.now() - startTime,
      };
    }
  });
}
