/**
 * Reads what the user picked in the "Import investigation" dialog.
 *
 *  - a .zip           → returned as bytes (unpacked in the renderer)
 *  - a folder         → every .md / .json file below it
 *  - a project.md     → the folder that contains it
 *
 * Read-only. The user chose the path in a native dialog; reading is still
 * bounded: no symlinks, no hidden folders, limited depth/count/size, and only
 * text files that belong to the case format.
 */
import fs from 'node:fs';
import path from 'node:path';

const MAX_FILES = 50_000;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 400 * 1024 * 1024;
const MAX_DEPTH = 4;
const MAX_ZIP_BYTES = 400 * 1024 * 1024;

export type ImportSelection =
  | { ok: true; kind: 'zip'; name: string; data: Uint8Array }
  | { ok: true; kind: 'folder'; name: string; files: { path: string; text: string }[] }
  | { ok: false; error: string };

export function readImportSelection(selected: string): ImportSelection {
  let target = path.resolve(selected);
  let st: fs.Stats;
  try {
    st = fs.lstatSync(target);
  } catch {
    return { ok: false, error: 'The selected item could not be read.' };
  }
  if (st.isSymbolicLink()) return { ok: false, error: 'Symbolic links cannot be imported.' };

  if (st.isFile()) {
    const base = path.basename(target);
    if (/\.zip$/i.test(base)) {
      if (st.size > MAX_ZIP_BYTES) return { ok: false, error: 'The archive is larger than 400 MB.' };
      return { ok: true, kind: 'zip', name: base.replace(/\.zip$/i, ''), data: new Uint8Array(fs.readFileSync(target)) };
    }
    if (base.toLowerCase() === 'project.md') {
      target = path.dirname(target);
    } else {
      return { ok: false, error: 'Choose an investigation folder, a case .zip, or its project.md file.' };
    }
  } else if (!st.isDirectory()) {
    return { ok: false, error: 'The selected item is not a file or folder.' };
  }

  if (!fs.existsSync(path.join(target, 'project.md'))) {
    return { ok: false, error: 'This folder has no project.md, so it is not a TRACE investigation.' };
  }

  const files: { path: string; text: string }[] = [];
  let total = 0;
  let overflow = false;
  const walk = (dir: string, rel: string, depth: number) => {
    if (depth > MAX_DEPTH || overflow) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith('.') || e.isSymbolicLink()) continue;
      const full = path.join(dir, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        walk(full, r, depth + 1);
      } else if (e.isFile() && /\.(md|json)$/i.test(e.name)) {
        let size = 0;
        try {
          size = fs.statSync(full).size;
        } catch {
          continue;
        }
        if (size > MAX_FILE_BYTES) continue;
        if (files.length >= MAX_FILES || total + size > MAX_TOTAL_BYTES) {
          overflow = true;
          return;
        }
        total += size;
        files.push({ path: r, text: fs.readFileSync(full, 'utf-8') });
      }
    }
  };
  walk(target, '', 0);
  if (overflow) return { ok: false, error: 'This folder is too large to import.' };
  return { ok: true, kind: 'folder', name: path.basename(target), files };
}
