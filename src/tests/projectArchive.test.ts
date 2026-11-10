import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readProjectArchive } from '../services/storage/projectArchive';
import { BrowserStorageAdapter } from '../services/storage/BrowserStorageAdapter';
import { ElectronStorageAdapter } from '../services/storage/ElectronStorageAdapter';
import { createSampleProject } from '../services/storage/sampleData';
import { serializeEntityFile, serializeProjectFile } from '../services/markdownParser';

async function archive(prefix = 'projects/case[1].+/') {
  const sample = createSampleProject();
  sample.project.id = 'archive-case';
  const zip = new JSZip();
  zip.file(`${prefix}project.md`, serializeProjectFile(sample.project));
  zip.file(`${prefix}entities/${sample.entities[0].id}.md`, serializeEntityFile(sample.entities[0]));
  zip.file(`${prefix}graph-layout.json`, JSON.stringify({ positions: { [sample.entities[0].id]: { x: 17, y: -3 } } }));
  return { zip, sample };
}

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    get length() { return store.size; },
    key: (index: number) => [...store.keys()][index] ?? null,
  });
});

describe('case archive import', () => {
  it('reads literal archive directories containing regex characters and preserves positions', async () => {
    const { zip, sample } = await archive();
    const { data, layout } = await readProjectArchive(await zip.generateAsync({ type: 'arraybuffer' }));
    expect(data.entities.map((entity) => entity.id)).toEqual([sample.entities[0].id]);
    expect(layout.positions[sample.entities[0].id]).toEqual({ x: 17, y: -3 });
  });

  it('rejects ambiguous case roots, unsafe IDs and invalid coordinates before writing', async () => {
    const { zip } = await archive();
    zip.file('other/project.md', await zip.file('projects/case[1].+/project.md')!.async('string'));
    await expect(readProjectArchive(await zip.generateAsync({ type: 'arraybuffer' }))).rejects.toThrow('exactly one');
    const unsafe = await archive();
    unsafe.sample.project.id = '../outside';
    unsafe.zip.file('projects/case[1].+/project.md', serializeProjectFile(unsafe.sample.project));
    await expect(readProjectArchive(await unsafe.zip.generateAsync({ type: 'arraybuffer' }))).rejects.toThrow();
    const broken = await archive();
    broken.zip.file('projects/case[1].+/graph-layout.json', '{"positions":{"e":{"x":"bad","y":3}}}');
    await expect(readProjectArchive(await broken.zip.generateAsync({ type: 'arraybuffer' }))).rejects.toThrow();
  });

  it('browser import preserves an existing case when the incoming ID collides', async () => {
    const storage = new BrowserStorageAdapter();
    await storage.createProject('Keep this case', '', 'archive-case');
    const { zip } = await archive();
    const imported = await storage.importProjectZip(await zip.generateAsync({ type: 'arraybuffer' }));
    expect(imported).not.toBe('archive-case');
    expect((await storage.getProject('archive-case'))?.project.name).toBe('Keep this case');
    expect((await storage.getProject(imported))?.entities).toHaveLength(1);
  });

  it('desktop validation completes before any create or save call', async () => {
    const createProject = vi.fn();
    vi.stubGlobal('window', { electronAPI: { createProject } });
    try {
      const { zip } = await archive();
      zip.file('projects/case[1].+/entities/bad.md', '---\nid: ../escape\n---\nInvalid');
      await expect(new ElectronStorageAdapter().importProjectZip(await zip.generateAsync({ type: 'arraybuffer' }))).rejects.toThrow();
      expect(createProject).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });

  it('desktop import creates a separate case and persists its active selection', async () => {
    const createProject = vi.fn().mockResolvedValue({});
    const saveWorkspace = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('window', { electronAPI: {
      listProjects: async () => [{ id: 'archive-case' }], createProject,
      saveProject: async () => {}, saveEntity: async () => {}, saveGraphLayout: async () => {},
      getWorkspace: async () => ({ id: 'workspace', activeProjectId: 'archive-case' }), saveWorkspace,
    } });
    try {
      const storage = new ElectronStorageAdapter();
      vi.spyOn(storage, 'rebuildIndex').mockResolvedValue(undefined);
      const { zip } = await archive();
      const imported = await storage.importProjectZip(await zip.generateAsync({ type: 'arraybuffer' }));
      expect(imported).not.toBe('archive-case');
      expect(createProject.mock.calls[0][2]).toBe(imported);
      expect(saveWorkspace).toHaveBeenCalledWith(expect.objectContaining({ activeProjectId: imported }));
    } finally { vi.unstubAllGlobals(); }
  });
});
