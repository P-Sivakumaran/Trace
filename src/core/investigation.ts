/**
 * Investigation query service: pure, read-only graph queries over a loaded
 * ProjectData. No I/O, no UI, no mutation — shared by the MCP server and
 * usable from the renderer. Every function returns plain JSON-serialisable
 * objects with a stable shape so agents can rely on it.
 */
import {
  Entity,
  ProjectData,
  Relationship,
  RelationshipStatus,
  Source,
  evidenceClassOf,
  type EvidenceClass,
} from '@/types';

export interface EntityRef {
  id: string;
  type: string;
  name: string;
}

export interface RelationshipRef {
  id: string;
  type: string;
  source: string;
  target: string;
  directed: boolean;
  status: RelationshipStatus;
  evidence_class: EvidenceClass;
  confidence: number | null;
  evidence_count: number;
}

export interface SourceRef {
  id: string;
  title: string;
  url: string | null;
  source_type: string;
  captured_at: string | null;
}

const MAX_BODY = 4000;

export const entityRef = (e: Entity): EntityRef => ({ id: e.id, type: e.type, name: e.name });

export const relationshipRef = (r: Relationship): RelationshipRef => ({
  id: r.id,
  type: r.type,
  source: r.source_entity,
  target: r.target_entity,
  directed: r.directed !== false,
  status: r.status,
  evidence_class: evidenceClassOf(r.status),
  confidence: r.confidence ?? null,
  evidence_count: (r.evidence || []).length,
});

export const sourceRef = (s: Source): SourceRef => ({
  id: s.id,
  title: s.title,
  url: s.url || null,
  source_type: s.source_type,
  captured_at: s.accessed_at || null,
});

function truncate(text: string | undefined, max = MAX_BODY): { text: string; truncated: boolean } {
  const t = text || '';
  return t.length > max ? { text: t.slice(0, max), truncated: true } : { text: t, truncated: false };
}

/** Index built once per loaded project; all queries go through it. */
export class InvestigationIndex {
  readonly entities = new Map<string, Entity>();
  readonly relationships = new Map<string, Relationship>();
  readonly sources = new Map<string, Source>();
  /** entity id -> relationship ids touching it */
  readonly adjacency = new Map<string, string[]>();

  constructor(readonly data: ProjectData) {
    data.entities.forEach((e) => this.entities.set(e.id, e));
    data.sources.forEach((s) => this.sources.set(s.id, s));
    data.relationships.forEach((r) => {
      this.relationships.set(r.id, r);
      for (const end of [r.source_entity, r.target_entity]) {
        if (!end) continue;
        const list = this.adjacency.get(end);
        if (list) {
          if (!list.includes(r.id)) list.push(r.id);
        } else this.adjacency.set(end, [r.id]);
      }
    });
  }

  degree(entityId: string): number {
    return this.adjacency.get(entityId)?.length ?? 0;
  }

  private other(rel: Relationship, id: string): string {
    return rel.source_entity === id ? rel.target_entity : rel.source_entity;
  }

  private ref(id: string): EntityRef {
    const e = this.entities.get(id);
    return e ? entityRef(e) : { id, type: 'unknown', name: id };
  }

  // ── 8. Summary & statistics ────────────────────────────────────────────
  summary() {
    const { project, entities, relationships, sources, notes } = this.data;
    const byType: Record<string, number> = {};
    entities.forEach((e) => (byType[e.type] = (byType[e.type] || 0) + 1));
    const byStatus: Record<string, number> = {};
    const byClass: Record<string, number> = { observed: 0, hypothesis: 0, disproven: 0 };
    let unsourced = 0;
    relationships.forEach((r) => {
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;
      byClass[evidenceClassOf(r.status)]++;
      if (!r.evidence || r.evidence.length === 0) unsourced++;
    });
    const isolated = entities.filter((e) => this.degree(e.id) === 0).length;
    const mostConnected = entities
      .map((e) => ({ ...entityRef(e), degree: this.degree(e.id) }))
      .filter((x) => x.degree > 0)
      .sort((a, b) => b.degree - a.degree || a.name.localeCompare(b.name))
      .slice(0, 10);
    const brief = truncate(project.markdownBody, 1500);
    return {
      project: { id: project.id, name: project.name, created_at: project.created_at, updated_at: project.updated_at },
      brief: brief.text,
      brief_truncated: brief.truncated,
      counts: {
        entities: entities.length,
        relationships: relationships.length,
        sources: sources.length,
        notes: notes.length,
        isolated_entities: isolated,
        unsourced_relationships: unsourced,
        connected_components: this.componentCount(),
      },
      entities_by_type: byType,
      relationships_by_status: byStatus,
      relationships_by_evidence_class: byClass,
      most_connected: mostConnected,
    };
  }

  private componentCount(): number {
    const seen = new Set<string>();
    let count = 0;
    for (const id of this.entities.keys()) {
      if (seen.has(id)) continue;
      count++;
      const stack = [id];
      seen.add(id);
      while (stack.length) {
        const cur = stack.pop()!;
        for (const rid of this.adjacency.get(cur) || []) {
          const nxt = this.other(this.relationships.get(rid)!, cur);
          if (this.entities.has(nxt) && !seen.has(nxt)) {
            seen.add(nxt);
            stack.push(nxt);
          }
        }
      }
    }
    return count;
  }

  // ── 2. Search ──────────────────────────────────────────────────────────
  searchEntities(query: string, opts: { type?: string; limit?: number } = {}) {
    const q = query.trim().toLowerCase();
    const limit = clamp(opts.limit ?? 25, 1, 100);
    const scored: { e: Entity; score: number; matched: string }[] = [];
    for (const e of this.entities.values()) {
      if (opts.type && e.type !== opts.type) continue;
      const name = e.name.toLowerCase();
      let score = 0;
      let matched = '';
      if (!q) {
        score = 1;
      } else if (name === q) {
        score = 100;
        matched = 'name';
      } else if (name.startsWith(q)) {
        score = 60;
        matched = 'name';
      } else if (name.includes(q)) {
        score = 40;
        matched = 'name';
      } else if ((e.aliases || []).some((a) => a.toLowerCase().includes(q))) {
        score = 30;
        matched = 'alias';
      } else if ((e.tags || []).some((t) => t.toLowerCase().includes(q))) {
        score = 20;
        matched = 'tag';
      } else if (Object.values(e.attributes || {}).some((v) => v != null && typeof v !== 'object' && String(v).toLowerCase().includes(q))) {
        score = 15;
        matched = 'attribute';
      } else if ((e.markdownBody || '').toLowerCase().includes(q)) {
        score = 5;
        matched = 'notes';
      }
      if (score > 0) scored.push({ e, score, matched });
    }
    scored.sort((a, b) => b.score - a.score || this.degree(b.e.id) - this.degree(a.e.id) || a.e.name.localeCompare(b.e.name));
    return {
      total_matches: scored.length,
      results: scored.slice(0, limit).map(({ e, matched }) => ({
        ...entityRef(e),
        aliases: e.aliases || [],
        degree: this.degree(e.id),
        matched_on: matched || null,
      })),
    };
  }

  // ── 3. Entity details ──────────────────────────────────────────────────
  entityDetails(id: string) {
    const e = this.entities.get(id);
    if (!e) return null;
    const body = truncate(e.markdownBody);
    const rels = (this.adjacency.get(id) || []).map((rid) => this.relationships.get(rid)!);
    const relTypes: Record<string, number> = {};
    rels.forEach((r) => (relTypes[r.type] = (relTypes[r.type] || 0) + 1));
    return {
      ...entityRef(e),
      custom_type: e.custom_type ?? null,
      aliases: e.aliases || [],
      tags: e.tags || [],
      attributes: e.attributes || {},
      created_at: e.created_at,
      updated_at: e.updated_at,
      provenance: provenanceOf(e.extraFrontmatter),
      notes: body.text,
      notes_truncated: body.truncated,
      degree: rels.length,
      relationship_types: relTypes,
    };
  }

  // ── 4. Neighbours ──────────────────────────────────────────────────────
  neighbors(id: string, opts: { depth?: number; limit?: number; includeRejected?: boolean } = {}) {
    if (!this.entities.has(id)) return null;
    const depth = clamp(opts.depth ?? 1, 1, 3);
    const limit = clamp(opts.limit ?? 50, 1, 200);
    const dist = new Map<string, number>([[id, 0]]);
    const edges = new Map<string, Relationship>();
    let frontier = [id];
    let truncated = false;
    for (let d = 1; d <= depth && frontier.length; d++) {
      const next: string[] = [];
      for (const cur of frontier) {
        for (const rid of this.adjacency.get(cur) || []) {
          const r = this.relationships.get(rid)!;
          if (!opts.includeRejected && r.status === 'rejected') continue;
          const o = this.other(r, cur);
          if (!dist.has(o)) {
            if (dist.size - 1 >= limit) {
              truncated = true;
              continue;
            }
            dist.set(o, d);
            next.push(o);
          }
          edges.set(r.id, r);
        }
      }
      frontier = next;
    }
    return {
      center: this.ref(id),
      depth,
      nodes: [...dist.entries()].filter(([n]) => n !== id).map(([n, d]) => ({ ...this.ref(n), distance: d, degree: this.degree(n) })),
      relationships: [...edges.values()].filter((r) => dist.has(r.source_entity) && dist.has(r.target_entity)).map(relationshipRef),
      truncated,
    };
  }

  // ── 5. Relationship details ────────────────────────────────────────────
  relationshipDetails(id: string) {
    const r = this.relationships.get(id);
    if (!r) return null;
    const body = truncate(r.markdownBody);
    return {
      ...relationshipRef(r),
      source_entity: this.ref(r.source_entity),
      target_entity: this.ref(r.target_entity),
      created_at: r.created_at,
      provenance: provenanceOf(r.extraFrontmatter),
      explanation: body.text,
      explanation_truncated: body.truncated,
      evidence: this.evidenceSources(r),
    };
  }

  private evidenceSources(r: Relationship) {
    return (r.evidence || []).map((sid) => {
      const s = this.sources.get(sid);
      return s ? { ...sourceRef(s), missing: false } : { id: sid, title: null, url: null, source_type: null, captured_at: null, missing: true };
    });
  }

  // ── 6. Evidence ────────────────────────────────────────────────────────
  evidence(opts: { relationshipId?: string; entityId?: string; sourceId?: string }) {
    if (opts.sourceId) {
      const s = this.sources.get(opts.sourceId);
      if (!s) return null;
      const body = truncate(s.markdownBody);
      const supports = this.data.relationships.filter((r) => (r.evidence || []).includes(s.id)).map(relationshipRef);
      return { source: { ...sourceRef(s), content: body.text, content_truncated: body.truncated }, supports_relationships: supports };
    }
    if (opts.relationshipId) {
      const r = this.relationships.get(opts.relationshipId);
      if (!r) return null;
      return { relationship: relationshipRef(r), evidence: this.evidenceSources(r) };
    }
    if (opts.entityId) {
      if (!this.entities.has(opts.entityId)) return null;
      const rels = (this.adjacency.get(opts.entityId) || []).map((rid) => this.relationships.get(rid)!);
      const bySource = new Map<string, { source: ReturnType<InvestigationIndex['evidenceSources']>[number]; relationship_ids: string[] }>();
      rels.forEach((r) =>
        this.evidenceSources(r).forEach((s) => {
          const hit = bySource.get(s.id);
          if (hit) hit.relationship_ids.push(r.id);
          else bySource.set(s.id, { source: s, relationship_ids: [r.id] });
        }),
      );
      return {
        entity: this.ref(opts.entityId),
        relationships_total: rels.length,
        unsourced_relationship_ids: rels.filter((r) => !r.evidence || r.evidence.length === 0).map((r) => r.id),
        sources: [...bySource.values()].map((x) => ({ ...x.source, relationship_ids: x.relationship_ids })),
      };
    }
    return null;
  }

  // ── 7. Paths ───────────────────────────────────────────────────────────
  /**
   * All shortest paths (BFS) between two entities, treating relationships as
   * undirected links. Bounded by maxDepth and maxPaths so it stays cheap.
   */
  findPaths(fromId: string, toId: string, opts: { maxDepth?: number; maxPaths?: number; includeRejected?: boolean } = {}) {
    if (!this.entities.has(fromId) || !this.entities.has(toId)) return null;
    const maxDepth = clamp(opts.maxDepth ?? 4, 1, 6);
    const maxPaths = clamp(opts.maxPaths ?? 5, 1, 20);
    if (fromId === toId) return { from: this.ref(fromId), to: this.ref(toId), found: true, length: 0, paths: [], truncated: false };

    const parents = new Map<string, { node: string; rel: string }[]>([[fromId, []]]);
    const level = new Map<string, number>([[fromId, 0]]);
    let frontier = [fromId];
    let found = false;
    for (let d = 1; d <= maxDepth && frontier.length && !found; d++) {
      const next: string[] = [];
      for (const cur of frontier) {
        for (const rid of this.adjacency.get(cur) || []) {
          const r = this.relationships.get(rid)!;
          if (!opts.includeRejected && r.status === 'rejected') continue;
          const o = this.other(r, cur);
          if (!this.entities.has(o)) continue;
          if (!level.has(o)) {
            level.set(o, d);
            parents.set(o, [{ node: cur, rel: rid }]);
            next.push(o);
          } else if (level.get(o) === d) {
            parents.get(o)!.push({ node: cur, rel: rid });
          }
          if (o === toId) found = true;
        }
      }
      frontier = next;
    }
    if (!found) return { from: this.ref(fromId), to: this.ref(toId), found: false, length: null, paths: [], truncated: false, max_depth: maxDepth };

    // Reconstruct up to maxPaths shortest paths (DFS over parent lists).
    const paths: { nodes: string[]; rels: string[] }[] = [];
    let truncated = false;
    const walk = (node: string, nodes: string[], rels: string[]) => {
      if (paths.length >= maxPaths) {
        truncated = true;
        return;
      }
      if (node === fromId) {
        paths.push({ nodes: [fromId, ...nodes], rels: [...rels] });
        return;
      }
      for (const p of parents.get(node) || []) walk(p.node, [node, ...nodes], [p.rel, ...rels]);
    };
    walk(toId, [], []);
    return {
      from: this.ref(fromId),
      to: this.ref(toId),
      found: true,
      length: paths[0].rels.length,
      paths: paths.map((p) => ({
        nodes: p.nodes.map((n) => this.ref(n)),
        relationships: p.rels.map((rid) => relationshipRef(this.relationships.get(rid)!)),
        weakest_evidence_class: weakest(p.rels.map((rid) => evidenceClassOf(this.relationships.get(rid)!.status))),
      })),
      truncated,
    };
  }
}

function weakest(classes: EvidenceClass[]): EvidenceClass {
  if (classes.includes('disproven')) return 'disproven';
  if (classes.includes('hypothesis')) return 'hypothesis';
  return 'observed';
}

/** Import provenance stored by import adapters under frontmatter `trace_import`. */
export function provenanceOf(extra: Record<string, any> | undefined) {
  const p = extra?.trace_import;
  if (!p || typeof p !== 'object') return { origin: 'manual' as const };
  return {
    origin: 'import' as const,
    tool: typeof p.tool === 'string' ? p.tool : null,
    format: typeof p.format === 'string' ? p.format : null,
    imported_at: typeof p.imported_at === 'string' ? p.imported_at : null,
    batch_id: typeof p.batch_id === 'string' ? p.batch_id : null,
    source_url: typeof p.source_url === 'string' ? p.source_url : null,
    observed_at: typeof p.observed_at === 'string' ? p.observed_at : null,
  };
}

function clamp(n: number, lo: number, hi: number): number {
  const v = Number.isFinite(n) ? Math.floor(n) : lo;
  return Math.min(hi, Math.max(lo, v));
}
