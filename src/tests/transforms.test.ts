import { describe, it, expect } from 'vitest';
import {
  TRANSFORMS_REGISTRY,
  getTransformsForEntity,
  getTransformById,
} from '../services/transforms/registry';
import { Entity } from '../types';

describe('Maltego OSINT Transforms Registry', () => {
  it('registers all key OSINT transforms and machines', () => {
    expect(TRANSFORMS_REGISTRY.length).toBeGreaterThanOrEqual(10);

    const ids = TRANSFORMS_REGISTRY.map((t) => t.id);
    expect(ids).toContain('dns_resolve_ip');
    expect(ids).toContain('dns_find_mx');
    expect(ids).toContain('dns_find_ns');
    expect(ids).toContain('whois_rdap_lookup');
    expect(ids).toContain('ip_geolocation_asn');
    expect(ids).toContain('account_github_recon');
    expect(ids).toContain('machine_domain_footprint');
  });

  it('filters available transforms for domain entity', () => {
    const domainTransforms = getTransformsForEntity('domain');
    expect(domainTransforms.length).toBeGreaterThanOrEqual(5);

    const names = domainTransforms.map((t) => t.name);
    expect(names.some((n) => n.includes('DNS'))).toBe(true);
    expect(names.some((n) => n.includes('WHOIS'))).toBe(true);
  });

  it('filters available transforms for IP entity', () => {
    const ipTransforms = getTransformsForEntity('ip');
    expect(ipTransforms.length).toBeGreaterThanOrEqual(2);
    expect(ipTransforms.some((t) => t.id === 'ip_geolocation_asn')).toBe(true);
  });

  it('extracts domain from website url transform', async () => {
    const transform = getTransformById('website_extract_domain');
    expect(transform).toBeDefined();

    const websiteEntity: Entity = {
      id: 'ent-web-1',
      name: 'https://investigation.bellingcat.com/articles/index.html',
      type: 'website',
      aliases: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      attributes: {},
      tags: ['website'],
      markdownBody: '',
    };

    const logs: string[] = [];
    const result = await transform!.run(websiteEntity, {
      allEntities: [websiteEntity],
      log: (msg) => logs.push(msg),
    });

    expect(result.newEntities.length).toBe(1);
    expect(result.newEntities[0].name).toBe('investigation.bellingcat.com');
    expect(result.newEntities[0].type).toBe('domain');
    expect(result.newRelationships.length).toBe(1);
    expect(result.newRelationships[0].type).toBe('domain_for');
  });

  it('transforms email to domain and username entity', async () => {
    const transform = getTransformById('email_to_domain_and_name');
    expect(transform).toBeDefined();

    const emailEntity: Entity = {
      id: 'ent-email-1',
      name: 'alex.investigator@proton.me',
      type: 'email',
      aliases: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      attributes: {},
      tags: ['email'],
      markdownBody: '',
    };

    const logs: string[] = [];
    const result = await transform!.run(emailEntity, {
      allEntities: [emailEntity],
      log: (msg) => logs.push(msg),
    });

    expect(result.newEntities.some((e) => e.name === 'proton.me' && e.type === 'domain')).toBe(true);
    expect(result.newEntities.some((e) => e.name === 'Alex Investigator' && e.type === 'person')).toBe(true);
    expect(result.newRelationships.length).toBeGreaterThanOrEqual(2);
  });
});
