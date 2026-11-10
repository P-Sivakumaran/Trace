import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PORTABLE_PYTHON, installPortablePython, portableBuildFor, portablePythonExe, hasPortablePython } from '../../electron/python';

describe('portable Python', () => {
  it('has a pinned, checksummed build for every packaged platform', () => {
    for (const k of ['darwin-arm64', 'darwin-x64', 'win32-x64', 'linux-x64']) {
      const [platform, arch] = k.split('-');
      const b = portableBuildFor(platform as NodeJS.Platform, arch);
      expect(b?.url).toMatch(/^https:\/\/github\.com\/astral-sh\/python-build-standalone\/releases\/download\/\d{8}\//);
      expect(b?.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(portableBuildFor('aix' as NodeJS.Platform, 'ppc64')).toBeNull();
    expect(portablePythonExe('/r', 'win32')).toMatch(/python\.exe$/);
    expect(portablePythonExe('/r', 'darwin')).toBe(path.join('/r', PORTABLE_PYTHON.version, 'python', 'bin', 'python3'));
  });

  it('rejects a download whose checksum does not match and leaves nothing behind', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-py-'));
    const logs: string[] = [];
    const fakeFetch = (async () => new Response('not a python archive', { status: 200 })) as typeof fetch;
    const r = await installPortablePython(root, (l) => logs.push(l), fakeFetch);
    expect(r).toMatchObject({ ok: false });
    expect((r as any).error).toMatch(/Checksum mismatch/);
    expect(hasPortablePython(root)).toBe(false);
    expect(fs.readdirSync(root)).toEqual([]);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('reports network failures clearly', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-py-'));
    const r = await installPortablePython(root, () => {}, (async () => { throw new TypeError('fetch failed'); }) as typeof fetch);
    expect(r).toEqual({ ok: false, error: 'Could not download Python — check your internet connection.' });
    fs.rmSync(root, { recursive: true, force: true });
  });
});
