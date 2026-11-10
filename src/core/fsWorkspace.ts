/**
 * Read-only access to a TRACE workspace on disk (Node only).
 *
 * Mirrors the Electron storage layout — <workspace>/projects/<id>/{project.md,
 * entities,relationships,sources,notes}/*.md — and reuses the app's own
 * Markdown parsers. This module never writes, renames or deletes anything.
 *
 * Security:
 *  - project ids are validated with the same rule as the Electron main process;
 *  - every resolved path must stay inside <workspace>/projects (realpath check,
 *    so symlinks cannot escape);
 *  - only regular *.md files below a size cap are read.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ProjectData, ProjectSummary } from '@/types';
import {
  parseEntityFile,
  parseNoteFile,
  parseProjectFile,
  parseRelationshipFile,
  parseSourceFile,
} from '@/services/markdownParser';
import { isValidId } from './ids';

export { isValidId };

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const SUBDIRS = ['entities', 'relationships', 'sources', 'notes'] as const;


/** Candidate locations of the desktop app's trace-config.json. */
export function appConfigCandidates(env: NodeJS.ProcessEnv = process.env): string[] {
  const home = os.homedir();
  const roots =
    process.platform === 'darwin'
      ? [path.join(home, 'Library', 'Application Support')]
      : process.platform === 'win32'
        ? [env.APPDATA || path.join(home, 'AppData', 'Roaming')]
        : [env.XDG_CONFIG_HOME || path.join(home, '.config')];
  return roots.flatMap((root) => ['Trace', 'trace'].map((n) => path.join(root, n, 'trace-config.json')));
}

export interface AppConfigInfo {
  path: string;
  workspacePath?: string;
  mcpEnabled: boolean;
}

/** Reads the desktop app config (first one found), or null if the app was never run. */
export function readAppConfig(env: NodeJS.ProcessEnv = process.env, candidates = appConfigCandidates(env)): AppConfigInfo | null {
  for (const cfg of candidates) {
    try {
      const parsed = JSON.parse(fs.readFileSync(cfg, 'utf-8'));
      return {
        path: cfg,
        workspacePath: typeof parsed?.workspacePath === 'string' ? parsed.workspacePath : undefined,
        mcpEnabled: parsed?.mcpEnabled === true,
      };
    } catch {
      /* missing or unreadable */
    }
  }
  return null;
}

/** True when the desktop app has a data folder on this machine (it has been run). */
export function appDataExists(env: NodeJS.ProcessEnv = process.env, candidates = appConfigCandidates(env)): boolean {
  return candidates.some((c) => fs.existsSync(path.dirname(c)));
}

/**
 * MCP access rule: whenever the desktop app is present, its switch decides
 * (off unless turned on). Only a bare source checkout with no app runs open.
 */
export function isMcpAccessEnabled(env: NodeJS.ProcessEnv = process.env, candidates = appConfigCandidates(env)): boolean {
  const cfg = readAppConfig(env, candidates);
  if (cfg) return cfg.mcpEnabled;
  return !appDataExists(env, candidates);
}

/** Locates the workspace the desktop app uses, unless one is given explicitly. */
export function resolveWorkspacePath(explicit?: string, env: NodeJS.ProcessEnv = process.env): string {
  if (explicit) return path.resolve(explicit);
  if (env.TRACE_WORKSPACE) return path.resolve(env.TRACE_WORKSPACE);
  const cfg = readAppConfig(env);
  if (cfg?.workspacePath && fs.existsSync(cfg.workspacePath)) return cfg.workspacePath;
  return path.join(os.homedir(), 'Documents', 'trace');
}

export class WorkspaceReader {
  private readonly projectsDir: string;

  constructor(workspacePath: string) {
    this.projectsDir = path.resolve(workspacePath, 'projects');
  }

  get root(): string {
    return this.projectsDir;
  }

  /** Real path of a project directory, or null if it is invalid / missing / escapes. */
  private projectDir(projectId: string): string | null {
    if (!isValidId(projectId)) return null;
    let base: string;
    try {
      base = fs.realpathSync(this.projectsDir);
    } catch {
      return null;
    }
    const candidate = path.join(base, projectId);
    let real: string;
    try {
      real = fs.realpathSync(candidate);
    } catch {
      return null;
    }
    if (!real.startsWith(base + path.sep)) return null;
    if (!fs.statSync(real).isDirectory()) return null;
    if (!fs.existsSync(path.join(real, 'project.md'))) return null;
    return real;
  }

  private readMd(dir: string, file: string): string | null {
    if (!file.endsWith('.md')) return null;
    const full = path.join(dir, file);
    try {
      const st = fs.lstatSync(full);
      if (!st.isFile() || st.size > MAX_FILE_BYTES) return null; // no symlinks, no huge files
      return fs.readFileSync(full, 'utf-8');
    } catch {
      return null;
    }
  }

  listProjects(): ProjectSummary[] {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(this.projectsDir, { withFileTypes: true });
    } catch {
      return [];
    }
    const out: ProjectSummary[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !isValidId(entry.name)) continue;
      const dir = this.projectDir(entry.name);
      if (!dir) continue;
      const raw = this.readMd(dir, 'project.md');
      if (raw == null) continue;
      const project = parseProjectFile(raw, entry.name);
      const count = (sub: string) => {
        try {
          return fs.readdirSync(path.join(dir, sub)).filter((f) => f.endsWith('.md')).length;
        } catch {
          return 0;
        }
      };
      out.push({
        id: entry.name,
        name: project.name || entry.name,
        entityCount: count('entities'),
        relationshipCount: count('relationships'),
        sourceCount: count('sources'),
        noteCount: count('notes'),
        updated_at: project.updated_at || fs.statSync(path.join(dir, 'project.md')).mtime.toISOString(),
      });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  loadProject(projectId: string): ProjectData | null {
    const dir = this.projectDir(projectId);
    if (!dir) return null;
    const projectRaw = this.readMd(dir, 'project.md');
    if (projectRaw == null) return null;
    const read = (sub: (typeof SUBDIRS)[number]) => {
      const subDir = path.join(dir, sub);
      let files: string[];
      try {
        if (!fs.lstatSync(subDir).isDirectory()) return [];
        files = fs.readdirSync(subDir);
      } catch {
        return [];
      }
      return files
        .map((f) => ({ id: f.replace(/\.md$/, ''), raw: this.readMd(subDir, f) }))
        .filter((x): x is { id: string; raw: string } => x.raw != null);
    };
    return {
      project: parseProjectFile(projectRaw, projectId),
      entities: read('entities').map((f) => parseEntityFile(f.raw, f.id)),
      relationships: read('relationships').map((f) => parseRelationshipFile(f.raw, f.id)),
      sources: read('sources').map((f) => parseSourceFile(f.raw, f.id)),
      notes: read('notes').map((f) => parseNoteFile(f.raw, f.id)),
    };
  }
}
