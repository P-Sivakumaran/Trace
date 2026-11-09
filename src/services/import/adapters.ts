/**
 * Import adapters. Each one is a pure function from file text to an
 * ImportBatch, so new tools can be supported by adding one object here.
 *
 *  - trace-json      canonical TRACE import format (for scripts / other tools)
 *  - spiderfoot-csv  SpiderFoot "Export → CSV" of a scan
 *  - indicator-csv   generic CSV with a type/value (or indicator) column
 *  - indicator-list  plain text, one indicator per line (auto-typed)
 */
import { ENTITY_TYPES, type EntityType, type RelationshipStatus } from '@/types';
import { parseCsv } from './csv';
import type { ImportAdapter, ImportBatch, ImportEntity, ImportRelationship } from './types';

const KNOWN_TYPES = new Set<string>(ENTITY_TYPES.map((t) => t.type));
const STATUSES = new Set<RelationshipStatus>(['candidate', 'unverified', 'supported', 'confirmed', 'rejected']);

function emptyBatch(format: string, tool: string, fileName?: string): ImportBatch {
  return { format, tool, fileName, entities: [], relationships: [], unmapped: [], warnings: [] };
}

function isoOrUndefined(v: unknown): string | undefined {
  if (typeof v !== 'string' && typeof v !== 'number') return undefined;
  const d = new Date(typeof v === 'number' && v < 1e12 ? v * 1000 : v);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
}

function httpUrl(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  try {
    const u = new URL(v.trim());
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** Common aliases tools use for entity types. */
const TYPE_ALIASES: Record<string, EntityType> = {
  email: 'email', emailaddr: 'email', email_address: 'email', mail: 'email',
  domain: 'domain', hostname: 'domain', host: 'domain', fqdn: 'domain', internet_name: 'domain', domain_name: 'domain', subdomain: 'domain',
  ip: 'ip', ipv4: 'ip', ipv6: 'ip', ip_address: 'ip', ipv6_address: 'ip',
  url: 'website', website: 'website', uri: 'website', link: 'website',
  phone: 'phone', phone_number: 'phone', telephone: 'phone',
  person: 'person', name: 'person', human_name: 'person', individual: 'person',
  organization: 'organization', organisation: 'organization', org: 'organization',
  company: 'company', company_name: 'company',
  account: 'account', username: 'account', user: 'account', handle: 'account', social: 'account',
  location: 'location', address: 'location', geo: 'location', country: 'location', city: 'location',
  document: 'document', file: 'document',
  event: 'event',
  computer: 'computer', laptop: 'laptop', smartphone: 'smartphone', mobile: 'smartphone', server: 'server',
  network_interface: 'network_interface', nic: 'network_interface', mac: 'network_interface', mac_address: 'network_interface',
};

export function normaliseType(raw: unknown): EntityType | null {
  if (typeof raw !== 'string') return null;
  const k = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (KNOWN_TYPES.has(k)) return k as EntityType;
  return TYPE_ALIASES[k] ?? null;
}

/** Best-effort typing of a bare indicator string. */
export function guessIndicatorType(value: string): EntityType | null {
  const v = value.trim();
  if (!v) return null;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'email';
  if (/^https?:\/\//i.test(v)) return 'website';
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(v) && v.split('.').every((o) => Number(o) <= 255)) return 'ip';
  if ((/^[0-9a-f:]+$/i.test(v) && v.includes('::')) || /^([0-9a-f]{1,4}:){7}[0-9a-f]{1,4}$/i.test(v)) return 'ip';
  if (/^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i.test(v)) return 'network_interface';
  if (/^\+?[\d\s().-]{7,}$/.test(v) && (v.match(/\d/g) || []).length >= 7) return 'phone';
  if (/^@[\w.]{2,}$/.test(v)) return 'account';
  if (/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(v)) return 'domain';
  return null;
}

// ── trace-json ─────────────────────────────────────────────────────────────

/**
 * Canonical format:
 * {
 *   "trace_import": 1, "tool": "my-script",
 *   "entities": [{ "key": "e1", "type": "domain", "name": "example.com",
 *                  "attributes": {}, "source_url": "...", "observed_at": "..." }],
 *   "relationships": [{ "source": "e1", "target": "e2", "type": "resolves_to",
 *                       "status": "candidate", "source_url": "..." }]
 * }
 */
export const traceJsonAdapter: ImportAdapter = {
  id: 'trace-json',
  label: 'TRACE import JSON',
  detect(fileName, text) {
    if (!/\.json$/i.test(fileName) && !text.trimStart().startsWith('{')) return 0;
    return /"trace_import"\s*:/.test(text.slice(0, 2000)) ? 100 : 0;
  },
  parse(text, fileName) {
    let doc: any;
    try {
      doc = JSON.parse(text);
    } catch {
      throw new Error('File is not valid JSON');
    }
    if (!doc || typeof doc !== 'object' || doc.trace_import === undefined) throw new Error('Missing "trace_import" version field');
    if (doc.trace_import !== 1) throw new Error(`Unsupported trace_import version: ${String(doc.trace_import)}`);
    const batch = emptyBatch('trace-json', typeof doc.tool === 'string' && doc.tool ? doc.tool : 'unknown', fileName);
    const keys = new Set<string>();
    (Array.isArray(doc.entities) ? doc.entities : []).forEach((e: any, i: number) => {
      const type = normaliseType(e?.type);
      const name = typeof e?.name === 'string' ? e.name.trim() : '';
      if (!type || !name) {
        batch.unmapped.push({ reason: !name ? 'entity without name' : `unknown entity type "${String(e?.type)}"`, raw: e });
        return;
      }
      const key = typeof e.key === 'string' && e.key ? e.key : typeof e.id === 'string' && e.id ? e.id : `e${i}`;
      if (keys.has(key)) {
        batch.warnings.push(`Duplicate entity key "${key}" — later record kept separately`);
      }
      keys.add(key);
      batch.entities.push({
        key,
        type,
        name,
        aliases: Array.isArray(e.aliases) ? e.aliases.filter((a: unknown) => typeof a === 'string') : [],
        attributes: e.attributes && typeof e.attributes === 'object' && !Array.isArray(e.attributes) ? e.attributes : {},
        tags: Array.isArray(e.tags) ? e.tags.filter((t: unknown) => typeof t === 'string') : [],
        source_url: httpUrl(e.source_url),
        observed_at: isoOrUndefined(e.observed_at),
        raw: e,
      });
    });
    (Array.isArray(doc.relationships) ? doc.relationships : []).forEach((r: any, i: number) => {
      const src = typeof r?.source === 'string' ? r.source : '';
      const tgt = typeof r?.target === 'string' ? r.target : '';
      if (!keys.has(src) || !keys.has(tgt)) {
        batch.unmapped.push({ reason: 'relationship endpoint not found in entities', raw: r });
        return;
      }
      batch.relationships.push({
        key: `r${i}`,
        source: src,
        target: tgt,
        type: typeof r.type === 'string' && r.type.trim() ? r.type.trim() : 'related_to',
        directed: r.directed !== false,
        status: STATUSES.has(r.status) ? r.status : 'candidate',
        confidence: typeof r.confidence === 'number' && r.confidence >= 0 && r.confidence <= 1 ? r.confidence : null,
        source_url: httpUrl(r.source_url),
        observed_at: isoOrUndefined(r.observed_at),
        note: typeof r.note === 'string' ? r.note : undefined,
        raw: r,
      });
    });
    return batch;
  },
};

// ── SpiderFoot CSV ─────────────────────────────────────────────────────────

/** SpiderFoot event type → TRACE entity type. Unlisted types are kept as unmapped. */
const SPIDERFOOT_TYPES: Record<string, EntityType> = {
  'Email Address': 'email', EMAILADDR: 'email',
  'Internet Name': 'domain', INTERNET_NAME: 'domain',
  'Domain Name': 'domain', DOMAIN_NAME: 'domain',
  'Domain Name (Parent)': 'domain', DOMAIN_NAME_PARENT: 'domain',
  'Co-Hosted Site': 'domain', CO_HOSTED_SITE: 'domain',
  'Affiliate - Internet Name': 'domain', AFFILIATE_INTERNETNAME: 'domain',
  'IP Address': 'ip', IP_ADDRESS: 'ip',
  'IPv6 Address': 'ip', IPV6_ADDRESS: 'ip',
  'Affiliate - IP Address': 'ip', AFFILIATE_IPADDR: 'ip',
  'Phone Number': 'phone', PHONE_NUMBER: 'phone',
  'Human Name': 'person', HUMAN_NAME: 'person',
  'Company Name': 'company', COMPANY_NAME: 'company',
  'Account on External Site': 'account', ACCOUNT_EXTERNAL_OWNED: 'account',
  'Username': 'account', USERNAME: 'account',
  'Linked URL - External': 'website', LINKED_URL_EXTERNAL: 'website',
  'Linked URL - Internal': 'website', LINKED_URL_INTERNAL: 'website',
  'Physical Location': 'location', GEOINFO: 'location',
  'Physical Address': 'location', PHYSICAL_ADDRESS: 'location',
};

export const spiderfootCsvAdapter: ImportAdapter = {
  id: 'spiderfoot-csv',
  label: 'SpiderFoot scan (CSV export)',
  detect(_fileName, text) {
    const header = text.replace(/^﻿/, '').split(/\r?\n/, 1)[0].toLowerCase();
    return header.includes('module') && header.includes('type') && header.includes('data') && header.includes('source') ? 90 : 0;
  },
  parse(text, fileName) {
    const rows = parseCsv(text);
    const batch = emptyBatch('spiderfoot-csv', 'SpiderFoot', fileName);
    if (rows.length < 2) return batch;
    const head = rows[0].map((h) => h.trim().toLowerCase());
    const col = (n: string) => head.indexOf(n);
    const iType = col('type');
    const iData = col('data');
    const iSource = col('source');
    const iModule = col('module');
    const iUpdated = col('updated') >= 0 ? col('updated') : col('last seen');
    const iFp = col('f/p');
    if (iType < 0 || iData < 0) throw new Error('SpiderFoot CSV must have Type and Data columns');

    const byValue = new Map<string, ImportEntity>(); // "type|value" -> entity
    const valueIndex = new Map<string, ImportEntity>(); // value -> first entity (for Source links)
    const pendingLinks: { from: string; to: ImportEntity; module: string; observed?: string; raw: unknown }[] = [];

    rows.slice(1).forEach((r) => {
      const rawRecord = Object.fromEntries(head.map((h, i) => [h, r[i] ?? '']));
      const sfType = (r[iType] || '').trim();
      const value = (r[iData] || '').trim();
      if (iFp >= 0 && (r[iFp] || '').trim() === '1') {
        batch.unmapped.push({ reason: 'marked false positive in SpiderFoot', raw: rawRecord });
        return;
      }
      const type = SPIDERFOOT_TYPES[sfType];
      if (!type || !value) {
        batch.unmapped.push({ reason: value ? `unmapped SpiderFoot type "${sfType}"` : 'empty data', raw: rawRecord });
        return;
      }
      const observed = iUpdated >= 0 ? isoOrUndefined(r[iUpdated]) : undefined;
      const module = iModule >= 0 ? (r[iModule] || '').trim() : '';
      const k = `${type}|${value.toLowerCase()}`;
      let ent = byValue.get(k);
      if (!ent) {
        ent = {
          key: `sf${byValue.size}`,
          type,
          name: value,
          attributes: { spiderfoot_type: sfType, ...(module ? { spiderfoot_module: module } : {}) },
          tags: ['spiderfoot'],
          source_url: type === 'website' ? httpUrl(value) : undefined,
          observed_at: observed,
          raw: [rawRecord],
        };
        byValue.set(k, ent);
        batch.entities.push(ent);
        if (!valueIndex.has(value.toLowerCase())) valueIndex.set(value.toLowerCase(), ent);
      } else {
        (ent.raw as unknown[]).push(rawRecord);
      }
      const from = iSource >= 0 ? (r[iSource] || '').trim() : '';
      if (from && from.toLowerCase() !== value.toLowerCase()) pendingLinks.push({ from, to: ent, module, observed, raw: rawRecord });
    });

    const seen = new Set<string>();
    pendingLinks.forEach((l, i) => {
      let src = valueIndex.get(l.from.toLowerCase());
      if (!src) {
        // Parent value has no row of its own (typically the scan target). Add it
        // as an entity when its type is recognisable, so the import plan can
        // match it to an existing case entity instead of losing the link.
        const t = l.from === 'ROOT' ? null : guessIndicatorType(l.from);
        if (!t) return;
        src = {
          key: `sfp${batch.entities.length}`,
          type: t,
          name: l.from,
          attributes: { spiderfoot_role: 'parent / scan target' },
          tags: ['spiderfoot'],
          raw: { source: l.from },
        };
        valueIndex.set(l.from.toLowerCase(), src);
        batch.entities.push(src);
      }
      if (src === l.to) return;
      const k = `${src.key}>${l.to.key}`;
      if (seen.has(k)) return;
      seen.add(k);
      const rel: ImportRelationship = {
        key: `sfr${i}`,
        source: src.key,
        target: l.to.key,
        type: 'related_to',
        directed: true,
        status: 'candidate',
        observed_at: l.observed,
        note: l.module ? `Discovered by SpiderFoot module ${l.module}` : undefined,
        raw: l.raw,
      };
      batch.relationships.push(rel);
    });
    return batch;
  },
};

// ── Generic indicator CSV ──────────────────────────────────────────────────

export const indicatorCsvAdapter: ImportAdapter = {
  id: 'indicator-csv',
  label: 'CSV (type + value columns)',
  detect(fileName, text) {
    if (!/\.csv$/i.test(fileName)) return 0;
    const header = text.replace(/^﻿/, '').split(/\r?\n/, 1)[0].toLowerCase();
    return /(^|,)\s*"?(value|indicator|name|data)"?\s*(,|$)/.test(header) ? 50 : 10;
  },
  parse(text, fileName) {
    const rows = parseCsv(text);
    const batch = emptyBatch('indicator-csv', 'CSV', fileName);
    if (rows.length < 2) return batch;
    const head = rows[0].map((h) => h.trim());
    const lower = head.map((h) => h.toLowerCase());
    const find = (...names: string[]) => lower.findIndex((h) => names.includes(h));
    const iValue = find('value', 'indicator', 'name', 'data');
    const iType = find('type', 'entity_type', 'kind');
    const iUrl = find('source_url', 'url_source', 'source', 'reference');
    const iTime = find('observed_at', 'timestamp', 'date', 'first_seen', 'last_seen', 'updated');
    const iTool = find('tool', 'module');
    if (iValue < 0) throw new Error('CSV needs a "value", "indicator", "name" or "data" column');
    const used = new Set([iValue, iType, iUrl, iTime].filter((i) => i >= 0));
    rows.slice(1).forEach((r, n) => {
      const rawRecord = Object.fromEntries(head.map((h, i) => [h, r[i] ?? '']));
      const value = (r[iValue] || '').trim();
      const type = (iType >= 0 ? normaliseType(r[iType]) : null) ?? guessIndicatorType(value);
      if (!value || !type) {
        batch.unmapped.push({ reason: !value ? 'empty value' : `cannot determine entity type${iType >= 0 ? ` "${r[iType]}"` : ''}`, raw: rawRecord });
        return;
      }
      // Unmapped columns are preserved as attributes rather than dropped.
      const attributes: Record<string, unknown> = {};
      head.forEach((h, i) => {
        if (!used.has(i) && (r[i] ?? '').trim() !== '') attributes[h] = r[i].trim();
      });
      batch.entities.push({
        key: `c${n}`,
        type,
        name: value,
        attributes,
        source_url: iUrl >= 0 ? httpUrl(r[iUrl]) : undefined,
        observed_at: iTime >= 0 ? isoOrUndefined(r[iTime]) : undefined,
        raw: rawRecord,
      });
      if (iTool >= 0 && r[iTool] && batch.tool === 'CSV') batch.tool = r[iTool].trim();
    });
    return batch;
  },
};

// ── Plain indicator list ───────────────────────────────────────────────────

export const indicatorListAdapter: ImportAdapter = {
  id: 'indicator-list',
  label: 'Indicator list (one per line)',
  detect(fileName) {
    return /\.(txt|lst|list)$/i.test(fileName) ? 40 : 5;
  },
  parse(text, fileName) {
    const batch = emptyBatch('indicator-list', 'text', fileName);
    const seen = new Set<string>();
    text.split(/\r?\n/).forEach((line, n) => {
      const value = line.trim();
      if (!value || value.startsWith('#')) return;
      const type = guessIndicatorType(value);
      if (!type) {
        batch.unmapped.push({ reason: 'cannot determine entity type', raw: { line: n + 1, value } });
        return;
      }
      const k = `${type}|${value.toLowerCase()}`;
      if (seen.has(k)) return;
      seen.add(k);
      batch.entities.push({ key: `l${n}`, type, name: value, source_url: type === 'website' ? httpUrl(value) : undefined, raw: { line: n + 1, value } });
    });
    return batch;
  },
};

export const IMPORT_ADAPTERS: ImportAdapter[] = [traceJsonAdapter, spiderfootCsvAdapter, indicatorCsvAdapter, indicatorListAdapter];

export function detectAdapter(fileName: string, text: string): ImportAdapter {
  let best = IMPORT_ADAPTERS[IMPORT_ADAPTERS.length - 1];
  let bestScore = -1;
  for (const a of IMPORT_ADAPTERS) {
    const s = a.detect(fileName, text);
    if (s > bestScore) {
      best = a;
      bestScore = s;
    }
  }
  return best;
}
