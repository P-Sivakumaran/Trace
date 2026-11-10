import { describe, expect, it } from 'vitest';
import { SqliteIndexService } from '../services/sqliteIndex';
import { createSampleProject } from '../services/storage/sampleData';

describe('case-scoped search index', () => {
  for (const backend of ['fallback', 'sqlite']) {
    it(`keeps copied record IDs independent in ${backend} search and deletion`, async () => {
      const index = new SqliteIndexService();
      if (backend === 'sqlite') {
        await index.init();
        expect(index.exportBinary()).not.toBeNull();
      }
      const first = createSampleProject(); first.project.id = 'case-one';
      const second = createSampleProject(); second.project.id = 'case-two';
      const entity = first.entities[0];
      first.entities = [{ ...entity, name: 'First unique search term' }];
      second.entities = [{ ...entity, name: 'Second unique search term' }];
      index.rebuildIndex(first); index.rebuildIndex(second);
      expect(index.search(first.project.id, 'First unique').map((row) => row.id)).toContain(entity.id);
      expect(index.search(second.project.id, 'Second unique').map((row) => row.id)).toContain(entity.id);
      index.removeDoc(second.project.id, entity.id, 'entity');
      expect(index.search(first.project.id, 'First unique').map((row) => row.id)).toContain(entity.id);
      expect(index.search(second.project.id, 'Second unique')).toEqual([]);
    });
  }
});
