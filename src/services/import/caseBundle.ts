/**
 * Importing a whole investigation (case) from files.
 *
 * A case is a folder whose entry point is `project.md`:
 *
 *   <case>/project.md  entities/*.md  relationships/*.md  sources/*.md
 *          notes/*.md  graph-layout.json
 *
 * The same reader serves every source — a .zip archive, a folder picked in the
 * desktop app, or a folder chosen in the browser — by working on a flat list of
 * relative file paths. Nothing here touches storage; adapters persist the
 * result. An import never overwrites an existing case: on an id clash the
 * incoming case is stored as a copy under a new id.
 */
import JSZip from 'jszip';
import type { GraphLayout, ProjectData } from '@/types';
import { isValidId } from '@/core/ids';
import {
  parseEntityFile,
  parseNoteFile,
  parseProjectFile,
  parseRelationshipFile,
  parseSourceFile,
} from '@/services/markdownParser';

export interface BundleFile {
  /** Path relative to the selection, "/" separated. */
  path: string;
  text: () => Promise<string>;
}

export interface CaseBundle {
  data: ProjectData;
  layout: GraphLayout;
  /** Files inside the case folder that are not part of the case format. */
  skipped: string[];
  /** Name of the folder / archive the case came from. */
  origin: string;
}

export interface ImportedCase {
  id: string;
  name: string;
  /** True when the id/name were changed because the case already exists. */
  renamed: boolean;
  counts: { entities: number; relationships: number; sources: number; notes: number };
  skipped: string[];
}

export const MAX_BUNDLE_FILES = 50_000;
export const MAX_FILE_BYTES = 2 * 1024 * 1024;

const SECTIONS = ['entities', 'relationships', 'sources', 'notes'] as const;
const IGNORED = /(^|\/)(\.DS_Store|Thumbs\.db|desktop\.ini|\.git(\/|$)|\.trace[^/]*$|__MACOSX\/)/;

export function normalisePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.?\//, '');
}

function isSafePath(p: string): boolean {
  return !p.startsWith('/') && !/^[a-zA-Z]:/.test(p) && !p.split('/').includes('..');
}

/** Finds the case root (directory of project.md). Throws a user-readable error. */
export function findCaseRoot(paths: string[]): string {
  const roots = paths.filter((p) => /(^|\/)project\.md$/.test(p) && !IGNORED.test(p)).map((p) => p.slice(0, p.length - 'project.md'.length));
  if (roots.length === 0) {
    throw new Error('No project.md found. Choose an investigation folder, a case .zip, or a project.md file.');
  }
  const depth = (r: string) => (r ? r.split('/').length - 1 : 0);
  const min = Math.min(...roots.map(depth));
  const top = roots.filter((r) => depth(r) === min);
  if (top.length > 1) {
    throw new Error(`Found ${top.length} investigations in this selection. Choose a single investigation folder.`);
  }
  return top[0];
}

export async function readCaseBundle(files: BundleFile[], origin: string): Promise<CaseBundle> {
  if (files.length > MAX_BUNDLE_FILES) throw new Error(`Too many files (${files.length}). Choose the investigation folder itself.`);
  const all = files.map((f) => ({ ...f, path: normalisePath(f.path) })).filter((f) => isSafePath(f.path) && !IGNORED.test(f.path));
  const root = findCaseRoot(all.map((f) => f.path));
  const inCase = all.filter((f) => f.path.startsWith(root));
  const rel = (f: { path: string }) => f.path.slice(root.length);

  const byId = (section: string) =>
    inCase.filter((f) => {
      const r = rel(f);
      return r.startsWith(`${section}/`) && r.endsWith('.md') && r.split('/').length === 2;
    });

  const projectFile = inCase.find((f) => rel(f) === 'project.md')!;
  const fallbackId = `imported-${Date.now().toString(36)}`;
  const project = parseProjectFile(await projectFile.text(), fallbackId);

  const read = async <T>(section: string, parse: (raw: string, id: string) => T): Promise<T[]> => {
    const out: T[] = [];
    for (const f of byId(section)) out.push(parse(await f.text(), rel(f).split('/')[1].replace(/\.md$/, '')));
    return out;
  };

  let layout: GraphLayout = { positions: {} };
  const layoutFile = inCase.find((f) => rel(f) === 'graph-layout.json');
  if (layoutFile) {
    try {
      const parsed = JSON.parse(await layoutFile.text());
      if (parsed && typeof parsed === 'object' && parsed.positions && typeof parsed.positions === 'object') layout = parsed;
    } catch {
      /* unreadable layout: nodes will be laid out again */
    }
  }

  const known = new Set(['project.md', 'graph-layout.json']);
  const skipped = inCase
    .map(rel)
    .filter((r) => !known.has(r) && !(SECTIONS.some((s) => r.startsWith(`${s}/`) && r.endsWith('.md') && r.split('/').length === 2)));

  return {
    data: {
      project,
      entities: await read('entities', parseEntityFile),
      relationships: await read('relationships', parseRelationshipFile),
      sources: await read('sources', parseSourceFile),
      notes: await read('notes', parseNoteFile),
    },
    layout,
    skipped,
    origin: origin || root.replace(/\/$/, '').split('/').pop() || 'investigation',
  };
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'investigation';
}

/**
 * Chooses the id/name the case is stored under. Never reuses an existing id.
 */
export function resolveImportTarget(project: { id: string; name: string }, existingIds: Iterable<string>) {
  const taken = new Set(existingIds);
  let id = isValidId(project.id) ? project.id : `imported-${slug(project.name)}`;
  let name = project.name || id;
  let renamed = !isValidId(project.id);
  if (taken.has(id)) {
    renamed = true;
    const base = `${id}-imported`;
    id = base;
    for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
    name = `${name} (imported)`;
  }
  return { id, name, renamed };
}

/** Applies the resolved id/name to the bundle and summarises it. */
export function applyImportTarget(bundle: CaseBundle, existingIds: Iterable<string>): { bundle: CaseBundle; summary: ImportedCase } {
  const t = resolveImportTarget(bundle.data.project, existingIds);
  const project = { ...bundle.data.project, id: t.id, name: t.name };
  const next: CaseBundle = { ...bundle, data: { ...bundle.data, project } };
  return {
    bundle: next,
    summary: {
      id: t.id,
      name: t.name,
      renamed: t.renamed,
      counts: {
        entities: next.data.entities.length,
        relationships: next.data.relationships.length,
        sources: next.data.sources.length,
        notes: next.data.notes.length,
      },
      skipped: bundle.skipped,
    },
  };
}

// ── Sources → BundleFile[] ─────────────────────────────────────────────────

export async function zipToBundleFiles(data: ArrayBuffer | Blob): Promise<BundleFile[]> {
  const zip = await JSZip.loadAsync(data);
  const files: BundleFile[] = [];
  zip.forEach((path, entry) => {
    if (entry.dir) return;
    files.push({ path, text: () => entry.async('string') });
  });
  return files;
}

/** Browser folder picker (<input webkitdirectory>) or drag-and-drop. */
export function fileListToBundleFiles(list: FileList | File[]): BundleFile[] {
  return Array.from(list)
    .filter((f) => f.size <= MAX_FILE_BYTES)
    .map((f) => ({ path: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name, text: () => f.text() }));
}

/** Pre-read files from the desktop main process. */
export function textFilesToBundleFiles(files: { path: string; text: string }[]): BundleFile[] {
  return files.map((f) => ({ path: f.path, text: async () => f.text }));
}
