import { Entity, EntityType, RelationshipStatus } from '@/types';

export type TransformCategory =
  | 'Machines'
  | 'DNS & Infrastructure'
  | 'Network & IP'
  | 'OSINT & Identity'
  | 'Web & Content';

export interface DiscoveredEntity {
  name: string;
  type: EntityType;
  attributes?: Record<string, any>;
  tags?: string[];
  photo?: string;
  custom_type?: string;
}

export interface DiscoveredRelationship {
  targetEntityName: string;
  type: string;
  directed?: boolean;
  status?: RelationshipStatus;
  confidence?: number;
  evidence?: string[];
}

export interface TransformResult {
  newEntities: DiscoveredEntity[];
  newRelationships: DiscoveredRelationship[];
  logs: string[];
  error?: string;
}

export interface TransformLogEntry {
  id: string;
  timestamp: string;
  transformId: string;
  transformName: string;
  entityName: string;
  entityType: EntityType;
  status: 'running' | 'success' | 'warning' | 'error';
  message: string;
  entitiesAdded?: number;
  relationshipsAdded?: number;
  durationMs?: number;
}

export interface TransformContext {
  allEntities: Entity[];
  signal?: AbortSignal;
  log: (message: string) => void;
}

export interface TransformDefinition {
  id: string;
  name: string;
  description: string;
  category: TransformCategory;
  entityTypes: EntityType[];
  iconName: string;
  isMachine?: boolean;
  run: (entity: Entity, context: TransformContext) => Promise<TransformResult>;
}
