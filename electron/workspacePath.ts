import fs from 'node:fs';

/** A saved workspace path can point at a file, a removed drive, or nothing at all; never trust it blindly. */
export function resolveWorkspacePath(candidate: string | undefined, fallback: string): string {
  if (candidate) {
    try {
      if (fs.statSync(candidate).isDirectory()) return candidate;
      console.error(`Saved workspace path "${candidate}" is not a directory; falling back to ${fallback}`);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error(`Saved workspace path "${candidate}" is unreadable; falling back to ${fallback}`, err);
      }
    }
  }
  return fallback;
}
