import type { Database, SqlJsStatic } from 'sql.js';
import {
  Entity,
  EntityType,
  Note,
  ProjectData,
  Relationship,
  RelationshipStatus,
  SearchResult,
  Source,
} from '@/types';

interface SearchDoc {
  doc_id: string;
  project_id: string;
  doc_type: string;
  title: string;
  subtitle: string;
  content: string;
  tags_str: string;
}

export class SqliteIndexService {
  private SQL: SqlJsStatic | null = null;
  private db: Database | null = null;
  private fallbackDocs: Map<string, SearchDoc> = new Map();
  private isInitializing: Promise<void> | null = null;

  async init(savedBinary?: Uint8Array): Promise<void> {
    if (this.db) return;
    if (this.isInitializing) return this.isInitializing;

    this.isInitializing = (async () => {
      try {
        const sqlModule = await import('sql.js');
        const initFn = (sqlModule as any).default?.default || (sqlModule as any).default || sqlModule;

        if (typeof initFn === 'function') {
          this.SQL = await initFn({
            locateFile: (file: string) => {
              if (typeof window !== 'undefined' && window.location?.protocol === 'file:') {
                return `./${file}`;
              }
              if (typeof window === 'undefined' || !window.location) {
                try {
                  // In Node.js / test environment
                  return `./node_modules/sql.js/dist/${file}`;
                } catch {}
              }
              return `/${file}`;
            },
          });

          if (savedBinary && savedBinary.length > 0) {
            this.db = new this.SQL!.Database(savedBinary);
          } else {
            this.db = new this.SQL!.Database();
          }

          this.initSchema();
        }
      } catch (err) {
        console.warn('WASM SQLite init note (using in-memory search fallback if needed):', err);
      }
    })();

    return this.isInitializing;
  }

  private initSchema() {
    if (!this.db) return;

    try {
      // This database is a disposable index of canonical case files, not case storage.
      const version = this.db.exec('PRAGMA user_version')[0]?.values[0]?.[0];
      if (version !== 1) {
        this.db.run('DROP TABLE IF EXISTS entities; DROP TABLE IF EXISTS relationships; DROP TABLE IF EXISTS sources; DROP TABLE IF EXISTS notes; DROP TABLE IF EXISTS search_documents;');
      }
      this.db.run(`
        CREATE TABLE IF NOT EXISTS entities (
          id TEXT,
          project_id TEXT,
          type TEXT,
          name TEXT,
          aliases_json TEXT,
          attributes_json TEXT,
          tags_json TEXT,
          updated_at TEXT,
          PRIMARY KEY (project_id, id)
        );

        CREATE TABLE IF NOT EXISTS relationships (
          id TEXT,
          project_id TEXT,
          type TEXT,
          source_entity TEXT,
          target_entity TEXT,
          directed INTEGER,
          status TEXT,
          confidence REAL,
          evidence_json TEXT,
          created_at TEXT,
          PRIMARY KEY (project_id, id)
        );

        CREATE TABLE IF NOT EXISTS sources (
          id TEXT,
          project_id TEXT,
          title TEXT,
          url TEXT,
          source_type TEXT,
          accessed_at TEXT,
          PRIMARY KEY (project_id, id)
        );

        CREATE TABLE IF NOT EXISTS notes (
          id TEXT,
          project_id TEXT,
          title TEXT,
          tags_json TEXT,
          updated_at TEXT,
          PRIMARY KEY (project_id, id)
        );

        CREATE TABLE IF NOT EXISTS search_documents (
          doc_id TEXT,
          project_id TEXT,
          doc_type TEXT,
          title TEXT,
          subtitle TEXT,
          content TEXT,
          tags_str TEXT,
          PRIMARY KEY (project_id, doc_type, doc_id)
        );

        CREATE INDEX IF NOT EXISTS idx_entities_project ON entities(project_id);
        CREATE INDEX IF NOT EXISTS idx_relationships_project ON relationships(project_id);
        CREATE INDEX IF NOT EXISTS idx_search_project ON search_documents(project_id);
        PRAGMA user_version = 1;
      `);
    } catch (e) {
      console.warn('Error running initSchema:', e);
    }
  }

  public rebuildIndex(projectData: ProjectData) {
    const projectId = projectData.project.id;

    if (this.db) {
      try {
        this.db.run(`DELETE FROM entities WHERE project_id = ?`, [projectId]);
        this.db.run(`DELETE FROM relationships WHERE project_id = ?`, [projectId]);
        this.db.run(`DELETE FROM sources WHERE project_id = ?`, [projectId]);
        this.db.run(`DELETE FROM notes WHERE project_id = ?`, [projectId]);
        this.db.run(`DELETE FROM search_documents WHERE project_id = ?`, [projectId]);

        this.db.run(
          `INSERT OR REPLACE INTO search_documents (doc_id, project_id, doc_type, title, subtitle, content, tags_str)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            projectId,
            projectId,
            'project',
            projectData.project.name,
            'Investigation Project',
            projectData.project.markdownBody,
            '',
          ]
        );
      } catch (e) {
        console.warn('rebuildIndex db error:', e);
      }
    }

    // Clear old docs for this project in fallbackDocs
    for (const [key, doc] of this.fallbackDocs.entries()) {
      if (doc.project_id === projectId) {
        this.fallbackDocs.delete(key);
      }
    }

    // Also populate fallbackDocs
    this.fallbackDocs.set(JSON.stringify([projectId, 'project', projectId]), {
      doc_id: projectId,
      project_id: projectId,
      doc_type: 'project',
      title: projectData.project.name,
      subtitle: 'Investigation Project',
      content: projectData.project.markdownBody,
      tags_str: '',
    });

    for (const ent of projectData.entities) {
      this.indexEntity(projectId, ent);
    }

    for (const rel of projectData.relationships) {
      this.indexRelationship(projectId, rel);
    }

    for (const src of projectData.sources) {
      this.indexSource(projectId, src);
    }

    for (const note of projectData.notes) {
      this.indexNote(projectId, note);
    }
  }

  public indexEntity(projectId: string, ent: Entity) {
    const attributesStr = Object.entries(ent.attributes || {})
      .map(([k, v]) => `${k}: ${typeof v === 'object' && v !== null ? JSON.stringify(v) : v}`)
      .join(' ');
    const aliasesStr = (ent.aliases || []).join(' ');
    const tagsStr = (ent.tags || []).join(' ');
    const fullContent = `${aliasesStr} ${attributesStr} ${ent.markdownBody || ''}`;

    if (this.db) {
      try {
        this.db.run(
          `INSERT OR REPLACE INTO entities (id, project_id, type, name, aliases_json, attributes_json, tags_json, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            ent.id,
            projectId,
            ent.type,
            ent.name,
            JSON.stringify(ent.aliases || []),
            JSON.stringify(ent.attributes || {}),
            JSON.stringify(ent.tags || []),
            ent.updated_at,
          ]
        );

        this.db.run(
          `INSERT OR REPLACE INTO search_documents (doc_id, project_id, doc_type, title, subtitle, content, tags_str)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            ent.id,
            projectId,
            'entity',
            ent.name,
            `Entity (${ent.type})${ent.aliases && ent.aliases.length > 0 ? ` • Alias: ${ent.aliases[0]}` : ''}`,
            fullContent,
            tagsStr,
          ]
        );
      } catch (e) {
        console.warn('indexEntity db error:', e);
      }
    }

    this.fallbackDocs.set(JSON.stringify([projectId, 'entity', ent.id]), {
      doc_id: ent.id,
      project_id: projectId,
      doc_type: 'entity',
      title: ent.name,
      subtitle: `Entity (${ent.type})${ent.aliases && ent.aliases.length > 0 ? ` • Alias: ${ent.aliases[0]}` : ''}`,
      content: fullContent,
      tags_str: tagsStr,
    });
  }

  public indexRelationship(projectId: string, rel: Relationship) {
    if (this.db) {
      try {
        this.db.run(
          `INSERT OR REPLACE INTO relationships (id, project_id, type, source_entity, target_entity, directed, status, confidence, evidence_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            rel.id,
            projectId,
            rel.type,
            rel.source_entity,
            rel.target_entity,
            rel.directed ? 1 : 0,
            rel.status,
            rel.confidence,
            JSON.stringify(rel.evidence),
            rel.created_at,
          ]
        );

        this.db.run(
          `INSERT OR REPLACE INTO search_documents (doc_id, project_id, doc_type, title, subtitle, content, tags_str)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            rel.id,
            projectId,
            'relationship',
            `Relationship: ${rel.type}`,
            `${rel.source_entity} → ${rel.target_entity} [${rel.status}]`,
            rel.markdownBody,
            rel.status,
          ]
        );
      } catch (e) {
        console.warn('indexRelationship db error:', e);
      }
    }

    this.fallbackDocs.set(JSON.stringify([projectId, 'relationship', rel.id]), {
      doc_id: rel.id,
      project_id: projectId,
      doc_type: 'relationship',
      title: `Relationship: ${rel.type}`,
      subtitle: `${rel.source_entity} → ${rel.target_entity} [${rel.status}]`,
      content: rel.markdownBody,
      tags_str: rel.status,
    });
  }

  public indexSource(projectId: string, src: Source) {
    if (this.db) {
      try {
        this.db.run(
          `INSERT OR REPLACE INTO sources (id, project_id, title, url, source_type, accessed_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [src.id, projectId, src.title, src.url || '', src.source_type, src.accessed_at]
        );

        this.db.run(
          `INSERT OR REPLACE INTO search_documents (doc_id, project_id, doc_type, title, subtitle, content, tags_str)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            src.id,
            projectId,
            'source',
            src.title,
            `Source (${src.source_type}) ${src.url ? `• ${src.url}` : ''}`,
            src.markdownBody,
            src.source_type,
          ]
        );
      } catch (e) {
        console.warn('indexSource db error:', e);
      }
    }

    this.fallbackDocs.set(JSON.stringify([projectId, 'source', src.id]), {
      doc_id: src.id,
      project_id: projectId,
      doc_type: 'source',
      title: src.title,
      subtitle: `Source (${src.source_type}) ${src.url ? `• ${src.url}` : ''}`,
      content: src.markdownBody,
      tags_str: src.source_type,
    });
  }

  public indexNote(projectId: string, note: Note) {
    if (this.db) {
      try {
        this.db.run(
          `INSERT OR REPLACE INTO notes (id, project_id, title, tags_json, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
          [note.id, projectId, note.title, JSON.stringify(note.tags), note.updated_at]
        );

        this.db.run(
          `INSERT OR REPLACE INTO search_documents (doc_id, project_id, doc_type, title, subtitle, content, tags_str)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            note.id,
            projectId,
            'note',
            note.title,
            'Investigation Note',
            note.markdownBody,
            note.tags.join(' '),
          ]
        );
      } catch (e) {
        console.warn('indexNote db error:', e);
      }
    }

    this.fallbackDocs.set(JSON.stringify([projectId, 'note', note.id]), {
      doc_id: note.id,
      project_id: projectId,
      doc_type: 'note',
      title: note.title,
      subtitle: 'Investigation Note',
      content: note.markdownBody,
      tags_str: note.tags.join(' '),
    });
  }

  public removeDoc(projectId: string, docId: string, type: 'entity' | 'relationship' | 'source' | 'note') {
    const table = { entity: 'entities', relationship: 'relationships', source: 'sources', note: 'notes' }[type];
    if (this.db) {
      this.db.run(`DELETE FROM ${table} WHERE project_id = ? AND id = ?`, [projectId, docId]);
      this.db.run('DELETE FROM search_documents WHERE project_id = ? AND doc_type = ? AND doc_id = ?', [projectId, type, docId]);
    }
    this.fallbackDocs.delete(JSON.stringify([projectId, type, docId]));
  }

  public search(projectId: string, query: string): SearchResult[] {
    if (!query.trim()) return [];
    const clean = query.trim().toLowerCase();

    if (this.db) {
      try {
        const pattern = `%${clean}%`;
        const stmt = this.db.prepare(`
          SELECT doc_id, doc_type, title, subtitle, content, tags_str
          FROM search_documents
          WHERE project_id = ?
            AND (
              LOWER(title) LIKE ?
              OR LOWER(subtitle) LIKE ?
              OR LOWER(content) LIKE ?
              OR LOWER(tags_str) LIKE ?
            )
          LIMIT 50
        `);

        stmt.bind([projectId, pattern, pattern, pattern, pattern]);

        const results: SearchResult[] = [];
        while (stmt.step()) {
          const row = stmt.getAsObject() as {
            doc_id: string;
            doc_type: string;
            title: string;
            subtitle: string;
            content: string;
            tags_str: string;
          };

          let snippet: string | undefined;
          const contentIdx = row.content.toLowerCase().indexOf(clean);
          if (contentIdx !== -1) {
            const start = Math.max(0, contentIdx - 30);
            const end = Math.min(row.content.length, contentIdx + clean.length + 50);
            snippet = `...${row.content.substring(start, end).replace(/\n/g, ' ')}...`;
          }

          results.push({
            id: row.doc_id,
            type: row.doc_type as any,
            title: row.title,
            subtitle: row.subtitle,
            snippet,
            tags: row.tags_str ? row.tags_str.split(' ').filter(Boolean) : [],
          });
        }

        stmt.free();
        return results;
      } catch (err) {
        console.warn('SQLite query fallback:', err);
      }
    }

    // Fallback in-memory search
    const results: SearchResult[] = [];
    for (const doc of this.fallbackDocs.values()) {
      if (doc.project_id !== projectId) continue;

      const titleMatch = doc.title.toLowerCase().includes(clean);
      const subtitleMatch = doc.subtitle.toLowerCase().includes(clean);
      const contentMatch = doc.content.toLowerCase().includes(clean);
      const tagsMatch = doc.tags_str.toLowerCase().includes(clean);

      if (titleMatch || subtitleMatch || contentMatch || tagsMatch) {
        let snippet: string | undefined;
        const contentIdx = doc.content.toLowerCase().indexOf(clean);
        if (contentIdx !== -1) {
          const start = Math.max(0, contentIdx - 30);
          const end = Math.min(doc.content.length, contentIdx + clean.length + 50);
          snippet = `...${doc.content.substring(start, end).replace(/\n/g, ' ')}...`;
        }

        results.push({
          id: doc.doc_id,
          type: doc.doc_type as any,
          title: doc.title,
          subtitle: doc.subtitle,
          snippet,
          tags: doc.tags_str ? doc.tags_str.split(' ').filter(Boolean) : [],
        });
      }
    }

    return results;
  }

  public exportBinary(): Uint8Array | null {
    if (!this.db) return null;
    return this.db.export();
  }
}

export const sqliteIndexService = new SqliteIndexService();
