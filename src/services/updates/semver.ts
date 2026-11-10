/**
 * Minimal Semantic Versioning 2.0.0 parser/comparator (no dependency).
 * Handles optional leading "v", prerelease identifiers (alpha.1, beta.2, rc.1)
 * and ignores build metadata (+sha), per spec §10/§11.
 */

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  prerelease: (string | number)[];
  raw: string;
}

const SEMVER_RE =
  /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?$/;

export function parseSemver(input: string): SemVer | null {
  if (typeof input !== 'string') return null;
  const m = SEMVER_RE.exec(input.trim());
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease: m[4] ? m[4].split('.').map((id) => (/^\d+$/.test(id) ? Number(id) : id)) : [],
    raw: input.trim(),
  };
}

function compareIdentifiers(a: string | number, b: string | number): number {
  const an = typeof a === 'number';
  const bn = typeof b === 'number';
  if (an && bn) return (a as number) - (b as number);
  if (an) return -1; // numeric identifiers have lower precedence
  if (bn) return 1;
  return a < b ? -1 : a > b ? 1 : 0; // ASCII order for alphanumerics
}

/** Returns <0 if a<b, 0 if equal precedence, >0 if a>b. Throws on invalid input. */
export function compareSemver(a: string | SemVer, b: string | SemVer): number {
  const va = typeof a === 'string' ? parseSemver(a) : a;
  const vb = typeof b === 'string' ? parseSemver(b) : b;
  if (!va || !vb) throw new Error(`Invalid semantic version: ${!va ? String(a) : String(b)}`);
  if (va.major !== vb.major) return va.major - vb.major;
  if (va.minor !== vb.minor) return va.minor - vb.minor;
  if (va.patch !== vb.patch) return va.patch - vb.patch;
  const pa = va.prerelease;
  const pb = vb.prerelease;
  if (pa.length === 0 && pb.length === 0) return 0;
  if (pa.length === 0) return 1; // release > prerelease
  if (pb.length === 0) return -1;
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if (i >= pa.length) return -1; // shorter set of identifiers is lower
    if (i >= pb.length) return 1;
    const c = compareIdentifiers(pa[i], pb[i]);
    if (c !== 0) return c;
  }
  return 0;
}

export function isNewerVersion(candidate: string, installed: string): boolean {
  return compareSemver(candidate, installed) > 0;
}
