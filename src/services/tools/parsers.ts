/**
 * Turns the console output of a catalog tool into an ImportBatch, which then
 * goes through the normal import review (duplicate detection, provenance,
 * nothing written without confirmation).
 *
 * Formats verified against real runs:
 *   sherlock 0.16:  "[+] GitHub: https://www.github.com/user"
 *   maigret:        "[+] GitHubGist [GitHub]: https://gist.github.com/user"
 *                   followed by " ├─key: value" / " └─key: value" detail lines
 *   holehe 1.61:    "[+] twitter.com"   (only-used mode)
 */
import type { EntityType } from '@/types';
import type { ImportBatch, ImportEntity } from '@/services/import/types';
import type { ToolId, ToolSpec } from './catalog';

export interface ToolTarget {
  value: string;
  /** Existing case entity the tool ran on, if any. */
  entity?: { type: EntityType; name: string };
}

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*[A-Za-z]|\x1b\]8;;[^\x07\x1b]*(?:\x07|\x1b\\)/g;

export function cleanLines(stdout: string): string[] {
  return stdout.replace(ANSI, '').split(/\r?\n|\r/).map((l) => l.replace(/\s+$/, ''));
}

function httpUrl(v: string): string | undefined {
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

interface Hit {
  site: string;
  url?: string;
  details: Record<string, string>;
  line: string;
}

export function parseSiteUrlHits(stdout: string): Hit[] {
  const hits: Hit[] = [];
  let last: Hit | null = null;
  for (const line of cleanLines(stdout)) {
    const m = /^\[\+\]\s+(.+?)(?:\s+\[[^\]]*\])?:\s+(https?:\/\/\S+)\s*$/.exec(line);
    if (m) {
      const url = httpUrl(m[2]);
      if (!url) continue;
      last = { site: m[1].trim(), url, details: {}, line };
      hits.push(last);
      continue;
    }
    const d = /^\s*[├└]─\s*([^:]+):\s*(.*)$/.exec(line);
    if (d && last) {
      const key = d[1].trim().replace(/\s+/g, '_').slice(0, 48);
      if (key && d[2].trim()) last.details[key] = d[2].trim().slice(0, 500);
      continue;
    }
    if (line.trim()) last = null;
  }
  // Same site reported twice → keep the first.
  const seen = new Set<string>();
  return hits.filter((h) => (seen.has(h.site.toLowerCase()) ? false : (seen.add(h.site.toLowerCase()), true)));
}

export function parseHoleheHits(stdout: string): Hit[] {
  const hits: Hit[] = [];
  for (const line of cleanLines(stdout)) {
    const m = /^\[\+\]\s+([a-z0-9][a-z0-9.-]*\.[a-z]{2,})(?:\s*\/\s*(.+))?\s*$/i.exec(line);
    if (!m) continue;
    hits.push({ site: m[1].toLowerCase(), details: m[2] ? { recovery_hint: m[2].trim() } : {}, line });
  }
  const seen = new Set<string>();
  return hits.filter((h) => (seen.has(h.site) ? false : (seen.add(h.site), true)));
}

// ── DNSRecon ──────────────────────────────────────────────────────────────

export interface DnsRecord {
  type: string;
  name: string;
  data: string;
  line: string;
}

/** Lines look like "[*] \t A example.com 93.184.216.34" (verified against dnsrecon output). */
export function parseDnsReconRecords(stdout: string): DnsRecord[] {
  const out: DnsRecord[] = [];
  const seen = new Set<string>();
  for (const line of cleanLines(stdout)) {
    const m = /^\[\*\]\s+([A-Z0-9]{1,10})\s+(\S+)\s+(.+?)\s*$/.exec(line);
    if (!m) continue;
    const [, type, name, data] = m;
    if (!/^(A|AAAA|NS|MX|CNAME|SOA|TXT|SRV|PTR)$/.test(type)) continue;
    const key = `${type}|${name.toLowerCase()}|${data}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ type, name: name.toLowerCase().replace(/\.$/, ''), data: data.trim(), line });
  }
  return out;
}

const isIp = (v: string) => /^(\d{1,3}\.){3}\d{1,3}$/.test(v) || /^[0-9a-f:]+:[0-9a-f:]*$/i.test(v);

function dnsReconBatch(spec: ToolSpec, target: ToolTarget, stdout: string, observed: string): ImportBatch {
  const domain = target.value.toLowerCase();
  const input: ImportEntity = {
    key: 'input',
    type: target.entity?.type ?? 'domain',
    name: target.entity?.name ?? domain,
    raw: { tool_input: domain },
  };
  const batch: ImportBatch = { format: `tool:${spec.id}`, tool: spec.name, fileName: `${spec.pip.bin} -d ${domain}`, entities: [input], relationships: [], unmapped: [], warnings: [] };
  const byName = new Map<string, string>(); // "type|name" → key
  const seenRel = new Set<string>();
  const entity = (type: EntityType, name: string, raw: string) => {
    // The scanned domain itself is the input entity (matched to an existing one by the review).
    if (type === 'domain' && name === domain) return 'input';
    const k = `${type}|${name}`;
    let key = byName.get(k);
    if (!key) {
      key = `dns${batch.entities.length}`;
      byName.set(k, key);
      batch.entities.push({ key, type, name, tags: [spec.id], observed_at: observed, raw });
    }
    return key;
  };
  const link = (from: string, to: string, type: string, raw: string, note: string) => {
    const k = `${from}>${to}|${type}`;
    if (from === to || seenRel.has(k)) return;
    seenRel.add(k);
    batch.relationships.push({ key: `rel${batch.relationships.length}`, source: from, target: to, type, directed: true, status: 'candidate', observed_at: observed, note, raw });
  };

  for (const r of parseDnsReconRecords(stdout)) {
    const host = r.name;
    switch (r.type) {
      case 'A':
      case 'AAAA': {
        if (!isIp(r.data)) break;
        const h = entity('domain', host, r.line);
        link(h, entity('ip', r.data, r.line), 'resolves_to', r.line, `${r.type} record of ${host}`);
        if (h !== 'input' && !host.endsWith(`.${domain}`) && host !== domain) break;
        if (h !== 'input') link('input', h, 'has_subdomain', r.line, `${host} found in ${domain}'s DNS`);
        break;
      }
      case 'NS':
      case 'MX': {
        const ns = entity('domain', host, r.line);
        link('input', ns, r.type === 'NS' ? 'uses_nameserver' : 'mail_handled_by', r.line, `${r.type} record of ${domain}`);
        if (isIp(r.data)) link(ns, entity('ip', r.data, r.line), 'resolves_to', r.line, `Address of ${host}`);
        break;
      }
      case 'CNAME': {
        const alias = entity('domain', host, r.line);
        const target2 = entity('domain', r.data.replace(/\.$/, '').toLowerCase(), r.line);
        link(alias, target2, 'alias_of', r.line, `CNAME ${host} → ${r.data}`);
        if (alias !== 'input') link('input', alias, 'has_subdomain', r.line, `${host} found in ${domain}'s DNS`);
        break;
      }
      default:
        // SOA, TXT, SRV, PTR: kept verbatim in the import source, not turned into entities.
        batch.unmapped.push({ reason: `${r.type} record (kept as reference)`, raw: r.line });
    }
  }
  if (batch.entities.length === 1) batch.warnings.push(`${spec.name} found no A/AAAA/NS/MX records for "${domain}".`);
  return batch;
}

// ── dnstwist ──────────────────────────────────────────────────────────────

const MAX_LOOKALIKES = 300;

function dnsTwistBatch(spec: ToolSpec, target: ToolTarget, stdout: string, observed: string): ImportBatch {
  const domain = target.value.toLowerCase();
  const input: ImportEntity = { key: 'input', type: target.entity?.type ?? 'domain', name: target.entity?.name ?? domain, raw: { tool_input: domain } };
  const batch: ImportBatch = { format: `tool:${spec.id}`, tool: spec.name, fileName: `${spec.pip.bin} ${domain}`, entities: [input], relationships: [], unmapped: [], warnings: [] };

  let rows: unknown;
  try {
    const start = stdout.indexOf('[');
    rows = JSON.parse(stdout.slice(start >= 0 ? start : 0));
  } catch {
    batch.warnings.push('dnstwist output could not be parsed as JSON (the run may have been stopped early).');
    return batch;
  }
  if (!Array.isArray(rows)) return batch;
  let count = 0;
  for (const row of rows as Record<string, unknown>[]) {
    const name = typeof row?.domain === 'string' ? row.domain.toLowerCase() : '';
    const fuzzer = typeof row?.fuzzer === 'string' ? row.fuzzer : '';
    if (!name || fuzzer === '*original' || name === domain) continue;
    if (count >= MAX_LOOKALIKES) {
      batch.unmapped.push({ reason: 'beyond the 300 look-alike limit', raw: row });
      continue;
    }
    const list = (k: string) => (Array.isArray(row[k]) ? (row[k] as unknown[]).filter((x) => typeof x === 'string').slice(0, 8) : []);
    const attributes: Record<string, unknown> = { fuzzer, lookalike_of: domain };
    for (const [attr, k] of [['dns_a', 'dns_a'], ['dns_aaaa', 'dns_aaaa'], ['dns_mx', 'dns_mx'], ['dns_ns', 'dns_ns']] as const) {
      const v = list(k);
      if (v.length) attributes[attr] = v.join(', ');
    }
    const key = `twist${count++}`;
    batch.entities.push({ key, type: 'domain', name, attributes, tags: [spec.id, 'lookalike'], observed_at: observed, raw: row });
    batch.relationships.push({
      key: `rel${count}`,
      source: 'input',
      target: key,
      type: 'lookalike_domain',
      directed: true,
      status: 'candidate',
      observed_at: observed,
      note: `Registered look-alike of ${domain} (${fuzzer || 'permutation'}). Check before treating as malicious.`,
      raw: row,
    });
  }
  if (count === 0) batch.warnings.push(`dnstwist found no registered look-alike domains of "${domain}".`);
  if (rows.length > MAX_LOOKALIKES + 1) batch.warnings.push(`Only the first ${MAX_LOOKALIKES} look-alike domains are listed; the rest are kept in the import source.`);
  return batch;
}

export function toolOutputToBatch(spec: ToolSpec, target: ToolTarget, stdout: string, ranAt = new Date()): ImportBatch {
  const observed = ranAt.toISOString();
  if (spec.id === 'dnsrecon') return dnsReconBatch(spec, target, stdout, observed);
  if (spec.id === 'dnstwist') return dnsTwistBatch(spec, target, stdout, observed);
  // Holehe and Ignorant print "[+] service" lines; Sherlock and Maigret print "[+] Site: URL".
  const hits = spec.id === 'holehe' || spec.id === 'ignorant' ? parseHoleheHits(stdout) : parseSiteUrlHits(stdout);

  const inputType: EntityType = target.entity?.type ?? (spec.input.kind === 'email' ? 'email' : spec.input.kind === 'phone' ? 'phone' : 'account');
  const input: ImportEntity = {
    key: 'input',
    type: inputType,
    name: target.entity?.name ?? target.value,
    raw: { tool_input: target.value },
  };

  const relType: Partial<Record<ToolId, string>> = { sherlock: 'has_account', maigret: 'has_account', holehe: 'registered_on', ignorant: 'registered_on' };
  const entities: ImportEntity[] = [input];
  const batch: ImportBatch = {
    format: `tool:${spec.id}`,
    tool: spec.name,
    fileName: `${spec.pip.bin} ${target.value}`,
    entities,
    relationships: [],
    unmapped: [],
    warnings: [],
  };

  hits.forEach((h, i) => {
    const key = `hit${i}`;
    const attributes: Record<string, unknown> = { platform: h.site, ...(h.url ? { url: h.url } : {}), ...h.details };
    if (spec.input.kind === 'username') attributes.username = target.value;
    else if (spec.input.kind === 'phone') attributes.phone = target.value;
    else attributes.email = target.value;
    entities.push({
      key,
      type: 'account',
      name: `${target.value} (${h.site})`,
      aliases: h.url ? [h.url] : [],
      attributes,
      tags: [spec.id],
      source_url: h.url,
      observed_at: observed,
      raw: h.line,
    });
    batch.relationships.push({
      key: `rel${i}`,
      source: 'input',
      target: key,
      type: relType[spec.id] ?? 'related_to',
      directed: true,
      status: 'candidate',
      source_url: h.url,
      observed_at: observed,
      note: `Reported by ${spec.name} for "${target.value}" on ${h.site}.`,
      raw: h.line,
    });
  });

  if (hits.length === 0) batch.warnings.push(`${spec.name} reported no results for "${target.value}".`);
  return batch;
}
