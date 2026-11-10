import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { recordId } from '../../src/services/recon/contracts.js';

/** Reject symlink ancestors as well as lexical traversal, including a final file symlink. */
export function inside(root: string, target: string): string {
  const base = path.resolve(root); const resolved = path.resolve(target);
  const relative = path.relative(base, resolved);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('Path is outside the selected case');
  let cursor = base;
  for (const part of ['', ...relative.split(path.sep).filter(Boolean)]) {
    cursor = part ? path.join(cursor, part) : cursor;
    try {
      if (fs.lstatSync(cursor).isSymbolicLink()) throw new Error('Symlink paths are not permitted for case access');
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  return resolved;
}
export function caseDirectory(workspace: string, caseId: string): string {
  const directory = inside(workspace, path.join(workspace, 'projects', recordId.parse(caseId)));
  if (!fs.existsSync(inside(directory, path.join(directory, 'project.md')))) throw new Error('Selected case does not exist');
  return directory;
}
export function readText(root: string, relative: string, maxBytes = 500_000): string {
  const file = inside(root, path.join(root, relative));
  if (fs.statSync(file).size > maxBytes) throw new Error('Case record exceeds the read limit');
  return fs.readFileSync(file, 'utf8');
}
export function atomicJson(root: string, relative: string, data: unknown): void {
  const file = inside(root, path.join(root, relative));
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = inside(root, `${file}.${randomUUID()}.tmp`);
  fs.writeFileSync(temporary, JSON.stringify(data, null, 2), { mode: 0o600, flag: 'wx' });
  fs.renameSync(temporary, file);
}
