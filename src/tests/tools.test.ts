import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TOOL_CATALOG, buildToolArgs, getToolSpec, normaliseToolInput } from '../services/tools/catalog';
import { parseHoleheHits, parseSiteUrlHits, toolOutputToBatch } from '../services/tools/parsers';
import { planImport, buildImportRecords } from '../services/import/plan';
import { ToolManager } from '../../electron/tools';
import { createMcpHandler, DISABLED_MESSAGE } from '../mcp/server';
import { WorkspaceReader, readAppConfig, isMcpAccessEnabled } from '../core/fsWorkspace';
import type { ProjectData } from '../types';

// Real output captured from sherlock 0.16.2 / maigret / holehe 1.61.
const SHERLOCK_OUT = `[*] Checking username torvalds on:\r\n\r\n[+] GitHub: https://www.github.com/torvalds\n[+] Reddit: https://www.reddit.com/user/torvalds\n\n[*] Search completed with 2 results\n\nGo deeper than a username. Explore public profiles and export your findings.\nTry OSINTSearch: \x1b]8;;https://osintsearch.org/go/sherlock\x1b\\https://osintsearch.org\x1b]8;;\x1b\\\n`;
const MAIGRET_OUT = `[*] DB auto-update: checking for updates...
[+] DB auto-update: database updated successfully (8969 sites)
[+] MAIGRET - collect a dossier by username from 3000+ sites
[+] Using sites database: /Users/x/.maigret/data.json (8969 sites)
[*] Checking username torvalds on:
[+] GitHub: https://github.com/torvalds
 ├─uid: 1024025
 ├─location: Portland, OR
 ├─fullname: Linus Torvalds
 └─company: Linux Foundation
[+] GitHubGist [GitHub]: https://gist.github.com/torvalds
[!] Too many errors of type "Access denied" (33.33%). It's recommended to use --cloudflare-bypass or a proxy, e.g. https://www.rapidproxy.io/?ref=soxoj
[*] Short text report:
Search by username torvalds returned 2 accounts.
`;
const HOLEHE_OUT = `**********************
   someone@example.com
**********************
[+] twitter.com
[+] instagram.com / so****@gmail.com
[-] spotify.com
[x] amazon.com
[+] Email used, [-] Email not used, [x] Rate limit
117 websites checked in 10.2 seconds
Twitter : @palenath
Github : https://github.com/megadose/holehe
`;

describe('tool catalog', () => {
  it('has the marketplace tools with pip packages', () => {
    expect(TOOL_CATALOG.map((t) => t.id)).toEqual(['sherlock', 'maigret', 'holehe', 'ignorant', 'dnsrecon', 'dnstwist']);
    expect(getToolSpec('rm')).toBeUndefined();
  });

  it('validates inputs and blocks flag injection', () => {
    expect(normaliseToolInput('username', '@torvalds')).toEqual({ ok: true, value: 'torvalds' });
    for (const bad of ['-rf', '--json=/etc/passwd', 'a b', 'x;rm', '', 'a'.repeat(65), '$(id)']) {
      expect(normaliseToolInput('username', bad).ok).toBe(false);
    }
    expect(normaliseToolInput('email', 'Ann@Example.COM')).toEqual({ ok: true, value: 'ann@example.com' });
    expect(normaliseToolInput('email', '-x@example.com').ok).toBe(false);
    expect(normaliseToolInput('email', 'nope').ok).toBe(false);
  });

  it('builds argv with the input last and never as a flag', () => {
    for (const t of TOOL_CATALOG.filter((t) => t.input.kind !== 'phone')) expect(buildToolArgs(t, 'value').at(-1)).toBe('value');
    for (const t of TOOL_CATALOG) expect(buildToolArgs(t, t.input.kind === 'phone' ? '+1 2025550123' : 'value').filter((a) => a.startsWith('-')).every((a) => /^--?[a-zA-Z-]+$/.test(a))).toBe(true);
    expect(buildToolArgs(getToolSpec('holehe')!, 'a@b.co')).toContain('-NP'); // no password-recovery probes
  });
});

describe('tool output parsers', () => {
  it('parses sherlock, ignoring banners and OSC-8 links', () => {
    expect(parseSiteUrlHits(SHERLOCK_OUT).map((h) => [h.site, h.url])).toEqual([
      ['GitHub', 'https://www.github.com/torvalds'],
      ['Reddit', 'https://www.reddit.com/user/torvalds'],
    ]);
  });

  it('parses maigret hits with profile details', () => {
    const hits = parseSiteUrlHits(MAIGRET_OUT);
    expect(hits.map((h) => h.site)).toEqual(['GitHub', 'GitHubGist']);
    expect(hits[0].details).toEqual({ uid: '1024025', location: 'Portland, OR', fullname: 'Linus Torvalds', company: 'Linux Foundation' });
    expect(hits[1].details).toEqual({});
  });

  it('parses holehe used services only', () => {
    expect(parseHoleheHits(HOLEHE_OUT).map((h) => h.site)).toEqual(['twitter.com', 'instagram.com']);
    expect(parseHoleheHits(HOLEHE_OUT)[1].details.recovery_hint).toBe('so****@gmail.com');
  });

  it('turns a run into a reviewable batch linked to the existing entity', () => {
    const project: ProjectData = {
      project: { id: 'p', type: 'project', name: 'P', created_at: '', updated_at: '', markdownBody: '' },
      entities: [{ id: 'acc-1', type: 'account', name: '@torvalds', aliases: [], created_at: '', updated_at: '', attributes: {}, tags: [], markdownBody: '' }],
      relationships: [],
      sources: [],
      notes: [],
    };
    const batch = toolOutputToBatch(getToolSpec('maigret')!, { value: 'torvalds', entity: { type: 'account', name: '@torvalds' } }, MAIGRET_OUT, new Date('2026-11-09T10:00:00Z'));
    expect(batch.entities).toHaveLength(3);
    expect(batch.entities[1]).toMatchObject({ type: 'account', name: 'torvalds (GitHub)', source_url: 'https://github.com/torvalds', attributes: { fullname: 'Linus Torvalds', platform: 'GitHub' } });
    const plan = planImport(batch, project);
    expect(plan.entities[0]).toMatchObject({ decision: 'link-existing', duplicateOf: { id: 'acc-1' } });
    const rec = buildImportRecords(plan, { existingIds: new Set(['acc-1']) });
    expect(rec.relationships.every((r) => r.source_entity === 'acc-1' && r.status === 'candidate' && r.type === 'has_account')).toBe(true);
    expect(rec.entities.every((e) => e.tags.includes('maigret') && e.tags.includes('imported'))).toBe(true);
  });

  it('reports empty runs as a warning', () => {
    const b = toolOutputToBatch(getToolSpec('holehe')!, { value: 'x@y.co' }, '117 websites checked');
    expect(b.entities).toHaveLength(1);
    expect(b.warnings[0]).toMatch(/no results/);
  });
});

describe.skipIf(process.platform === 'win32')('ToolManager (fake installed tool, no network)', () => {
  let root: string;
  let mgr: ToolManager;
  const logs: string[] = [];

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-tools-'));
    const bin = path.join(root, 'sherlock', 'bin');
    fs.mkdirSync(bin, { recursive: true });
    // Prints its argv and the cwd, then a sherlock-style hit; "slow" sleeps.
    fs.writeFileSync(
      path.join(bin, 'sherlock'),
      `#!/bin/sh\necho "ARGS:$*"\necho "CWD:$(pwd)"\nlast=""; for a in "$@"; do last="$a"; done\nif [ "$last" = "slow" ]; then sleep 30; fi\necho "[+] GitHub: https://github.com/$last"\n`,
      { mode: 0o755 },
    );
    fs.writeFileSync(path.join(root, 'sherlock', '.trace-tool.json'), JSON.stringify({ version: '0.0-test' }));
    mgr = new ToolManager(root);
  });
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  it('reports installed state from the venv', () => {
    const st = mgr.status();
    expect(st.find((t) => t.id === 'sherlock')).toMatchObject({ installed: true, version: '0.0-test' });
    expect(st.find((t) => t.id === 'holehe')?.installed).toBe(false);
  });

  it('runs with catalog argv in a temporary cwd that is cleaned up', async () => {
    const r: any = await mgr.run('sherlock', '@octocat', 'r1', (l) => logs.push(l));
    expect(r.ok).toBe(true);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('ARGS:--print-found --no-color --timeout 15 octocat');
    const cwd = /CWD:(.*)/.exec(r.stdout)![1].trim();
    expect(fs.existsSync(cwd)).toBe(false);
    expect(parseSiteUrlHits(r.stdout)[0].url).toBe('https://github.com/octocat');
    expect(logs.some((l) => l.includes('[+] GitHub'))).toBe(true);
  });

  it('rejects unknown tools, uninstalled tools and unsafe input', async () => {
    expect(await mgr.run('bash', 'x', 'r2', () => {})).toMatchObject({ ok: false });
    expect(await mgr.run('holehe', 'a@b.co', 'r3', () => {})).toMatchObject({ ok: false, error: 'Holehe is not installed' });
    expect(await mgr.run('sherlock', '--help', 'r4', () => {})).toMatchObject({ ok: false });
    expect(mgr.uninstall('../../etc')).toMatchObject({ ok: false });
  });

  it('can be cancelled', async () => {
    const p = mgr.run('sherlock', 'slow', 'r5', () => {});
    await new Promise((r) => setTimeout(r, 300));
    expect(mgr.cancel('r5')).toBe(true);
    const r: any = await p;
    expect(r.cancelled).toBe(true);
  });

  it('uninstall removes only the tool folder', () => {
    expect(mgr.uninstall('sherlock')).toEqual({ ok: true });
    expect(fs.existsSync(path.join(root, 'sherlock'))).toBe(false);
    expect(fs.existsSync(root)).toBe(true);
  });
});

describe('MCP on/off switch', () => {
  it('serves no tools and no data when disabled', async () => {
    let on = false;
    const handle = createMcpHandler(new WorkspaceReader(os.tmpdir()), 't', () => on);
    const list: any = await handle({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(list.result.tools).toEqual([]);
    const call: any = await handle({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'list_projects', arguments: {} } });
    expect(call.result).toMatchObject({ isError: true, content: [{ text: DISABLED_MESSAGE }] });
    on = true;
    const list2: any = await handle({ jsonrpc: '2.0', id: 3, method: 'tools/list' });
    expect(list2.result.tools.length).toBe(8);
  });

  it('reads the app config flag', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-cfg-'));
    const cfg = path.join(dir, 'trace-config.json');
    expect(readAppConfig({}, [cfg])).toBeNull();
    fs.writeFileSync(cfg, JSON.stringify({ workspacePath: '/w' }));
    expect(readAppConfig({}, [cfg])).toMatchObject({ mcpEnabled: false, workspacePath: '/w' });
    fs.writeFileSync(cfg, JSON.stringify({ workspacePath: '/w', mcpEnabled: true }));
    expect(readAppConfig({}, [cfg])?.mcpEnabled).toBe(true);
    expect(isMcpAccessEnabled({}, [cfg])).toBe(true);
    fs.writeFileSync(cfg, JSON.stringify({ mcpEnabled: false }));
    expect(isMcpAccessEnabled({}, [cfg])).toBe(false);
    // App data folder exists but no config yet → off by default.
    fs.rmSync(cfg);
    expect(isMcpAccessEnabled({}, [cfg])).toBe(false);
    // No app at all (source checkout) → open.
    expect(isMcpAccessEnabled({}, [path.join(dir, 'missing', 'trace-config.json')])).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

// ── Ignorant / DNSRecon / dnstwist (output captured from real runs) ─────────
const IGNORANT_OUT = `Twitter : @palenath
Github : https://github.com/megadose/ignorant
For BTC Donations : 1FHDM49QfZX6pJmhjLE5tB2K6CaTLMZpXZ



********************
   ++1 2025550123
********************
[-] amazon.com
[+] instagram.com
[x] snapchat.com

[+] Phone number used, [-] Phone number not used, [x] Rate limit
3 websites checked in 1.18 seconds
`;
const DNSRECON_OUT = `[*] std: Performing General Enumeration against: example.com...
[*] DNSSEC is configured for example.com
[*] DNSKEYs:
[*] \tNSEC ZSK ECDSAP256SHA256 323c9989e94fd06aa7888d7e8fec001b fdedd089830c8963d42c51d28a1b9194
[*] \t SOA elliott.ns.cloudflare.com 172.64.35.228
[*] \t NS elliott.ns.cloudflare.com 162.159.44.228
[*] \t NS elliott.ns.cloudflare.com 2606:4700:58::a29f:2ce4
[*] \t NS hera.ns.cloudflare.com 108.162.192.162
[*] \t MX mail.example.com 192.0.2.25
[*] \t A example.com 172.66.147.243
[*] \t A example.com 104.20.23.154
[*] \t AAAA example.com 2606:4700:10::ac42:93f3
[*] \t A www.example.com 104.20.23.154
[*] \t CNAME blog.example.com example.github.io
[*] \t TXT example.com v=spf1 -all
[*] \t TXT _dmarc.example.com v=DMARC1;p=reject;sp=reject
[*] Enumerating SRV Records
[+] 0 Records Found
`;
const DNSTWIST_OUT = JSON.stringify([
  { dns_a: ['104.20.23.154'], domain: 'example.com', fuzzer: '*original' },
  { dns_a: ['103.168.172.37'], domain: 'exampler.com', fuzzer: 'addition' },
  { dns_a: ['104.21.23.31'], dns_aaaa: ['2606:4700:3030::6815:171f'], dns_mx: ['mail.example8.com'], domain: 'example8.com', fuzzer: 'addition' },
]);

describe('new catalog tools', () => {
  it('validates domain and phone inputs', () => {
    expect(normaliseToolInput('domain', 'https://www.Example.COM:8080/a?b#c')).toEqual({ ok: true, value: 'www.example.com' });
    expect(normaliseToolInput('domain', 'example.com.')).toEqual({ ok: true, value: 'example.com' });
    for (const bad of ['', 'localhost', '-x.com', 'a b.com', 'example.com; rm -rf', '1.2.3.4', 'x'.repeat(300) + '.com']) {
      expect(normaliseToolInput('domain', bad).ok, bad).toBe(false);
    }
    expect(normaliseToolInput('phone', '+1   202-555-0123')).toEqual({ ok: true, value: '+1 2025550123' });
    expect(normaliseToolInput('phone', '+44 7911 123456')).toEqual({ ok: true, value: '+44 7911123456' });
    for (const bad of ['2025550123', '+12025550123', '+1 12', '--help', '+1 abc']) expect(normaliseToolInput('phone', bad).ok, bad).toBe(false);
  });

  it('builds argv', () => {
    expect(buildToolArgs(getToolSpec('ignorant')!, '+1 2025550123')).toEqual(['--only-used', '--no-color', '--no-clear', '-T', '10', '+1', '2025550123']);
    expect(buildToolArgs(getToolSpec('dnsrecon')!, 'example.com')).toEqual(['--lifetime', '5', '-d', 'example.com']);
    expect(buildToolArgs(getToolSpec('dnstwist')!, 'example.com').slice(-1)).toEqual(['example.com']);
  });

  it('parses ignorant like holehe, with a phone target', () => {
    expect(parseHoleheHits(IGNORANT_OUT).map((h) => h.site)).toEqual(['instagram.com']);
    const b = toolOutputToBatch(getToolSpec('ignorant')!, { value: '+1 2025550123' }, IGNORANT_OUT);
    expect(b.entities[0]).toMatchObject({ type: 'phone', name: '+1 2025550123' });
    expect(b.entities[1]).toMatchObject({ type: 'account', attributes: { platform: 'instagram.com', phone: '+1 2025550123' } });
    expect(b.relationships[0].type).toBe('registered_on');
  });

  it('turns dnsrecon records into hosts, IPs and links; keeps TXT/SOA as references', () => {
    const b = toolOutputToBatch(getToolSpec('dnsrecon')!, { value: 'example.com' }, DNSRECON_OUT);
    const name = new Map(b.entities.map((e) => [e.key, `${e.type}:${e.name}`]));
    const links = b.relationships.map((r) => `${name.get(r.source)} -${r.type}> ${name.get(r.target)}`);
    expect(b.entities.filter((e) => e.type === 'ip').map((e) => e.name).sort()).toEqual(
      ['104.20.23.154', '108.162.192.162', '162.159.44.228', '172.66.147.243', '192.0.2.25', '2606:4700:10::ac42:93f3', '2606:4700:58::a29f:2ce4'].sort(),
    );
    expect(links).toContain('domain:example.com -resolves_to> ip:172.66.147.243');
    expect(links).toContain('domain:example.com -uses_nameserver> domain:elliott.ns.cloudflare.com');
    expect(links).toContain('domain:elliott.ns.cloudflare.com -resolves_to> ip:162.159.44.228');
    expect(links).toContain('domain:example.com -mail_handled_by> domain:mail.example.com');
    expect(links).toContain('domain:example.com -has_subdomain> domain:www.example.com');
    expect(links).toContain('domain:www.example.com -resolves_to> ip:104.20.23.154');
    expect(links).toContain('domain:blog.example.com -alias_of> domain:example.github.io');
    // the scanned domain is the input entity, never duplicated
    expect(b.entities.filter((e) => e.name === 'example.com')).toHaveLength(1);
    // one 104.20.23.154 entity shared by example.com and www
    expect(b.entities.filter((e) => e.name === '104.20.23.154')).toHaveLength(1);
    expect(b.unmapped.map((u) => u.reason).every((r) => /record/.test(r))).toBe(true);
    expect(b.unmapped.length).toBe(3); // SOA + 2 TXT
    expect(new Set(links).size).toBe(links.length);
  });

  it('matches the scanned domain to an existing entity in the review', () => {
    const project = { project: { id: 'p', type: 'project' as const, name: 'P', created_at: '', updated_at: '', markdownBody: '' }, entities: [{ id: 'd1', type: 'domain' as const, name: 'Example.com', aliases: [], created_at: '', updated_at: '', attributes: {}, tags: [], markdownBody: '' }], relationships: [], sources: [], notes: [] };
    const plan = planImport(toolOutputToBatch(getToolSpec('dnsrecon')!, { value: 'example.com', entity: { type: 'domain', name: 'Example.com' } }, DNSRECON_OUT), project);
    expect(plan.entities[0]).toMatchObject({ decision: 'link-existing', duplicateOf: { id: 'd1' } });
  });

  it('turns dnstwist JSON into candidate look-alike domains, skipping the original', () => {
    const b = toolOutputToBatch(getToolSpec('dnstwist')!, { value: 'example.com' }, DNSTWIST_OUT);
    expect(b.entities.map((e) => e.name)).toEqual(['example.com', 'exampler.com', 'example8.com']);
    expect(b.entities[2]).toMatchObject({ type: 'domain', attributes: { fuzzer: 'addition', dns_a: '104.21.23.31', dns_mx: 'mail.example8.com' }, tags: ['dnstwist', 'lookalike'] });
    expect(b.relationships.every((r) => r.type === 'lookalike_domain' && r.status === 'candidate')).toBe(true);
  });

  it('survives truncated or invalid dnstwist output and caps huge results', () => {
    expect(toolOutputToBatch(getToolSpec('dnstwist')!, { value: 'example.com' }, '[{"domain": "a.com"').warnings[0]).toMatch(/could not be parsed/);
    const many = JSON.stringify(Array.from({ length: 450 }, (_, i) => ({ domain: `ex${i}.com`, fuzzer: 'addition', dns_a: ['1.1.1.1'] })));
    const b = toolOutputToBatch(getToolSpec('dnstwist')!, { value: 'example.com' }, many);
    expect(b.entities.length).toBe(301);
    expect(b.unmapped.length).toBe(150);
    expect(b.warnings.some((w) => /300/.test(w))).toBe(true);
  });
});
