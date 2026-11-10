/**
 * Portable Python for running catalog tools when the machine has none.
 *
 * Uses python-build-standalone (the relocatable CPython builds also used by
 * uv / Rye): a pinned release, downloaded over HTTPS from GitHub, verified
 * against a pinned SHA-256, extracted into <userData>/python/<version>/.
 * No admin rights, nothing installed system-wide; deleting the folder removes it.
 */
import { createHash } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export const PORTABLE_PYTHON = {
  version: '3.12.15',
  release: '20261021',
  /** platform-arch → [triple, sha256] (from the release's SHA256SUMS) */
  builds: {
    'darwin-arm64': ['aarch64-apple-darwin', 'a18cc33862b53bd54a148c710def5375c1b47470cccedf817a19c2d211764584'],
    'darwin-x64': ['x86_64-apple-darwin', '869e0b30959beccc616ce14907439f4d0b3170c5830a2362dade07f07b0ed3b8'],
    'win32-x64': ['x86_64-pc-windows-msvc', 'be7f14464d1d66f84429ad27e01f6d1482963afff64a2fb5256b2a51c7b5d398'],
    'win32-arm64': ['aarch64-pc-windows-msvc', 'c0660992e1907a8dc31e9069676b1415d585b53f17d0aa7e9075f4b06f38fd65'],
    'linux-x64': ['x86_64-unknown-linux-gnu', '5ff9f0602ce964a529ed1e8555d3abab6341926d724402ba9a15e9e877191124'],
    'linux-arm64': ['aarch64-unknown-linux-gnu', 'f53cca8fcd20805bddaa8bff1ef722a6918f8225d37561bd36ad901d13d580af'],
  } as Record<string, [string, string]>,
};

export function portableBuildFor(platform = process.platform, arch = process.arch) {
  const b = PORTABLE_PYTHON.builds[`${platform}-${arch}`];
  if (!b) return null;
  const [triple, sha256] = b;
  const file = `cpython-${PORTABLE_PYTHON.version}+${PORTABLE_PYTHON.release}-${triple}-install_only.tar.gz`;
  return {
    file,
    sha256,
    url: `https://github.com/astral-sh/python-build-standalone/releases/download/${PORTABLE_PYTHON.release}/${encodeURIComponent(file)}`,
  };
}

/** Executable inside an extracted install_only archive. */
export function portablePythonExe(root: string, platform = process.platform): string {
  const base = path.join(root, PORTABLE_PYTHON.version, 'python');
  return platform === 'win32' ? path.join(base, 'python.exe') : path.join(base, 'bin', 'python3');
}

export function hasPortablePython(root: string): boolean {
  return fs.existsSync(portablePythonExe(root)) && fs.existsSync(path.join(root, PORTABLE_PYTHON.version, '.complete'));
}

type Log = (line: string, stream: 'stdout' | 'stderr' | 'info') => void;

function run(cmd: string, args: string[]): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { shell: false, windowsHide: true });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('error', (e) => resolve({ code: -1, out: String(e.message) }));
    child.on('close', (code) => resolve({ code, out }));
  });
}

/**
 * Downloads, verifies and extracts the portable Python. Returns the path of
 * the python executable. Idempotent: returns immediately when present.
 */
export async function installPortablePython(
  root: string,
  log: Log,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; exe: string } | { ok: false; error: string }> {
  if (hasPortablePython(root)) return { ok: true, exe: portablePythonExe(root) };
  const build = portableBuildFor();
  if (!build) return { ok: false, error: `No portable Python build for ${process.platform}-${process.arch}. Install Python 3.9+ manually.` };

  const target = path.join(root, PORTABLE_PYTHON.version);
  const archive = path.join(root, `${build.file}.download`);
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });

  try {
    log(`Downloading Python ${PORTABLE_PYTHON.version} (python-build-standalone ${PORTABLE_PYTHON.release})…`, 'info');
    const res = await fetchImpl(build.url, { redirect: 'follow' });
    if (!res.ok || !res.body) throw new Error(`Download failed: HTTP ${res.status}`);
    const total = Number(res.headers.get('content-length')) || 0;
    const hash = createHash('sha256');
    let received = 0;
    let lastPct = -10;
    const counted = Readable.fromWeb(res.body as any).on('data', (chunk: Buffer) => {
      hash.update(chunk);
      received += chunk.length;
      const pct = total ? Math.floor((received / total) * 100) : -1;
      if (pct >= lastPct + 10) {
        lastPct = pct;
        log(`  ${pct}% (${(received / 1048576).toFixed(1)} MB)`, 'stdout');
      }
    });
    await pipeline(counted, fs.createWriteStream(archive));

    const digest = hash.digest('hex');
    if (digest !== build.sha256) throw new Error(`Checksum mismatch — the download was rejected (got ${digest.slice(0, 12)}…).`);
    log('Checksum verified (SHA-256).', 'info');

    log('Extracting…', 'info');
    const tar = await run('tar', ['-xzf', archive, '-C', target]);
    if (tar.code !== 0) throw new Error(`Extraction failed: ${tar.out.slice(-300)}`);

    const exe = portablePythonExe(root);
    const check = await new Promise<string | null>((resolve) =>
      execFile(exe, ['--version'], { timeout: 15000 }, (err, so, se) => resolve(err ? null : `${so}${se}`.trim())),
    );
    if (!check) throw new Error('The extracted Python does not start.');
    fs.writeFileSync(path.join(target, '.complete'), JSON.stringify({ version: PORTABLE_PYTHON.version, release: PORTABLE_PYTHON.release, sha256: build.sha256 }));
    log(`${check} ready.`, 'info');
    return { ok: true, exe };
  } catch (err: any) {
    fs.rmSync(target, { recursive: true, force: true });
    const msg = err?.message || String(err);
    log(msg, 'stderr');
    return { ok: false, error: /fetch failed|ENOTFOUND|ECONN|ETIMEDOUT/i.test(msg) ? 'Could not download Python — check your internet connection.' : msg };
  } finally {
    fs.rmSync(archive, { force: true });
  }
}
