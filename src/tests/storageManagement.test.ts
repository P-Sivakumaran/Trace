import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { formatBytes } from '../utils/format';
import { tokenizeJson, tokenizeShell } from '../components/common/CodeBlock';
import { collectUsage, dirSize, removeProjectDir } from '../../electron/diskUsage';
import { BrowserStorageAdapter } from '../services/storage/BrowserStorageAdapter';

describe('formatBytes', () => {
  it('formats sizes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(10 * 1024 * 1024)).toBe('10 MB');
    expect(formatBytes(3.2 * 1024 ** 3)).toBe('3.2 GB');
    expect(formatBytes(-5)).toBe('0 B');
    expect(formatBytes(NaN)).toBe('0 B');
  });
});

describe('syntax highlighting tokenizers', () => {
  const kinds = (t: { kind: string; text: string }[], k: string) => t.filter((x) => x.kind === k).map((x) => x.text);
  it('tokenizes JSON keys, strings, numbers, literals and punctuation', () => {
    const t = tokenizeJson('{\n  "a": "x/y",\n  "n": -1.5e3,\n  "ok": true,\n  "z": null,\n  "list": ["q"]\n}');
    expect(kinds(t, 'key')).toEqual(['"a"', '"n"', '"ok"', '"z"', '"list"']);
    expect(kinds(t, 'string')).toEqual(['"x/y"', '"q"']);
    expect(kinds(t, 'number')).toEqual(['-1.5e3']);
    expect(kinds(t, 'literal')).toEqual(['true', 'null']);
    expect(t.map((x) => x.text).join('')).toBe('{\n  "a": "x/y",\n  "n": -1.5e3,\n  "ok": true,\n  "z": null,\n  "list": ["q"]\n}');
  });
  it('is lossless for strings with escapes', () => {
    const src = '{"p": "C:\\\\Users\\\\a \\"b\\""}';
    expect(tokenizeJson(src).map((x) => x.text).join('')).toBe(src);
  });
  it('tokenizes a shell command', () => {
    const src = 'claude mcp add trace -e ELECTRON_RUN_AS_NODE=1 -- "/Applications/Trace.app/Contents/MacOS/Trace" "/x/y.mjs"';
    const t = tokenizeShell(src);
    expect(kinds(t, 'command')).toEqual(['claude']);
    expect(kinds(t, 'flag')).toEqual(['-e']);
    expect(kinds(t, 'env')).toEqual(['ELECTRON_RUN_AS_NODE=']);
    expect(kinds(t, 'path')).toEqual(['"/Applications/Trace.app/Contents/MacOS/Trace"', '"/x/y.mjs"']);
    expect(t.map((x) => x.text).join('')).toBe(src);
  });
});

describe('disk usage and project removal', () => {
  let ws: string;
  beforeEach(() => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-usage-'));
    for (const [id, size] of [['alpha', 1000], ['beta', 250]] as const) {
      fs.mkdirSync(path.join(ws, 'projects', id, 'entities'), { recursive: true });
      fs.writeFileSync(path.join(ws, 'projects', id, 'project.md'), 'x'.repeat(size));
      fs.writeFileSync(path.join(ws, 'projects', id, 'entities', 'e.md'), 'y'.repeat(100));
    }
    fs.symlinkSync('/etc/hosts', path.join(ws, 'projects', 'alpha', 'link'));
  });

  it('sums regular files, ignores symlinks, and breaks the total down', async () => {
    expect(await dirSize(path.join(ws, 'projects', 'alpha'))).toEqual({ bytes: 1100, files: 2 });
    expect(await dirSize(path.join(ws, 'missing'))).toEqual({ bytes: 0, files: 0 });
    const tools = path.join(ws, 'tools-x');
    fs.mkdirSync(tools);
    fs.writeFileSync(path.join(tools, 'f'), 'z'.repeat(40));
    const u = await collectUsage({ workspacePath: ws, toolsDir: tools, pythonDir: path.join(ws, 'nope'), names: { alpha: 'Alpha case' } });
    expect(u.projects.map((p) => [p.id, p.name, p.bytes])).toEqual([['alpha', 'Alpha case', 1100], ['beta', 'beta', 350]]);
    expect(u).toMatchObject({ projectsBytes: 1450, toolsBytes: 40, pythonBytes: 0, removedBytes: 0, totalBytes: 1490 });
  });

  it("'keep' moves the folder to removed/ with its files intact", async () => {
    const r = await removeProjectDir(ws, path.join(ws, 'projects', 'beta'), 'keep', async () => { throw new Error('no trash'); }, new Date('2026-11-10T10:20:30Z'));
    expect(r.movedTo).toBe(path.join(ws, 'removed', 'beta-20261110102030'));
    expect(fs.existsSync(path.join(ws, 'projects', 'beta'))).toBe(false);
    expect(fs.readFileSync(path.join(r.movedTo!, 'project.md'), 'utf-8')).toHaveLength(250);
    expect((await collectUsage({ workspacePath: ws, toolsDir: '/nope', pythonDir: '/nope', names: {} })).removedBytes).toBe(350);
    // same second, same id → unique name
    fs.mkdirSync(path.join(ws, 'projects', 'beta'));
    const r2 = await removeProjectDir(ws, path.join(ws, 'projects', 'beta'), 'keep', async () => {}, new Date('2026-11-10T10:20:30Z'));
    expect(r2.movedTo).toBe(path.join(ws, 'removed', 'beta-20261110102030-2'));
  });

  it("'trash' goes through the trash handler and never deletes on failure", async () => {
    const trashed: string[] = [];
    await removeProjectDir(ws, path.join(ws, 'projects', 'alpha'), 'trash', async (p) => { trashed.push(p); });
    expect(trashed).toEqual([path.join(ws, 'projects', 'alpha')]);
    await expect(removeProjectDir(ws, path.join(ws, 'projects', 'beta'), 'trash', async () => { throw new Error('Trash unavailable'); })).rejects.toThrow('Trash unavailable');
    expect(fs.existsSync(path.join(ws, 'projects', 'beta', 'project.md'))).toBe(true);
  });

  it("'delete' removes permanently; anything outside projects/ is refused", async () => {
    await removeProjectDir(ws, path.join(ws, 'projects', 'beta'), 'delete', async () => {});
    expect(fs.existsSync(path.join(ws, 'projects', 'beta'))).toBe(false);
    fs.mkdirSync(path.join(ws, 'other'));
    await expect(removeProjectDir(ws, path.join(ws, 'other'), 'delete', async () => {})).rejects.toThrow(/outside/);
    await expect(removeProjectDir(ws, path.join(ws, 'projects', 'alpha', 'entities'), 'delete', async () => {})).rejects.toThrow(/outside/);
    expect(fs.existsSync(path.join(ws, 'other'))).toBe(true);
  });
});

describe('browser storage usage', () => {
  beforeEach(() => {
    const store: Record<string, string> = {};
    (globalThis as any).localStorage = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = String(v); },
      removeItem: (k: string) => { delete store[k]; },
      clear: () => { for (const k in store) delete store[k]; },
      key: (i: number) => Object.keys(store)[i] ?? null,
      get length() { return Object.keys(store).length; },
    };
  });
  it('reports per-project and total bytes', async () => {
    const a = new BrowserStorageAdapter();
    const p1 = await a.createProject('Big case', 'x'.repeat(5000), 'big');
    await a.createProject('Small', '', 'small');
    const u = await a.getStorageUsage();
    expect(u.kind).toBe('browser');
    expect(u.projects.map((p) => p.bytes)).toEqual([...u.projects.map((p) => p.bytes)].sort((x, y) => y - x)); // largest first
    expect(u.projects.find((p) => p.id === 'big')!.bytes).toBeGreaterThan(10000);
    expect(u.projects.find((p) => p.id === p1.id)!.name).toBe('Big case');
    expect(u.totalBytes).toBeGreaterThanOrEqual(u.projectsBytes);
  });
});
