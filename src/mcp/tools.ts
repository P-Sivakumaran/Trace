/**
 * TRACE MCP tool definitions — READ ONLY.
 *
 * Transport-agnostic: tools receive a ProjectSource (list/load) and query the
 * InvestigationIndex service. There is deliberately no write path here; the
 * source interface itself exposes no mutating methods.
 */
import type { ProjectData, ProjectSummary } from '@/types';
import { InvestigationIndex } from '@/core/investigation';
import { isValidId } from '@/core/ids';

export interface ProjectSource {
  listProjects(): ProjectSummary[] | Promise<ProjectSummary[]>;
  loadProject(id: string): ProjectData | null | Promise<ProjectData | null>;
}

export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: { readOnlyHint: true; destructiveHint: false; idempotentHint: true; openWorldHint: false };
}

export class ToolInputError extends Error {}

const RO = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
const idProp = (what: string) => ({ type: 'string', description: `${what} id`, pattern: '^[a-zA-Z0-9_\\-.]{1,128}$' });
const projectProp = idProp('Project (investigation)');

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'list_projects',
    title: 'List investigations',
    description: 'List the local TRACE projects (investigations) with entity/relationship/source/note counts. Start here to get project ids.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: RO,
  },
  {
    name: 'get_project_summary',
    title: 'Investigation summary',
    description: 'Summary and statistics of one investigation: counts, entity types, verification statuses, evidence classes (observed / hypothesis / disproven), unsourced links, connected components and the most connected entities.',
    inputSchema: { type: 'object', properties: { project_id: projectProp }, required: ['project_id'], additionalProperties: false },
    annotations: RO,
  },
  {
    name: 'search_entities',
    title: 'Search entities',
    description: 'Search entities in a project by name, alias, tag, attribute value or notes. Results are ranked and include each entity\'s degree (number of relationships).',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: projectProp,
        query: { type: 'string', maxLength: 200, description: 'Case-insensitive text; empty string lists entities' },
        entity_type: { type: 'string', maxLength: 64, description: 'Optional filter, e.g. person, domain, email' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
      },
      required: ['project_id', 'query'],
      additionalProperties: false,
    },
    annotations: RO,
  },
  {
    name: 'get_entity',
    title: 'Entity details',
    description: 'Full details of one entity: attributes, aliases, tags, investigator notes, provenance (manual or imported) and a breakdown of its relationship types.',
    inputSchema: { type: 'object', properties: { project_id: projectProp, entity_id: idProp('Entity') }, required: ['project_id', 'entity_id'], additionalProperties: false },
    annotations: RO,
  },
  {
    name: 'get_entity_neighbors',
    title: 'Entity neighbourhood',
    description: 'The subgraph around an entity: neighbouring entities (with distance) and the relationships connecting them, up to depth 3. Rejected (disproven) links are excluded unless include_rejected is true.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: projectProp,
        entity_id: idProp('Entity'),
        depth: { type: 'integer', minimum: 1, maximum: 3, default: 1 },
        limit: { type: 'integer', minimum: 1, maximum: 200, default: 50, description: 'Max neighbour entities' },
        include_rejected: { type: 'boolean', default: false },
      },
      required: ['project_id', 'entity_id'],
      additionalProperties: false,
    },
    annotations: RO,
  },
  {
    name: 'get_relationship',
    title: 'Relationship details',
    description: 'One relationship: both endpoint entities, type, direction, verification status, evidence class, confidence, the investigator\'s explanation, provenance and its evidence sources.',
    inputSchema: { type: 'object', properties: { project_id: projectProp, relationship_id: idProp('Relationship') }, required: ['project_id', 'relationship_id'], additionalProperties: false },
    annotations: RO,
  },
  {
    name: 'get_evidence',
    title: 'Evidence and sources',
    description: 'Evidence trail. Give exactly one of relationship_id (sources backing that link), entity_id (all sources behind the entity\'s links, plus its unsourced links) or source_id (the source content and which links it supports).',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: projectProp,
        relationship_id: idProp('Relationship'),
        entity_id: idProp('Entity'),
        source_id: idProp('Source'),
      },
      required: ['project_id'],
      additionalProperties: false,
    },
    annotations: RO,
  },
  {
    name: 'find_paths',
    title: 'Paths between entities',
    description: 'Shortest connection paths between two entities (relationships treated as undirected). Each path lists its entities, relationships and its weakest evidence class.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: projectProp,
        from_entity_id: idProp('Start entity'),
        to_entity_id: idProp('End entity'),
        max_depth: { type: 'integer', minimum: 1, maximum: 6, default: 4 },
        max_paths: { type: 'integer', minimum: 1, maximum: 20, default: 5 },
        include_rejected: { type: 'boolean', default: false },
      },
      required: ['project_id', 'from_entity_id', 'to_entity_id'],
      additionalProperties: false,
    },
    annotations: RO,
  },
];

// ── Argument validation ────────────────────────────────────────────────────

function obj(args: unknown): Record<string, unknown> {
  if (args == null) return {};
  if (typeof args !== 'object' || Array.isArray(args)) throw new ToolInputError('arguments must be an object');
  return args as Record<string, unknown>;
}
function reqId(a: Record<string, unknown>, key: string): string {
  const v = a[key];
  if (!isValidId(v)) throw new ToolInputError(`${key} is missing or not a valid id`);
  return v;
}
function optId(a: Record<string, unknown>, key: string): string | undefined {
  return a[key] === undefined ? undefined : reqId(a, key);
}
function optInt(a: Record<string, unknown>, key: string): number | undefined {
  const v = a[key];
  if (v === undefined) return undefined;
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new ToolInputError(`${key} must be an integer`);
  return v;
}
function optBool(a: Record<string, unknown>, key: string): boolean | undefined {
  const v = a[key];
  if (v === undefined) return undefined;
  if (typeof v !== 'boolean') throw new ToolInputError(`${key} must be a boolean`);
  return v;
}
function str(a: Record<string, unknown>, key: string, max: number, required: boolean): string | undefined {
  const v = a[key];
  if (v === undefined && !required) return undefined;
  if (typeof v !== 'string' || v.length > max) throw new ToolInputError(`${key} must be a string of at most ${max} characters`);
  return v;
}
function rejectUnknown(a: Record<string, unknown>, allowed: string[]) {
  const extra = Object.keys(a).filter((k) => !allowed.includes(k));
  if (extra.length) throw new ToolInputError(`unknown argument(s): ${extra.join(', ')}`);
}

// ── Dispatcher ─────────────────────────────────────────────────────────────

export type ToolResult = { ok: true; data: unknown } | { ok: false; error: string };

export async function callTool(source: ProjectSource, name: string, rawArgs: unknown): Promise<ToolResult> {
  const def = TOOL_DEFINITIONS.find((t) => t.name === name);
  if (!def) return { ok: false, error: `Unknown tool: ${String(name).slice(0, 64)}` };
  try {
    const a = obj(rawArgs);
    rejectUnknown(a, Object.keys((def.inputSchema as any).properties || {}));

    if (name === 'list_projects') {
      const projects = await source.listProjects();
      return {
        ok: true,
        data: {
          projects: projects.map((p) => ({
            id: p.id,
            name: p.name,
            entities: p.entityCount,
            relationships: p.relationshipCount,
            sources: p.sourceCount,
            notes: p.noteCount,
            updated_at: p.updated_at,
          })),
        },
      };
    }

    const projectId = reqId(a, 'project_id');
    const data = await source.loadProject(projectId);
    if (!data) return { ok: false, error: `Project not found: ${projectId}` };
    const idx = new InvestigationIndex(data);
    const notFound = (what: string, id: string): ToolResult => ({ ok: false, error: `${what} not found: ${id}` });

    switch (name) {
      case 'get_project_summary':
        return { ok: true, data: idx.summary() };
      case 'search_entities': {
        const query = str(a, 'query', 200, true)!;
        const type = str(a, 'entity_type', 64, false);
        return { ok: true, data: idx.searchEntities(query, { type, limit: optInt(a, 'limit') }) };
      }
      case 'get_entity': {
        const id = reqId(a, 'entity_id');
        const r = idx.entityDetails(id);
        return r ? { ok: true, data: r } : notFound('Entity', id);
      }
      case 'get_entity_neighbors': {
        const id = reqId(a, 'entity_id');
        const r = idx.neighbors(id, { depth: optInt(a, 'depth'), limit: optInt(a, 'limit'), includeRejected: optBool(a, 'include_rejected') });
        return r ? { ok: true, data: r } : notFound('Entity', id);
      }
      case 'get_relationship': {
        const id = reqId(a, 'relationship_id');
        const r = idx.relationshipDetails(id);
        return r ? { ok: true, data: r } : notFound('Relationship', id);
      }
      case 'get_evidence': {
        const relationshipId = optId(a, 'relationship_id');
        const entityId = optId(a, 'entity_id');
        const sourceId = optId(a, 'source_id');
        const given = [relationshipId, entityId, sourceId].filter(Boolean).length;
        if (given !== 1) throw new ToolInputError('provide exactly one of relationship_id, entity_id, source_id');
        const r = idx.evidence({ relationshipId, entityId, sourceId });
        return r ? { ok: true, data: r } : notFound(relationshipId ? 'Relationship' : entityId ? 'Entity' : 'Source', (relationshipId || entityId || sourceId)!);
      }
      case 'find_paths': {
        const from = reqId(a, 'from_entity_id');
        const to = reqId(a, 'to_entity_id');
        const r = idx.findPaths(from, to, { maxDepth: optInt(a, 'max_depth'), maxPaths: optInt(a, 'max_paths'), includeRejected: optBool(a, 'include_rejected') });
        return r ? { ok: true, data: r } : notFound('Entity', idx.entities.has(from) ? to : from);
      }
    }
    return { ok: false, error: `Unhandled tool: ${name}` };
  } catch (err) {
    if (err instanceof ToolInputError) return { ok: false, error: `Invalid arguments: ${err.message}` };
    // Never leak stack traces or filesystem paths to the client.
    return { ok: false, error: 'Internal error while reading the investigation' };
  }
}
