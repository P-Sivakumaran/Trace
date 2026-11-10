/**
 * Canonical import model. Every adapter turns tool output into an ImportBatch;
 * nothing touches the investigation until the user reviews and commits it.
 */
import type { EntityType, RelationshipStatus } from '@/types';

/** One entity as reported by an external tool, before de-duplication. */
export interface ImportEntity {
  /** Batch-local key used by relationships (not a TRACE id). */
  key: string;
  type: EntityType;
  name: string;
  aliases?: string[];
  attributes?: Record<string, unknown>;
  tags?: string[];
  /** Where the tool found it, when known. */
  source_url?: string;
  /** When the tool observed it (ISO 8601), when known. */
  observed_at?: string;
  /** Original record, kept verbatim in provenance. */
  raw?: unknown;
}

export interface ImportRelationship {
  key: string;
  source: string; // ImportEntity.key
  target: string; // ImportEntity.key
  type: string;
  directed?: boolean;
  /** Imported links default to "candidate": tool output is a lead, not a verified fact. */
  status?: RelationshipStatus;
  confidence?: number | null;
  source_url?: string;
  observed_at?: string;
  note?: string;
  raw?: unknown;
}

/** A record the adapter could not map. Kept, never silently dropped. */
export interface UnmappedRecord {
  reason: string;
  raw: unknown;
}

export interface ImportBatch {
  /** Adapter id, e.g. "trace-json", "spiderfoot-csv". */
  format: string;
  /** Producing tool as best known, e.g. "SpiderFoot". */
  tool: string;
  fileName?: string;
  entities: ImportEntity[];
  relationships: ImportRelationship[];
  unmapped: UnmappedRecord[];
  warnings: string[];
}

export interface ImportAdapter {
  id: string;
  label: string;
  /** Cheap sniffing on file name + first bytes; highest score wins. 0 = no. */
  detect(fileName: string, text: string): number;
  parse(text: string, fileName?: string): ImportBatch;
}
