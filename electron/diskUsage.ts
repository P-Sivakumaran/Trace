/**
 * Disk usage of TRACE's data: cases, removed (archived) cases, installed tools
 * and the portable Python. Read-only; symlinks are never followed.
 */
import fs from 'node:fs';
import path from 'node:path';

export interface DirSize {
  bytes: number;
  files: number;
}

/** Total size of regular files below `dir` (0 if it does not exist). Async, so big trees never block the UI. */
export async function dirSize(dir: string, limitFiles = 200_000): Promise<DirSize> {
  let bytes = 0;
  let files = 0;
  const walk = async (d: string): Promise<void> => {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    const subdirs: string[] = [];
    await Promise.all(
      entries.map(async (e) => {
        if (e.isSymbolicLink()) return;
        const full = path.join(d, e.name);
        if (e.isDirectory()) subdirs.push(full);
        else if (e.isFile() && files < limitFiles) {
          try {
            bytes += (await fs.promises.stat(full)).size;
            files++;
          } catch {
            /* vanished */
          }
        }
      }),
    );
    for (const s of subdirs) await walk(s);
  };
  await walk(dir);
  return { bytes, files };
}

export interface UsageReport {
  kind: 'disk';
  location: string;
  projects: { id: string; name: string; bytes: number; files: number }[];
  projectsBytes: number;
  removedBytes: number;
  toolsBytes: number;
  pythonBytes: number;
  totalBytes: number;
}

export async function collectUsage(opts: {
  workspacePath: string;
  toolsDir: string;
  pythonDir: string;
  names: Record<string, string>;
}): Promise<UsageReport> {
  const projectsDir = path.join(opts.workspacePath, 'projects');
  let ids: string[] = [];
  try {
    ids = (await fs.promises.readdir(projectsDir, { withFileTypes: true })).filter((e) => e.isDirectory() && !e.isSymbolicLink()).map((e) => e.name);
  } catch {
    /* no projects yet */
  }
  const projects = await Promise.all(
    ids.map(async (id) => {
      const s = await dirSize(path.join(projectsDir, id));
      return { id, name: opts.names[id] || id, bytes: s.bytes, files: s.files };
    }),
  );
  projects.sort((a, b) => b.bytes - a.bytes);
  const [removed, tools, python] = await Promise.all([
    dirSize(path.join(opts.workspacePath, 'removed')),
    dirSize(opts.toolsDir),
    dirSize(opts.pythonDir),
  ]);
  const projectsBytes = projects.reduce((n, p) => n + p.bytes, 0);
  return {
    kind: 'disk',
    location: opts.workspacePath,
    projects,
    projectsBytes,
    removedBytes: removed.bytes,
    toolsBytes: tools.bytes,
    pythonBytes: python.bytes,
    totalBytes: projectsBytes + removed.bytes + tools.bytes + python.bytes,
  };
}

export type RemoveMode = 'delete' | 'keep' | 'trash';

/**
 * Removes a project folder.
 *  - delete: permanent
 *  - keep:   moved to <workspace>/removed/<id>-<timestamp> (out of TRACE, files kept)
 *  - trash:  moved to the system Trash (recoverable); never falls back to permanent deletion
 */
export async function removeProjectDir(
  workspacePath: string,
  projectDir: string,
  mode: RemoveMode,
  trashItem: (p: string) => Promise<void>,
  now: Date = new Date(),
): Promise<{ movedTo?: string }> {
  if (!fs.existsSync(projectDir)) return {};
  // Safety: only ever act on a direct child of <workspace>/projects.
  const projectsDir = path.resolve(workspacePath, 'projects');
  if (path.dirname(path.resolve(projectDir)) !== projectsDir) throw new Error('Refusing to remove a folder outside the projects directory');
  if (mode === 'delete') {
    fs.rmSync(projectDir, { recursive: true, force: true });
    return {};
  }
  if (mode === 'trash') {
    await trashItem(projectDir);
    return {};
  }
  const stamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const removedDir = path.join(workspacePath, 'removed');
  fs.mkdirSync(removedDir, { recursive: true });
  let target = path.join(removedDir, `${path.basename(projectDir)}-${stamp}`);
  for (let n = 2; fs.existsSync(target); n++) target = path.join(removedDir, `${path.basename(projectDir)}-${stamp}-${n}`);
  fs.renameSync(projectDir, target);
  return { movedTo: target };
}
