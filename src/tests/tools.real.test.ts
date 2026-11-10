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

  it('installs a portable Python and runs a tool on it when the system has none', async () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-real-py-'));
    const mgr = new ToolManager(path.join(base, 'tools'), path.join(base, 'python'));
    const log: string[] = [];
    try {
      const py = await mgr.installPython((l) => log.push(l));
      expect(py, log.join('\n')).toEqual({ ok: true });
      const info = await mgr.findPython(true);
      expect(info).toMatchObject({ found: true, managed: true });
      console.log(`portable python: ${info.version} at ${info.exe}`);
      const inst = await mgr.install('holehe', (l) => log.push(l));
      expect(inst, log.slice(-20).join('\n')).toEqual({ ok: true });
      const r: any = await mgr.run('holehe', 'test@example.com', 'realpy1', () => {});
      expect(r.ok).toBe(true);
      expect(r.exitCode).toBe(0);
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  }, 900_000);

  it('installs and runs DNSRecon, dnstwist and Ignorant for real', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-real-new-'));
    const mgr = new ToolManager(path.join(root, 'tools'), path.join(root, 'python'));
    const log: string[] = [];
    try {
      for (const id of ['dnsrecon', 'dnstwist', 'ignorant']) {
        expect(await mgr.install(id, (l) => log.push(l)), log.slice(-10).join('\n')).toEqual({ ok: true });
      }
      const dns: any = await mgr.run('dnsrecon', 'example.com', 'n1', () => {});
      const dnsBatch = toolOutputToBatch(getToolSpec('dnsrecon')!, { value: dns.value }, dns.stdout);
      console.log(`dnsrecon: exit ${dns.exitCode}, ${dnsBatch.entities.length} entities, ${dnsBatch.relationships.length} links, ${dnsBatch.unmapped.length} kept`);
      expect(dnsBatch.entities.some((e) => e.type === 'ip')).toBe(true);

      const tw: any = await mgr.run('dnstwist', 'example.com', 'n2', () => {});
      const twBatch = toolOutputToBatch(getToolSpec('dnstwist')!, { value: tw.value }, tw.stdout);
      console.log(`dnstwist: exit ${tw.exitCode}, ${twBatch.entities.length - 1} look-alikes in ${tw.durationMs}ms`);
      expect(twBatch.entities.length).toBeGreaterThan(1);

      const ig: any = await mgr.run('ignorant', '+1 2025550123', 'n3', () => {});
      const igBatch = toolOutputToBatch(getToolSpec('ignorant')!, { value: ig.value }, ig.stdout);
      console.log(`ignorant: exit ${ig.exitCode}, ${igBatch.entities.length - 1} services: ${igBatch.entities.slice(1).map((e) => e.attributes?.platform).join(', ')}`);
      expect(ig.ok).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 900_000);
});
