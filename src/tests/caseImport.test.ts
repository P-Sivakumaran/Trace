import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import {
  applyImportTarget,
  findCaseRoot,
  readCaseBundle,
  resolveImportTarget,
  textFilesToBundleFiles,
  zipToBundleFiles,
} from '../services/import/caseBundle';
import { readImportSelection } from '../../electron/caseFiles';
import { createSampleProject } from '../services/storage/sampleData';
import {
  serializeEntityFile,
  serializeNoteFile,
  serializeProjectFile,
  serializeRelationshipFile,
  serializeSourceFile,
} from '../services/markdownParser';

const sample = createSampleProject();

function caseFiles(prefix = ''): { path: string; text: string }[] {
  return [
    { path: `${prefix}project.md`, text: serializeProjectFile(sample.project) },
    ...sample.entities.map((e) => ({ path: `${prefix}entities/${e.id}.md`, text: serializeEntityFile(e) })),
    ...sample.relationships.map((r) => ({ path: `${prefix}relationships/${r.id}.md`, text: serializeRelationshipFile(r) })),
    ...sample.sources.map((s) => ({ path: `${prefix}sources/${s.id}.md`, text: serializeSourceFile(s) })),
    ...sample.notes.map((n) => ({ path: `${prefix}notes/${n.id}.md`, text: serializeNoteFile(n) })),
    { path: `${prefix}graph-layout.json`, text: JSON.stringify({ positions: { a: { x: 1, y: 2 } } }) },
  ];
}

describe('case bundle reader', () => {
  it('reads a case from a folder selection (case folder as root or wrapped)', async () => {
    for (const prefix of ['', 'my-case/']) {
      const b = await readCaseBundle(textFilesToBundleFiles(caseFiles(prefix)), 'x');
      expect(b.data.project.id).toBe(sample.project.id);
      expect(b.data.entities).toHaveLength(sample.entities.length);
      expect(b.data.relationships).toHaveLength(sample.relationships.length);
      expect(b.data.sources).toHaveLength(sample.sources.length);
      expect(b.data.notes).toHaveLength(sample.notes.length);
      expect(b.layout.positions.a).toEqual({ x: 1, y: 2 });
      expect(b.skipped).toEqual([]);
    }
  });

  it('reads a zip, including one produced with a wrapper folder', async () => {
    const zip = new JSZip();
    caseFiles('wrapper/').forEach((f) => zip.file(f.path, f.text));
    zip.file('__MACOSX/._project.md', 'junk');
    const files = await zipToBundleFiles(await zip.generateAsync({ type: 'arraybuffer' }));
    const b = await readCaseBundle(files, 'wrapper');
    expect(b.data.entities).toHaveLength(sample.entities.length);
  });

  it('reports unrelated files without importing them, and ignores system files', async () => {
    const files = [...caseFiles(), { path: 'notes.txt', text: 'x' }, { path: 'entities/sub/deep.md', text: 'x' }, { path: '.DS_Store', text: '' }];
    const b = await readCaseBundle(textFilesToBundleFiles(files), 'x');
    expect(b.skipped.sort()).toEqual(['entities/sub/deep.md', 'notes.txt']);
  });

  it('survives a corrupt layout file', async () => {
    const files = caseFiles().map((f) => (f.path === 'graph-layout.json' ? { ...f, text: '{nope' } : f));
    expect((await readCaseBundle(textFilesToBundleFiles(files), 'x')).layout).toEqual({ positions: {} });
  });

  it('gives clear errors for bad selections', async () => {
    expect(() => findCaseRoot(['readme.md', 'entities/a.md'])).toThrow(/No project\.md/);
    expect(() => findCaseRoot(['a/project.md', 'b/project.md'])).toThrow(/single investigation/);
    // Shallowest project.md wins over nested ones
    expect(findCaseRoot(['case/project.md', 'case/archive/old/project.md'])).toBe('case/');
    await expect(readCaseBundle(textFilesToBundleFiles([{ path: '../evil/project.md', text: '' }]), 'x')).rejects.toThrow(/No project\.md/);
  });
});

describe('import target (never overwrites)', () => {
  it('keeps the id when free, copies when taken', () => {
    expect(resolveImportTarget({ id: 'case-a', name: 'A' }, ['other'])).toEqual({ id: 'case-a', name: 'A', renamed: false });
    expect(resolveImportTarget({ id: 'case-a', name: 'A' }, ['case-a'])).toEqual({ id: 'case-a-imported', name: 'A (imported)', renamed: true });
    expect(resolveImportTarget({ id: 'case-a', name: 'A' }, ['case-a', 'case-a-imported', 'case-a-imported-2']).id).toBe('case-a-imported-3');
  });

  it('replaces unsafe ids from untrusted archives', () => {
    for (const bad of ['../../etc', 'a/b', '', '..']) {
      const t = resolveImportTarget({ id: bad, name: 'Weird Name!' }, []);
      expect(t.id).toBe('imported-weird-name');
      expect(t.renamed).toBe(true);
    }
  });

  it('applyImportTarget returns counts and leaves the source bundle untouched', async () => {
    const b = await readCaseBundle(textFilesToBundleFiles(caseFiles()), 'x');
    const { bundle, summary } = applyImportTarget(b, [sample.project.id]);
    expect(bundle.data.project.id).toBe(`${sample.project.id}-imported`);
    expect(b.data.project.id).toBe(sample.project.id);
    expect(summary).toMatchObject({ renamed: true, counts: { entities: sample.entities.length } });
  });
});

describe('desktop selection reader', () => {
  let dir: string;
  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-pick-'));
    const root = path.join(dir, 'case');
    for (const f of caseFiles()) {
      fs.mkdirSync(path.dirname(path.join(root, f.path)), { recursive: true });
      fs.writeFileSync(path.join(root, f.path), f.text);
    }
    fs.writeFileSync(path.join(root, 'image.png'), 'png');
    fs.mkdirSync(path.join(root, '.git'));
    fs.writeFileSync(path.join(root, '.git', 'config.md'), 'secret');
    fs.symlinkSync('/etc/hosts', path.join(root, 'entities', 'link.md'));
    fs.mkdirSync(path.join(dir, 'empty'));
    fs.writeFileSync(path.join(dir, 'x.txt'), 'x');
    const zip = new JSZip();
    caseFiles().forEach((f) => zip.file(f.path, f.text));
    fs.writeFileSync(path.join(dir, 'case.zip'), await zip.generateAsync({ type: 'nodebuffer' }));
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('reads a folder, skipping symlinks, hidden folders and non-case files', async () => {
    const r = readImportSelection(path.join(dir, 'case'));
    expect(r.ok && r.kind === 'folder').toBe(true);
    if (r.ok && r.kind === 'folder') {
      const paths = r.files.map((f) => f.path);
      expect(paths).toContain('project.md');
      expect(paths).not.toContain('image.png');
      expect(paths.some((p) => p.includes('.git') || p.includes('link.md'))).toBe(false);
      const b = await readCaseBundle(textFilesToBundleFiles(r.files), r.name);
      expect(b.data.entities).toHaveLength(sample.entities.length);
    }
  });

  it('accepts project.md as the entry point', () => {
    const r = readImportSelection(path.join(dir, 'case', 'project.md'));
    expect(r).toMatchObject({ ok: true, kind: 'folder', name: 'case' });
  });

  it('returns zip bytes and rejects everything else with a message', () => {
    expect(readImportSelection(path.join(dir, 'case.zip'))).toMatchObject({ ok: true, kind: 'zip', name: 'case' });
    expect(readImportSelection(path.join(dir, 'empty'))).toMatchObject({ ok: false, error: expect.stringMatching(/no project\.md/) });
    expect(readImportSelection(path.join(dir, 'x.txt'))).toMatchObject({ ok: false });
    expect(readImportSelection(path.join(dir, 'missing'))).toMatchObject({ ok: false });
  });
});
