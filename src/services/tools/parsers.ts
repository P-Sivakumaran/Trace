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

export function toolOutputToBatch(spec: ToolSpec, target: ToolTarget, stdout: string, ranAt = new Date()): ImportBatch {
  const observed = ranAt.toISOString();
  const hits = spec.id === 'holehe' ? parseHoleheHits(stdout) : parseSiteUrlHits(stdout);

  const inputType: EntityType = target.entity?.type ?? (spec.input.kind === 'email' ? 'email' : 'account');
  const input: ImportEntity = {
    key: 'input',
    type: inputType,
    name: target.entity?.name ?? target.value,
    raw: { tool_input: target.value },
  };

  const relType: Record<ToolId, string> = { sherlock: 'has_account', maigret: 'has_account', holehe: 'registered_on' };
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
      type: relType[spec.id],
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
