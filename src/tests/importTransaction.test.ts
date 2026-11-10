import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { transactionalImport, cleanupOrphanedImports } from '../../electron/importTransaction';
import { createSampleProject } from '../services/storage/sampleData';
import { serializeEntityFile, serializeProjectFile } from '../services/markdownParser';

let workspace: string;

beforeEach(() => {
  workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-import-'));
});

afterEach(() => {
  fs.rmSync(workspace, { recursive: true, force: true });
});

async function archive(id = 'import-case') {
  const sample = createSampleProject();
  sample.project.id = id;
  const zip = new JSZip();
  zip.file('project.md', serializeProjectFile(sample.project));
  zip.file(`entities/${sample.entities[0].id}.md`, serializeEntityFile(sample.entities[0]));
  return { buffer: await zip.generateAsync({ type: 'arraybuffer' }), sample };
}

describe('transactionalImport', () => {
  it('moves a fully staged case into projects/ in one step', async () => {
    const { buffer } = await archive('import-case');
    const id = await transactionalImport(workspace, buffer, []);
    expect(id).toBe('import-case');
    const projectDir = path.join(workspace, 'projects', id);
    expect(fs.existsSync(path.join(projectDir, 'project.md'))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, 'entities'))).toBe(true);
    // Nothing should be left staged once the case is live.
    const stagingRoot = path.join(workspace, '.trace-import-staging');
    expect(fs.existsSync(stagingRoot) ? fs.readdirSync(stagingRoot) : []).toEqual([]);
  });

  it('remaps the id instead of colliding with an existing case', async () => {
    const { buffer } = await archive('import-case');
    const first = await transactionalImport(workspace, buffer, []);
    const { buffer: second } = await archive('import-case');
    const secondId = await transactionalImport(workspace, second, [first]);
    expect(secondId).not.toBe(first);
    expect(fs.existsSync(path.join(workspace, 'projects', first, 'project.md'))).toBe(true);
    expect(fs.existsSync(path.join(workspace, 'projects', secondId, 'project.md'))).toBe(true);
  });

  it('leaves no partial case and no orphaned staging directory when the final rename is blocked', async () => {
    const { buffer } = await archive('import-case');
    const projectsDir = path.join(workspace, 'projects');
    fs.mkdirSync(projectsDir, { recursive: true });
    const existingProjectDir = path.join(projectsDir, 'import-case');
    fs.mkdirSync(existingProjectDir);
    fs.writeFileSync(path.join(existingProjectDir, 'project.md'), 'pre-existing, untouched');

    // existingProjectIds omits 'import-case' on purpose: the directory-existence check inside
    // transactionalImport itself is what must catch this, not the caller-supplied id list.
    await expect(transactionalImport(workspace, buffer, [])).rejects.toThrow('already exists');

    expect(fs.readFileSync(path.join(existingProjectDir, 'project.md'), 'utf-8')).toBe('pre-existing, untouched');
    const stagingRoot = path.join(workspace, '.trace-import-staging');
    expect(fs.existsSync(stagingRoot) ? fs.readdirSync(stagingRoot) : []).toEqual([]);
  });
});

describe('cleanupOrphanedImports', () => {
  it('discards staging left behind by an import that never finished its rename', () => {
    const stagingRoot = path.join(workspace, '.trace-import-staging');
    fs.mkdirSync(path.join(stagingRoot, 'abandoned'), { recursive: true });
    fs.writeFileSync(path.join(stagingRoot, 'abandoned', 'project.md'), 'half-written');

    cleanupOrphanedImports(workspace);

    expect(fs.existsSync(stagingRoot)).toBe(false);
  });
});
