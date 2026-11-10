import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveWorkspacePath } from '../../electron/workspacePath';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-workspace-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('resolveWorkspacePath', () => {
  it('keeps the saved path when it is a real directory', () => {
    expect(resolveWorkspacePath(dir, '/fallback')).toBe(dir);
  });

  it('falls back when nothing was saved yet', () => {
    expect(resolveWorkspacePath(undefined, dir)).toBe(dir);
  });

  it('falls back silently when the saved path no longer exists', () => {
    const missing = path.join(dir, 'does-not-exist');
    expect(resolveWorkspacePath(missing, dir)).toBe(dir);
  });

  it('falls back when the saved path now points at a file instead of a directory', () => {
    const filePath = path.join(dir, 'not-a-directory');
    fs.writeFileSync(filePath, 'corrupt config pointed here');
    expect(resolveWorkspacePath(filePath, dir)).toBe(dir);
  });
});
