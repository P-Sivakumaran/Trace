import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { BUILD_ID_PATTERN, createBuildId, gitCommit12, utcTimestamp } from '../../build/buildId';

describe('build id', () => {
  it('formats the timestamp in UTC with zero padding', () => {
    expect(utcTimestamp(new Date(Date.UTC(2026, 0, 2, 3, 4, 5)))).toBe('20260102030405');
    // 23:30 at UTC-5 is already the next day in UTC
    expect(utcTimestamp(new Date('2026-12-31T23:30:00-05:00'))).toBe('20270101043000');
  });

  it('uses the first 12 chars of HEAD inside this repository', () => {
    const head = execFileSync('git', ['rev-parse', 'HEAD']).toString().trim();
    expect(gitCommit12()).toBe(head.slice(0, 12));
    const id = createBuildId(new Date(Date.UTC(2026, 10, 10, 12, 0, 0)));
    expect(id).toBe(`20261110120000-${head.slice(0, 12)}`);
    expect(id).toMatch(BUILD_ID_PATTERN);
  });

  it('falls back to "unknown" outside a git repository', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-nogit-'));
    try {
      expect(gitCommit12(dir)).toBe('unknown');
      expect(createBuildId(new Date(Date.UTC(2026, 10, 10, 12, 0, 0)), dir)).toBe('20261110120000-unknown');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('falls back to "unknown" in a repository without commits', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-emptygit-'));
    try {
      execFileSync('git', ['init', '-q'], { cwd: dir });
      expect(gitCommit12(dir)).toBe('unknown');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
