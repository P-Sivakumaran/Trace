import { z } from 'zod';
import type React from 'react';

declare module 'react' {
  interface CSSProperties {
    WebkitAppRegion?: 'drag' | 'no-drag';
  }
}

declare global {
  const __APP_VERSION__: string;
  const __BUILD_HASH__: string;
}

export type EntityType =
  | 'person'
  | 'organization'
  | 'company'
  | 'website'
  | 'domain'
  | 'account'
  | 'email'
  | 'phone'
  | 'ip'
  | 'location'
  | 'document'
  | 'event'
  | 'custom';

export const ENTITY_TYPES: { type: EntityType; label: string; color: string; iconName: string }[] = [
  { type: 'person', label: 'Person', color: '#8a7bb8', iconName: 'User' },
  { type: 'organization', label: 'Organization', color: '#c08a55', iconName: 'Users' },
  { type: 'company', label: 'Company', color: '#b5835a', iconName: 'Briefcase' },
  { type: 'website', label: 'Website', color: '#5c9e8f', iconName: 'Globe2' },
  { type: 'domain', label: 'Domain', color: '#4fa3a0', iconName: 'Network' },
  { type: 'account', label: 'Account', color: '#9a86b0', iconName: 'Fingerprint' },
  { type: 'email', label: 'Email Address', color: '#b7a165', iconName: 'Mail' },
  { type: 'phone', label: 'Phone Number', color: '#a8946a', iconName: 'Phone' },
  { type: 'ip', label: 'IP Address', color: '#5b7fae', iconName: 'Server' },
  { type: 'location', label: 'Location', color: '#6f9a68', iconName: 'MapPin' },
  { type: 'document', label: 'Document', color: '#8b8f98', iconName: 'FileText' },
  { type: 'event', label: 'Event', color: '#a99b5e', iconName: 'Calendar' },
  { type: 'custom', label: 'Custom', color: '#9b7f97', iconName: 'Boxes' },
];

export type RelationshipStatus =
  | 'candidate'
  | 'unverified'
  | 'supported'
  | 'confirmed'
  | 'rejected';

export const RELATIONSHIP_STATUSES: {
  status: RelationshipStatus;
  label: string;
  color: string;
  borderStyle: 'solid' | 'dashed' | 'dotted';
}[] = [
  { status: 'confirmed', label: 'Confirmed', color: '#6fae8c', borderStyle: 'solid' },
  { status: 'supported', label: 'Supported', color: '#739cc0', borderStyle: 'solid' },
  { status: 'unverified', label: 'Unverified', color: '#c6a463', borderStyle: 'dashed' },
  { status: 'candidate', label: 'Candidate', color: '#7c8088', borderStyle: 'dotted' },
  { status: 'rejected', label: 'Rejected', color: '#c97c7c', borderStyle: 'dashed' },
];

export type SourceType =
  | 'webpage'
  | 'document'
  | 'social_post'
  | 'leak'
  | 'registry'
  | 'interview'
  | 'other';

export const SOURCE_TYPES: { type: SourceType; label: string }[] = [
  { type: 'webpage', label: 'Webpage' },
  { type: 'document', label: 'Document' },
  { type: 'social_post', label: 'Social Post' },
  { type: 'leak', label: 'Data Leak' },
  { type: 'registry', label: 'Public Registry' },
  { type: 'interview', label: 'Interview' },
  { type: 'other', label: 'Other' },
];

// Zod schemas for runtime validation
export const EntityFrontmatterSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string(),
  aliases: z.array(z.string()).default([]),
  created_at: z.string(),
  updated_at: z.string(),
  attributes: z.record(z.string(), z.any()).default({}),
  tags: z.array(z.string()).default([]),
  custom_type: z.string().optional(),
}).passthrough();

export const RelationshipFrontmatterSchema = z.object({
  id: z.string(),
  type: z.string(),
  source_entity: z.string(),
  target_entity: z.string(),
  directed: z.boolean().default(true),
  status: z.enum(['candidate', 'unverified', 'supported', 'confirmed', 'rejected']).default('candidate'),
  confidence: z.number().nullable().optional(),
  evidence: z.array(z.string()).default([]),
  created_at: z.string(),
}).passthrough();

export const SourceFrontmatterSchema = z.object({
  id: z.string(),
  type: z.literal('source'),
  title: z.string(),
  url: z.string().optional(),
  accessed_at: z.string(),
  source_type: z.string().default('webpage'),
}).passthrough();

export const ProjectFrontmatterSchema = z.object({
  id: z.string(),
  type: z.literal('project'),
  name: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
}).passthrough();

export const NoteFrontmatterSchema = z.object({
  id: z.string(),
  type: z.literal('note'),
  title: z.string(),
  tags: z.array(z.string()).default([]),
  created_at: z.string(),
  updated_at: z.string(),
}).passthrough();

// Domain Interfaces
export interface Entity {
  id: string;
  type: EntityType;
  name: string;
  aliases: string[];
  created_at: string;
  updated_at: string;
  attributes: Record<string, any>;
  tags: string[];
  custom_type?: string;
  markdownBody: string;
  extraFrontmatter?: Record<string, any>;
}

export interface Relationship {
  id: string;
  type: string;
  source_entity: string;
  target_entity: string;
  directed: boolean;
  status: RelationshipStatus;
  confidence: number | null;
  evidence: string[]; // source IDs
  created_at: string;
  markdownBody: string;
  extraFrontmatter?: Record<string, any>;
}

export interface Source {
  id: string;
  type: 'source';
  title: string;
  url?: string;
  accessed_at: string;
  source_type: SourceType;
  markdownBody: string;
  extraFrontmatter?: Record<string, any>;
}

export interface Note {
  id: string;
  type: 'note';
  title: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  markdownBody: string;
  extraFrontmatter?: Record<string, any>;
}

export interface Project {
  id: string;
  type: 'project';
  name: string;
  created_at: string;
  updated_at: string;
  markdownBody: string;
  extraFrontmatter?: Record<string, any>;
}

export interface ProjectSummary {
  id: string;
  name: string;
  entityCount: number;
  relationshipCount: number;
  sourceCount: number;
  noteCount: number;
  updated_at: string;
}

export interface QuickSource {
  id: string;
  title: string;
  url?: string;
  source_type?: SourceType | string;
  description?: string;
  projectId?: string;
  created_at: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | string;
  headers?: Record<string, string> | string;
  body?: string;
  lastResponse?: {
    status?: number;
    statusText?: string;
    data?: any;
    durationMs?: number;
    timestamp?: string;
  };
}

export interface Workspace {
  id: string;
  name: string;
  activeProjectId?: string;
  workspacePath?: string;
  quickSources?: QuickSource[];
  created_at: string;
  updated_at: string;
}

export interface ProjectData {
  project: Project;
  entities: Entity[];
  relationships: Relationship[];
  sources: Source[];
  notes: Note[];
}

export interface GraphLayout {
  positions: Record<string, { x: number; y: number }>;
}

export interface SearchResult {
  id: string;
  type: 'entity' | 'relationship' | 'source' | 'note' | 'project';
  title: string;
  subtitle: string;
  snippet?: string;
  tags?: string[];
  entityType?: EntityType;
  relStatus?: RelationshipStatus;
}

export type TabType =
  | 'overview'
  | 'graph'
  | 'entity'
  | 'relationship'
  | 'source'
  | 'note'
  | 'search'
  | 'settings';

export interface Tab {
  id: string;
  type: TabType;
  targetId?: string;
  title: string;
  isPinned?: boolean;
  isPreview?: boolean;
  isDirty?: boolean;
}

export interface StorageChangeEvent {
  type: 'reload' | 'create' | 'update' | 'delete';
  targetType: 'project' | 'entity' | 'relationship' | 'source' | 'note';
  targetId?: string;
}
