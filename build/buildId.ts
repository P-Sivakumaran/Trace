/**
 * Build ID: `YYYYMMDDHHMMSS-<12-char git commit>` (UTC).
 *
 * Generated at compile time and embedded as `__BUILD_ID__`. It identifies when
 * and from which commit a build was made; it is NOT a hash of the binary.
 * Outside a git repository (or without git) the commit part is `unknown`.
 */
import { execFileSync } from 'node:child_process';

export const BUILD_ID_PATTERN = /^\d{14}-([0-9a-f]{12}|unknown)$/;

export function utcTimestamp(date: Date = new Date()): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return (
    p(date.getUTCFullYear(), 4) +
    p(date.getUTCMonth() + 1) +
    p(date.getUTCDate()) +
    p(date.getUTCHours()) +
    p(date.getUTCMinutes()) +
    p(date.getUTCSeconds())
  );
}

export function gitCommit12(cwd: string = process.cwd()): string {
  try {
    const out = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).toString().trim();
    return /^[0-9a-f]{40,64}$/i.test(out) ? out.slice(0, 12).toLowerCase() : 'unknown';
  } catch {
    return 'unknown'; // no git, not a repository, or no commits yet
  }
}

export function createBuildId(date: Date = new Date(), cwd?: string): string {
  return `${utcTimestamp(date)}-${gitCommit12(cwd)}`;
}
