/**
 * Graph canvas theme. Entity colours come from ENTITY_TYPES so the canvas,
 * entity list, inspector and editors all use the same muted palette.
 */
import { ENTITY_TYPES, type EntityType, type RelationshipStatus } from '@/types';

export const GRAPH_BG = '#111113';

/** Graph node colours are the app-wide entity colours (single source of truth). */
export const GRAPH_NODE_COLORS: Record<EntityType | 'note', string> = {
  ...(Object.fromEntries(ENTITY_TYPES.map((t) => [t.type, t.color])) as Record<EntityType, string>),
  note: '#7d7a72',
};

export function graphNodeColor(type: string): string {
  return (GRAPH_NODE_COLORS as Record<string, string>)[type] ?? '#8b8f98';
}

/** Edge colours: neutral by default; status is mostly carried by line style. */
export const GRAPH_EDGE_COLORS: Record<RelationshipStatus, string> = {
  confirmed: '#8e98a8',
  supported: '#7f8ea3',
  unverified: '#8a8270',
  candidate: '#6b7079',
  rejected: '#8a5a5a',
};

export const GRAPH_EDGE_STYLE: Record<RelationshipStatus, 'solid' | 'dashed' | 'dotted'> = {
  confirmed: 'solid',
  supported: 'solid',
  unverified: 'dashed',
  candidate: 'dotted',
  rejected: 'dashed',
};

export const GRAPH_SELECT = '#e6e8ec';

/** Node radius (model units) from degree: small by default, hubs grow sub-linearly. */
export function nodeDiameter(degree: number, maxDegree: number): number {
  const base = 9;
  if (degree <= 1) return base;
  const norm = Math.log(1 + degree) / Math.log(1 + Math.max(maxDegree, 2));
  return Math.round(base + norm * 17);
}
