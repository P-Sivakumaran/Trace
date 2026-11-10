/**
 * Runs catalog OSINT tools from the main process.
 *
 * - Each tool lives in its own Python virtual environment:
 *   <userData>/tools/<id>/  (installed with `python -m venv` + `pip install <package>`)
 * - Only ids from TOOL_CATALOG are accepted; the command line is built here from
 *   the catalog, the renderer only supplies a validated input value.
 * - Processes are spawned without a shell, in a throw-away working directory,
 *   with a hard timeout, and can be cancelled.
 */
import { spawn, execFile, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TOOL_CATALOG, buildToolArgs, getToolSpec, normaliseToolInput, type ToolSpec } from '../src/services/tools/catalog';
import { hasPortablePython, installPortablePython, portablePythonExe } from './python';

const MAX_OUTPUT = 5 * 1024 * 1024;
const isWin = process.platform === 'win32';

export interface ToolStatus {
  id: string;
  installed: boolean;
  version?: string;
  installedAt?: string;
}

export interface PythonInfo {
  found: boolean;
  /** Display form, e.g. "python3" or the portable interpreter path. */
  command?: string;
  version?: string;
  /** True when it is TRACE's own portable Python. */
  managed?: boolean;
  /** Executable and leading args (kept separate: paths may contain spaces). */
  exe?: string;
  pre?: string[];
}

type Log = (line: string, stream: 'stdout' | 'stderr' | 'info') => void;

/** Kills a process and everything it started (tools may spawn helpers). */
function killTree(child: ChildProcess) {
  if (!child.pid || child.exitCode !== null) return;
  if (isWin) {
    execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], () => {});
    return;
  }
  try {
    process.kill(-child.pid, 'SIGTERM'); // whole process group (spawned detached)
  } catch {
    child.kill('SIGTERM');
  }
  setTimeout(() => {
    try {
      process.kill(-child.pid!, 'SIGKILL');
    } catch {
      /* already gone */
    }
  }, 3000).unref();
}

export class ToolManager {
  private running = new Map<string, ChildProcess>();
  private python: PythonInfo | null = null;

  /**
   * @param root        folder for tool virtual environments
   * @param pythonRoot  folder for TRACE's portable Python (installed on demand)
   */
  constructor(
    private readonly root: string,
    private readonly pythonRoot: string = path.join(path.dirname(root), 'python'),
  ) {}

  private dir(spec: ToolSpec) {
    return path.join(this.root, spec.id);
  }
  private venvBin(spec: ToolSpec, name: string) {
    return isWin ? path.join(this.dir(spec), 'Scripts', `${name}.exe`) : path.join(this.dir(spec), 'bin', name);
  }
  private marker(spec: ToolSpec) {
    return path.join(this.dir(spec), '.trace-tool.json');
  }

  private probe(exe: string, pre: string[]): Promise<string | null> {
    return new Promise((resolve) =>
      execFile(exe, [...pre, '--version'], { timeout: 8000 }, (err, stdout, stderr) => {
        const m = !err && /Python (3)\.(\d+)\.(\d+)/.exec(`${stdout}${stderr}`);
        resolve(m && Number(m[2]) >= 9 ? `${m[1]}.${m[2]}.${m[3]}` : null);
      }),
    );
  }

  /** TRACE's portable Python first (known-good), then the system one. */
  async findPython(force = false): Promise<PythonInfo> {
    if (this.python && !force) return this.python;
    if (hasPortablePython(this.pythonRoot)) {
      const exe = portablePythonExe(this.pythonRoot);
      const v = await this.probe(exe, []);
      if (v) return (this.python = { found: true, managed: true, exe, pre: [], command: 'TRACE portable Python', version: v });
    }
    const candidates: [string, string[]][] = isWin
      ? [['py', ['-3']], ['python', []], ['python3', []]]
      : [['python3', []], ['python', []]];
    for (const [cmd, pre] of candidates) {
      const v = await this.probe(cmd, pre);
      if (v) return (this.python = { found: true, managed: false, exe: cmd, pre, command: [cmd, ...pre].join(' '), version: v });
    }
    return (this.python = { found: false });
  }

  /** Downloads TRACE's portable Python (verified) when no usable Python exists. */
  async installPython(log: Log): Promise<{ ok: boolean; error?: string }> {
    const r = await installPortablePython(this.pythonRoot, log);
    await this.findPython(true);
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  }

  status(): ToolStatus[] {
    return TOOL_CATALOG.map((spec) => {
      const installed = fs.existsSync(this.venvBin(spec, spec.pip.bin));
      let meta: { version?: string; installed_at?: string } = {};
      try {
        meta = JSON.parse(fs.readFileSync(this.marker(spec), 'utf-8'));
      } catch {
        /* no marker */
      }
      return { id: spec.id, installed, version: installed ? meta.version : undefined, installedAt: installed ? meta.installed_at : undefined };
    });
  }

  private exec(cmd: string, args: string[], log: Log, opts: { cwd?: string; timeoutMs: number; runId?: string; capture?: boolean }) {
    return new Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean; cancelled: boolean }>((resolve) => {
      const child = spawn(cmd, args, {
        cwd: opts.cwd,
        shell: false,
        windowsHide: true,
        // Own process group on POSIX so Stop / timeout can kill helpers too.
        detached: !isWin,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1', NO_COLOR: '1', PIP_DISABLE_PIP_VERSION_CHECK: '1' },
      });
      if (opts.runId) this.running.set(opts.runId, child);
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let cancelled = false;
      const timer = setTimeout(() => {
        timedOut = true;
        killTree(child);
      }, opts.timeoutMs);
      const pipe = (stream: NodeJS.ReadableStream | null, name: 'stdout' | 'stderr') => {
        let buf = '';
        stream?.on('data', (chunk: Buffer) => {
          const text = chunk.toString('utf-8');
          if (name === 'stdout' && opts.capture && stdout.length < MAX_OUTPUT) stdout += text;
          if (name === 'stderr' && stderr.length < 64 * 1024) stderr += text;
          buf += text;
          const parts = buf.split(/\r?\n|\r/);
          buf = parts.pop() ?? '';
          parts.forEach((l) => l.trim() && log(l, name));
        });
        stream?.on('end', () => buf.trim() && log(buf, name));
      };
      pipe(child.stdout, 'stdout');
      pipe(child.stderr, 'stderr');
      child.on('error', (err) => {
        log(String(err.message || err), 'stderr');
      });
      child.on('close', (code, signal) => {
        clearTimeout(timer);
        if (opts.runId) {
          if (!this.running.has(opts.runId)) cancelled = true;
          this.running.delete(opts.runId);
        }
        if (signal && !timedOut && !cancelled) cancelled = true;
        resolve({ code, stdout, stderr, timedOut, cancelled });
      });
    });
  }

  async install(id: string, log: Log): Promise<{ ok: boolean; error?: string }> {
    const spec = getToolSpec(id);
    if (!spec) return { ok: false, error: 'Unknown tool' };
    let py = await this.findPython(true);
    if (!py.found) {
      log('Python 3.9+ not found on this computer — installing a portable Python for TRACE.', 'info');
      const r = await this.installPython(log);
      if (!r.ok) return { ok: false, error: r.error };
      py = await this.findPython(true);
    }
    if (!py.found || !py.exe) return { ok: false, error: 'Python is not available.' };
    const dir = this.dir(spec);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(this.root, { recursive: true });
    log(`Creating virtual environment (${py.command} ${py.version})…`, 'info');
    const venv = await this.exec(py.exe, [...(py.pre ?? []), '-m', 'venv', dir], log, { timeoutMs: 120_000 });
    if (venv.code !== 0) {
      fs.rmSync(dir, { recursive: true, force: true });
      return { ok: false, error: 'Could not create a Python virtual environment.' };
    }
    log(`pip install ${spec.pip.package}`, 'info');
    const vpy = this.venvBin(spec, 'python');
    const pip = await this.exec(vpy, ['-m', 'pip', 'install', '--no-input', spec.pip.package], log, { timeoutMs: 600_000 });
    if (pip.code !== 0 || !fs.existsSync(this.venvBin(spec, spec.pip.bin))) {
      fs.rmSync(dir, { recursive: true, force: true });
      return { ok: false, error: pip.timedOut ? 'Installation timed out.' : 'pip install failed — see the log.' };
    }
    const show = await this.exec(vpy, ['-m', 'pip', 'show', spec.pip.package], () => {}, { timeoutMs: 30_000, capture: true });
    const version = /^Version:\s*(\S+)/m.exec(show.stdout)?.[1];
    fs.writeFileSync(this.marker(spec), JSON.stringify({ package: spec.pip.package, version, installed_at: new Date().toISOString() }, null, 2));
    log(`Installed ${spec.name} ${version ?? ''}`.trim(), 'info');
    return { ok: true };
  }

  uninstall(id: string): { ok: boolean; error?: string } {
    const spec = getToolSpec(id);
    if (!spec) return { ok: false, error: 'Unknown tool' };
    const dir = this.dir(spec);
    // Only ever delete a direct child of the tools root.
    if (path.dirname(path.resolve(dir)) !== path.resolve(this.root)) return { ok: false, error: 'Refusing to delete outside the tools folder' };
    fs.rmSync(dir, { recursive: true, force: true });
    return { ok: true };
  }

  async run(id: string, rawInput: string, runId: string, log: Log) {
    const spec = getToolSpec(id);
    if (!spec) return { ok: false as const, error: 'Unknown tool' };
    const input = normaliseToolInput(spec.input.kind, rawInput);
    if (!input.ok) return { ok: false as const, error: input.error };
    const bin = this.venvBin(spec, spec.pip.bin);
    if (!fs.existsSync(bin)) return { ok: false as const, error: `${spec.name} is not installed` };
    if (this.running.has(runId)) return { ok: false as const, error: 'Run id already in use' };

    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), `trace-${spec.id}-`));
    const args = buildToolArgs(spec, input.value);
    log(`$ ${spec.pip.bin} ${args.join(' ')}`, 'info');
    const started = Date.now();
    try {
      const r = await this.exec(bin, args, log, { cwd, timeoutMs: spec.timeoutSec * 1000, runId, capture: true });
      return {
        ok: true as const,
        value: input.value,
        exitCode: r.code,
        stdout: r.stdout,
        stderrTail: r.stderr.slice(-4000),
        timedOut: r.timedOut,
        cancelled: r.cancelled,
        durationMs: Date.now() - started,
        startedAt: new Date(started).toISOString(),
      };
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  }

  cancel(runId: string): boolean {
    const child = this.running.get(runId);
    if (!child) return false;
    this.running.delete(runId);
    killTree(child);
    return true;
  }

  cancelAll() {
    for (const id of [...this.running.keys()]) this.cancel(id);
  }
}
