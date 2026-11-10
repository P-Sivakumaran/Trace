import { describe, it, expect } from 'vitest';
import { parseCsv } from '../services/import/csv';
import {
  detectAdapter,
  guessIndicatorType,
  indicatorCsvAdapter,
  indicatorListAdapter,
  spiderfootCsvAdapter,
  traceJsonAdapter,
} from '../services/import/adapters';
import { buildImportRecords, planImport } from '../services/import/plan';
import { parseEntityFile, serializeEntityFile, parseRelationshipFile, serializeRelationshipFile } from '../services/markdownParser';
import { createSampleProject } from '../services/storage/sampleData';
import type { ProjectData } from '../types';

const SPIDERFOOT = `Updated,Type,Module,Source,F/P,Data
2026-11-01 10:00:00,Internet Name,sfp_dnsresolve,example.com,0,mail.example.com
2026-11-01 10:00:01,IP Address,sfp_dnsresolve,mail.example.com,0,93.184.216.34
2026-11-01 10:00:02,Email Address,sfp_email,example.com,0,"info@example.com"
2026-11-01 10:00:03,Raw DNS Records,sfp_dnsraw,example.com,0,"v=spf1 -all"
2026-11-01 10:00:04,Email Address,sfp_email,example.com,1,fp@example.com
`;

function emptyProject(): ProjectData {
  return {
    project: { id: 'p', type: 'project', name: 'P', created_at: '', updated_at: '', markdownBody: '' },
    entities: [
      { id: 'existing-domain', type: 'domain', name: 'Mail.Example.com', aliases: [], created_at: '', updated_at: '', attributes: {}, tags: [], markdownBody: 'manual notes' },
    ],
    relationships: [],
    sources: [],
    notes: [],
  };
}

describe('csv parser', () => {
  it('handles quotes, escaped quotes, CRLF and BOM', () => {
    expect(parseCsv('﻿a,b\r\n"x, y","he said ""hi"""\r\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'he said "hi"'],
    ]);
  });
});

describe('indicator typing', () => {
  it.each([
    ['a@b.co', 'email'],
    ['8.8.8.8', 'ip'],
    ['2001:db8::1', 'ip'],
    ['https://x.org/p', 'website'],
    ['sub.example.com', 'domain'],
    ['+1 (555) 123-4567', 'phone'],
    ['00:1A:2b:3c:4D:5e', 'network_interface'],
    ['@handle', 'account'],
    ['999.1.1.1', null],
    ['just words', null],
  ])('%s → %s', (v, t) => expect(guessIndicatorType(v)).toBe(t));
});

describe('adapters', () => {
  it('detects formats', () => {
    expect(detectAdapter('scan.csv', SPIDERFOOT).id).toBe('spiderfoot-csv');
    expect(detectAdapter('x.json', '{"trace_import":1}').id).toBe('trace-json');
    expect(detectAdapter('iocs.csv', 'type,value\n').id).toBe('indicator-csv');
    expect(detectAdapter('iocs.txt', 'a.com').id).toBe('indicator-list');
  });

  it('parses SpiderFoot, keeps unmapped and false positives, links by Source', () => {
    const b = spiderfootCsvAdapter.parse(SPIDERFOOT, 'scan.csv');
    expect(b.tool).toBe('SpiderFoot');
    expect(b.entities.map((e) => [e.type, e.name])).toEqual([
      ['domain', 'mail.example.com'],
      ['ip', '93.184.216.34'],
      ['email', 'info@example.com'],
      ['domain', 'example.com'], // scan target from the Source column
    ]);
    expect(b.unmapped.map((u) => u.reason)).toEqual(['unmapped SpiderFoot type "Raw DNS Records"', 'marked false positive in SpiderFoot']);
    const names = new Map(b.entities.map((e) => [e.key, e.name]));
    expect(b.relationships.map((r) => `${names.get(r.source)} > ${names.get(r.target)}`)).toEqual([
      'example.com > mail.example.com',
      'mail.example.com > 93.184.216.34',
      'example.com > info@example.com',
    ]);
    expect(b.entities[0].observed_at).toBe(new Date('2026-11-01 10:00:00').toISOString());
  });

  it('parses canonical TRACE JSON with provenance and rejects bad endpoints', () => {
    const b = traceJsonAdapter.parse(
      JSON.stringify({
        trace_import: 1,
        tool: 'my-script',
        entities: [
          { key: 'a', type: 'person', name: 'Ann', source_url: 'https://src.example/a', observed_at: '2026-10-01' },
          { key: 'b', type: 'Email Address', name: 'ann@example.com' },
          { key: 'c', type: 'spaceship', name: 'X' },
          { key: 'd', type: 'domain', name: 'evil', source_url: 'javascript:alert(1)' },
        ],
        relationships: [
          { source: 'a', target: 'b', type: 'uses', status: 'confirmed' },
          { source: 'a', target: 'zzz', type: 'knows' },
        ],
      }),
    );
    expect(b.entities.map((e) => e.type)).toEqual(['person', 'email', 'domain']);
    expect(b.entities[0].source_url).toBe('https://src.example/a');
    expect(b.entities[2].source_url).toBeUndefined();
    expect(b.unmapped).toHaveLength(2);
    expect(b.relationships[0].status).toBe('confirmed');
    expect(() => traceJsonAdapter.parse('{"trace_import":2}')).toThrow(/version/);
    expect(() => traceJsonAdapter.parse('nope')).toThrow(/JSON/);
  });

  it('keeps extra CSV columns as attributes', () => {
    const b = indicatorCsvAdapter.parse('value,type,notes,source_url\nx.org,,first seen in leak,https://a.b/c\n,,orphan,\n', 'i.csv');
    expect(b.entities[0]).toMatchObject({ type: 'domain', name: 'x.org', attributes: { notes: 'first seen in leak' }, source_url: 'https://a.b/c' });
    expect(b.unmapped).toHaveLength(1);
  });

  it('de-duplicates an indicator list', () => {
    const b = indicatorListAdapter.parse('# header\na.com\nA.com\nhello world\n');
    expect(b.entities).toHaveLength(1);
    expect(b.unmapped).toHaveLength(1);
  });
});

describe('import plan & commit', () => {
  it('detects duplicates and never overwrites existing entities', () => {
    const project = emptyProject();
    const plan = planImport(spiderfootCsvAdapter.parse(SPIDERFOOT, 'scan.csv'), project);
    const dup = plan.entities.find((p) => p.item.name === 'mail.example.com')!;
    expect(dup.duplicateOf).toMatchObject({ id: 'existing-domain', matchedOn: 'name' });
    expect(dup.decision).toBe('link-existing');

    const rec = buildImportRecords(plan, { existingIds: new Set(['existing-domain']), now: new Date('2026-11-09T00:00:00Z') });
    expect(rec.entities.map((e) => e.name)).toEqual(['93.184.216.34', 'info@example.com', 'example.com']);
    expect(rec.entities.some((e) => e.id === 'existing-domain')).toBe(false);
    // Relationships reuse the existing entity id as an endpoint.
    expect(rec.relationships).toHaveLength(3);
    expect(rec.relationships[0].target_entity).toBe('existing-domain');
    expect(rec.relationships[1].source_entity).toBe('existing-domain');
    expect(rec.relationships[0].status).toBe('candidate');
    expect(rec.relationships[0].evidence).toEqual([rec.source.id]);
    // Unmapped data is preserved on the import source.
    expect(rec.source.extraFrontmatter?.trace_import.unmapped).toHaveLength(2);
    expect(project.entities[0].name).toBe('Mail.Example.com');
  });

  it('marks imported records and survives a Markdown round trip', () => {
    const plan = planImport(
      traceJsonAdapter.parse(JSON.stringify({ trace_import: 1, tool: 't', entities: [{ key: 'a', type: 'person', name: 'Ann', source_url: 'https://s.example/' }, { key: 'b', type: 'person', name: 'Bob' }], relationships: [{ source: 'a', target: 'b', type: 'knows' }] })),
      emptyProject(),
    );
    const rec = buildImportRecords(plan);
    const ent = parseEntityFile(serializeEntityFile(rec.entities[0]), 'x');
    expect(ent.tags).toContain('imported');
    expect(ent.extraFrontmatter?.trace_import).toMatchObject({ tool: 't', format: 'trace-json', source_url: 'https://s.example/' });
    expect(ent.extraFrontmatter?.trace_import.raw).toMatchObject({ name: 'Ann' });
    const rel = parseRelationshipFile(serializeRelationshipFile(rec.relationships[0]), 'y');
    expect(rel.extraFrontmatter?.trace_import.batch_id).toBe(rec.batchId);
  });

  it('skips relationships that already exist and drops ones with skipped endpoints', () => {
    const sample = createSampleProject();
    const r0 = sample.relationships[0];
    const a = sample.entities.find((e) => e.id === r0.source_entity)!;
    const b = sample.entities.find((e) => e.id === r0.target_entity)!;
    const batch = traceJsonAdapter.parse(
      JSON.stringify({ trace_import: 1, entities: [{ key: 'a', type: a.type, name: a.name }, { key: 'b', type: b.type, name: b.name }, { key: 'c', type: 'person', name: 'Zed' }], relationships: [{ source: 'a', target: 'b', type: r0.type }, { source: 'a', target: 'c', type: 'knows' }] }),
    );
    const plan = planImport(batch, sample);
    expect(plan.relationships[0].decision).toBe('skip');
    plan.entities[2].decision = 'skip';
    const rec = buildImportRecords(plan, { existingIds: new Set(sample.entities.map((e) => e.id)) });
    expect(rec.entities).toHaveLength(0);
    expect(rec.relationships).toHaveLength(0);
    expect(rec.droppedRelationships).toBe(1);
  });

  it('generates ids that do not collide with existing ones', () => {
    const plan = planImport(traceJsonAdapter.parse(JSON.stringify({ trace_import: 1, entities: [{ key: 'a', type: 'person', name: 'Ann' }] })), {
      ...emptyProject(),
      entities: [],
    });
    const rec = buildImportRecords(plan, { existingIds: new Set(['person-ann']) });
    expect(rec.entities[0].id).not.toBe('person-ann');
    expect(rec.entities[0].id.startsWith('person-ann-')).toBe(true);
  });
});
