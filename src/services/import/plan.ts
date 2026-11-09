/**
 * Review & commit stage of an import.
 *
 * planImport()  compares a batch with the open investigation and marks each
 *               imported entity as new or as a probable duplicate of an
 *               existing entity (same type + same normalised name/alias).
 * buildImportRecords()  turns the user-approved plan into TRACE records.
 *
 * Existing records are never modified: a duplicate is only *referenced* by
 * imported relationships. Every created record carries `trace_import`
 * provenance in its frontmatter and the "imported" tag, so imported data stays
 * distinguishable from manual work and keeps its original raw input.
 */
import type { Entity, ProjectData, Relationship, Source } from '@/types';
import type { ImportBatch, ImportEntity, ImportRelationship } from './types';

export type EntityDecision = 'create' | 'link-existing' | 'skip';

export interface PlannedEntity {
  item: ImportEntity;
  /** Existing entity this one probably duplicates. */
  duplicateOf?: { id: string; name: string; matchedOn: 'name' | 'alias' | 'attribute' };
  decision: EntityDecision;
}

export interface PlannedRelationship {
  item: ImportRelationship;
  /** Same endpoints + type already exist in the project. */
  duplicateOf?: string;
  decision: 'create' | 'skip';
}

export interface ImportPlan {
  batch: ImportBatch;
  entities: PlannedEntity[];
  relationships: PlannedRelationship[];
}

/** Normalisation used for duplicate detection only (never written back). */
export function normaliseName(type: string, name: string): string {
  let n = name.trim().toLowerCase();
  if (type === 'domain') n = n.replace(/^www\./, '').replace(/\.$/, '');
  if (type === 'website') n = n.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
  if (type === 'phone') n = n.replace(/[^\d+]/g, '');
  if (type === 'account') n = n.replace(/^@/, '');
  return n.replace(/\s+/g, ' ');
}

export function planImport(batch: ImportBatch, project: ProjectData): ImportPlan {
  const byName = new Map<string, Entity>();
  const byAlias = new Map<string, Entity>();
  const byAttr = new Map<string, Entity>();
  for (const e of project.entities) {
    byName.set(`${e.type}|${normaliseName(e.type, e.name)}`, e);
    (e.aliases || []).forEach((a) => byAlias.set(`${e.type}|${normaliseName(e.type, a)}`, e));
    // Common identifier attributes (e.g. a person's email / phone stored as attribute).
    Object.values(e.attributes || {}).forEach((v) => {
      if (typeof v === 'string' && v.length >= 4) byAttr.set(v.trim().toLowerCase(), e);
    });
  }

  const entities: PlannedEntity[] = batch.entities.map((item) => {
    const k = `${item.type}|${normaliseName(item.type, item.name)}`;
    const nameHit = byName.get(k);
    if (nameHit) return { item, duplicateOf: { id: nameHit.id, name: nameHit.name, matchedOn: 'name' }, decision: 'link-existing' };
    const aliasHit = byAlias.get(k);
    if (aliasHit) return { item, duplicateOf: { id: aliasHit.id, name: aliasHit.name, matchedOn: 'alias' }, decision: 'link-existing' };
    const attrHit = byAttr.get(item.name.trim().toLowerCase());
    // Attribute matches across types are only a hint: default to create, user decides.
    if (attrHit) return { item, duplicateOf: { id: attrHit.id, name: attrHit.name, matchedOn: 'attribute' }, decision: 'create' };
    return { item, decision: 'create' };
  });

  const existingIdFor = new Map<string, string>();
  entities.forEach((p) => p.decision === 'link-existing' && p.duplicateOf && existingIdFor.set(p.item.key, p.duplicateOf.id));
  const relKeys = new Set(project.relationships.map((r) => `${r.source_entity}>${r.target_entity}|${r.type}`));

  const relationships: PlannedRelationship[] = batch.relationships.map((item) => {
    const s = existingIdFor.get(item.source);
    const t = existingIdFor.get(item.target);
    if (s && t && relKeys.has(`${s}>${t}|${item.type}`)) return { item, duplicateOf: `${s}>${t}`, decision: 'skip' };
    return { item, decision: 'create' };
  });

  return { batch, entities, relationships };
}

export interface ImportRecords {
  batchId: string;
  source: Source;
  entities: Entity[];
  relationships: Relationship[];
  /** Relationships dropped because an endpoint was skipped. */
  droppedRelationships: number;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'item';
}

export function buildImportRecords(
  plan: ImportPlan,
  opts: { now?: Date; existingIds?: Set<string>; randomSuffix?: () => string } = {},
): ImportRecords {
  const now = (opts.now ?? new Date()).toISOString();
  const rnd = opts.randomSuffix ?? (() => Math.random().toString(36).slice(2, 6));
  const batchId = `imp-${Date.parse(now).toString(36)}-${rnd()}`;
  const taken = new Set(opts.existingIds ?? []);
  const uniqueId = (base: string) => {
    let id = base;
    while (taken.has(id)) id = `${base}-${rnd()}`;
    taken.add(id);
    return id;
  };
  const { batch } = plan;
  // JSON round-trip drops undefined values (YAML frontmatter cannot hold them).
  const clean = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
  const provenance = (extra: { source_url?: string; observed_at?: string; raw?: unknown }) => clean({
    trace_import: {
      batch_id: batchId,
      tool: batch.tool,
      format: batch.format,
      file: batch.fileName,
      imported_at: now,
      source_url: extra.source_url,
      observed_at: extra.observed_at,
      raw: extra.raw,
    },
  });

  const counts = {
    created: plan.entities.filter((p) => p.decision === 'create').length,
    linked: plan.entities.filter((p) => p.decision === 'link-existing').length,
    skipped: plan.entities.filter((p) => p.decision === 'skip').length,
  };

  // The import itself becomes an evidence Source: it records which tool/file the
  // data came from and keeps the records that could not be mapped.
  const source: Source = {
    id: uniqueId(`src-${batchId}`),
    type: 'source',
    title: `Import: ${batch.fileName || batch.format} (${batch.tool})`,
    accessed_at: now,
    source_type: 'other',
    markdownBody: [
      `# Imported data`,
      ``,
      `- Tool: ${batch.tool}`,
      `- Format: ${batch.format}`,
      batch.fileName ? `- File: ${batch.fileName}` : '',
      `- Imported at: ${now}`,
      `- Entities: ${counts.created} created, ${counts.linked} linked to existing, ${counts.skipped} skipped`,
      batch.warnings.length ? `\n## Warnings\n\n${batch.warnings.map((w) => `- ${w}`).join('\n')}` : '',
      batch.unmapped.length ? `\n## Unmapped records (${batch.unmapped.length})\n\nKept verbatim in this source's frontmatter (\`trace_import.unmapped\`).` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    extraFrontmatter: clean({
      trace_import: {
        batch_id: batchId,
        tool: batch.tool,
        format: batch.format,
        file: batch.fileName,
        imported_at: now,
        unmapped: batch.unmapped.length ? batch.unmapped : undefined,
      },
    }),
  };

  const idFor = new Map<string, string>();
  const entities: Entity[] = [];
  for (const p of plan.entities) {
    if (p.decision === 'skip') continue;
    if (p.decision === 'link-existing' && p.duplicateOf) {
      idFor.set(p.item.key, p.duplicateOf.id);
      continue;
    }
    const it = p.item;
    const id = uniqueId(`${it.type}-${slug(it.name)}`);
    idFor.set(it.key, id);
    entities.push({
      id,
      type: it.type,
      name: it.name,
      aliases: it.aliases ?? [],
      created_at: now,
      updated_at: now,
      attributes: { ...(it.attributes ?? {}) } as Record<string, any>,
      tags: [...new Set([...(it.tags ?? []), 'imported'])],
      markdownBody: `# ${it.name}\n\nImported from ${batch.tool}${it.source_url ? ` — ${it.source_url}` : ''}.`,
      extraFrontmatter: provenance({ source_url: it.source_url, observed_at: it.observed_at, raw: it.raw }),
    });
  }

  let dropped = 0;
  const relationships: Relationship[] = [];
  for (const p of plan.relationships) {
    if (p.decision === 'skip') continue;
    const s = idFor.get(p.item.source);
    const t = idFor.get(p.item.target);
    if (!s || !t || s === t) {
      dropped++;
      continue;
    }
    const it = p.item;
    relationships.push({
      id: uniqueId(`rel-${slug(it.type)}-${rnd()}`),
      type: it.type,
      source_entity: s,
      target_entity: t,
      directed: it.directed !== false,
      status: it.status ?? 'candidate',
      confidence: it.confidence ?? null,
      evidence: [source.id],
      created_at: now,
      markdownBody: `# Relationship: ${it.type}\n\n${it.note ? `${it.note}\n\n` : ''}Imported from ${batch.tool}. Review before treating as verified.`,
      extraFrontmatter: provenance({ source_url: it.source_url, observed_at: it.observed_at, raw: it.raw }),
    });
  }

  return { batchId, source, entities, relationships, droppedRelationships: dropped };
}
