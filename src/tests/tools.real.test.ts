/**
 * Real end-to-end check: installs Sherlock from PyPI into a temporary tools
 * folder, runs it and parses the output. Needs network + Python 3.9+.
 * Opt-in:  TRACE_REAL_TOOLS=1 npx vitest run src/tests/tools.real.test.ts
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ToolManager } from '../../electron/tools';
import { getToolSpec } from '../services/tools/catalog';
import { toolOutputToBatch } from '../services/tools/parsers';

describe.skipIf(!process.env.TRACE_REAL_TOOLS)('real tool install + run', () => {
  it('installs, runs and uninstalls Sherlock', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-real-tools-'));
    const mgr = new ToolManager(root);
    const log: string[] = [];
    try {
      const py = await mgr.findPython();
      expect(py.found).toBe(true);
      const inst = await mgr.install('sherlock', (l) => log.push(l));
      expect(inst, log.slice(-20).join('\n')).toEqual({ ok: true });
      expect(mgr.status().find((t) => t.id === 'sherlock')?.installed).toBe(true);

      const r: any = await mgr.run('sherlock', 'torvalds', 'real1', () => {});
      expect(r.ok).toBe(true);
      const batch = toolOutputToBatch(getToolSpec('sherlock')!, { value: r.value }, r.stdout);
      const sites = batch.entities.slice(1).map((e) => e.attributes?.platform);
      console.log(`sherlock: exit ${r.exitCode}, ${sites.length} hits in ${r.durationMs}ms, e.g. ${sites.slice(0, 8).join(', ')}`);
      expect(sites).toContain('GitHub');

      expect(mgr.uninstall('sherlock')).toEqual({ ok: true });
      expect(mgr.status().find((t) => t.id === 'sherlock')?.installed).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 900_000);
});
