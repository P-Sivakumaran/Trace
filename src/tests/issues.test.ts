import { describe, it, expect } from 'vitest';
import { ENTITY_TYPES, EVIDENCE_CLASSES, RELATIONSHIP_STATUSES, evidenceClassOf } from '../types';
import { normaliseIconSvg, svgToDataUri } from '../features/graph/graphIcons';
import { parseEntityFile } from '../services/markdownParser';

describe('issue #1 — entity type icons', () => {
  it('has the requested device types', () => {
    const types = ENTITY_TYPES.map((t) => t.type);
    for (const t of ['computer', 'laptop', 'smartphone', 'network_interface', 'server']) expect(types).toContain(t);
  });

  it('every type has a unique colour-coded entry and an icon name', () => {
    expect(new Set(ENTITY_TYPES.map((t) => t.type)).size).toBe(ENTITY_TYPES.length);
    ENTITY_TYPES.forEach((t) => expect(t.iconName).toBeTruthy());
  });

  it('normalises lucide markup into a standalone SVG data URI', () => {
    const svg = normaliseIconSvg('<svg width="16" height="16" class="lucide x" stroke="currentColor" viewBox="0 0 24 24"><path d="M1 1"/></svg>', '#000');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('stroke="#000"');
    expect(svg).not.toContain('class=');
    expect(svgToDataUri(svg)).toMatch(/^data:image\/svg\+xml;charset=utf-8,%3Csvg/);
  });

  it('old projects with unknown/custom types still parse', () => {
    const e = parseEntityFile('---\nid: x\ntype: vehicle\nname: Car\ncreated_at: a\nupdated_at: a\n---\nbody', 'x');
    expect(e.type).toBe('vehicle');
  });
});

describe('issue #2 — evidence classes', () => {
  it('maps every verification status to exactly one class', () => {
    expect(evidenceClassOf('confirmed')).toBe('observed');
    expect(evidenceClassOf('supported')).toBe('observed');
    expect(evidenceClassOf('unverified')).toBe('hypothesis');
    expect(evidenceClassOf('candidate')).toBe('hypothesis');
    expect(evidenceClassOf('rejected')).toBe('disproven');
    const covered = EVIDENCE_CLASSES.flatMap((c) => c.statuses).sort();
    expect(covered).toEqual(RELATIONSHIP_STATUSES.map((s) => s.status).sort());
  });
});
