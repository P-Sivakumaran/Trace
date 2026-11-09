import { describe, it, expect } from 'vitest';
import { compareSemver, isNewerVersion, parseSemver } from '../services/updates/semver';
import { checkForUpdates, pickLatestRelease } from '../services/updates/updateChecker';

describe('semver', () => {
  it('parses versions with v prefix, prerelease and build metadata', () => {
    expect(parseSemver('v0.2.0-alpha.1')).toMatchObject({ major: 0, minor: 2, patch: 0, prerelease: ['alpha', 1] });
    expect(parseSemver('1.2.3+abc')).toMatchObject({ prerelease: [] });
    expect(parseSemver('1.2')).toBeNull();
    expect(parseSemver('01.2.3')).toBeNull();
    expect(parseSemver('latest')).toBeNull();
  });

  it('orders prereleases per SemVer 2.0 §11', () => {
    const ordered = [
      '0.1.0-alpha.2',
      '0.2.0-alpha.1',
      '0.2.0-alpha.2',
      '0.2.0-alpha.10',
      '0.2.0-alpha.beta',
      '0.2.0-beta.2',
      '0.2.0-beta.11',
      '0.2.0-rc.1',
      '0.2.0',
      '0.10.0-alpha.1',
      '1.0.0',
    ];
    for (let i = 0; i < ordered.length - 1; i++) {
      expect(compareSemver(ordered[i], ordered[i + 1]), `${ordered[i]} < ${ordered[i + 1]}`).toBeLessThan(0);
      expect(compareSemver(ordered[i + 1], ordered[i])).toBeGreaterThan(0);
    }
  });

  it('is not lexicographic', () => {
    expect(isNewerVersion('0.2.0-alpha.10', '0.2.0-alpha.9')).toBe(true);
    expect(isNewerVersion('0.10.0', '0.9.0')).toBe(true);
    expect(compareSemver('1.0.0+build1', '1.0.0+build2')).toBe(0);
    expect(compareSemver('v1.0.0', '1.0.0')).toBe(0);
  });

  it('throws on invalid input', () => {
    expect(() => compareSemver('nope', '1.0.0')).toThrow();
  });
});

const release = (tag: string, extra: Record<string, unknown> = {}) => ({
  tag_name: tag,
  name: `Trace ${tag}`,
  html_url: `https://github.com/dlxarl/Trace/releases/tag/${tag}`,
  body: `Notes for ${tag}`,
  published_at: '2026-11-01T00:00:00Z',
  prerelease: tag.includes('-'),
  draft: false,
  ...extra,
});

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

describe('pickLatestRelease', () => {
  it('picks the highest version including prereleases, skipping drafts and bad tags', () => {
    const latest = pickLatestRelease([
      release('v0.1.0-alpha.2'),
      release('v0.3.0-alpha.1', { draft: true }),
      release('nightly'),
      release('v0.2.0-alpha.2'),
      release('v0.2.0-alpha.10'),
    ]);
    expect(latest?.version).toBe('0.2.0-alpha.10');
    expect(latest?.prerelease).toBe(true);
  });

  it('never trusts a non-GitHub html_url', () => {
    const latest = pickLatestRelease([release('v1.0.0', { html_url: 'https://evil.example/download' })]);
    expect(latest?.url).toBe('https://github.com/dlxarl/Trace/releases/tag/v1.0.0');
  });

  it('throws on a non-array payload', () => {
    expect(() => pickLatestRelease({ message: 'x' })).toThrow();
  });
});

describe('checkForUpdates', () => {
  const fetchOk = (body: unknown) => async () => jsonResponse(body);

  it('reports a newer alpha', async () => {
    const r = await checkForUpdates('0.2.0-alpha.1', { fetchImpl: fetchOk([release('v0.2.0-alpha.2'), release('v0.1.0-alpha.2')]) });
    expect(r.status).toBe('update-available');
    if (r.status === 'update-available') {
      expect(r.latest.version).toBe('0.2.0-alpha.2');
      expect(r.latest.notes).toContain('Notes');
      expect(r.latest.url).toMatch(/^https:\/\/github\.com\/dlxarl\/Trace\/releases\//);
    }
  });

  it('reports up to date when installed is the latest or newer', async () => {
    expect((await checkForUpdates('0.2.0-alpha.1', { fetchImpl: fetchOk([release('v0.2.0-alpha.1')]) })).status).toBe('up-to-date');
    expect((await checkForUpdates('0.2.0-alpha.1', { fetchImpl: fetchOk([release('v0.1.0-alpha.2')]) })).status).toBe('up-to-date');
  });

  it('handles network failure', async () => {
    const r = await checkForUpdates('0.2.0-alpha.1', { fetchImpl: async () => { throw new TypeError('Failed to fetch'); } });
    expect(r).toMatchObject({ status: 'error', reason: 'network' });
  });

  it('handles rate limiting', async () => {
    const r = await checkForUpdates('0.2.0-alpha.1', {
      fetchImpl: async () => jsonResponse({ message: 'API rate limit exceeded' }, 403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1900000000' }),
    });
    expect(r).toMatchObject({ status: 'error', reason: 'rate-limited' });
    const r429 = await checkForUpdates('0.2.0-alpha.1', { fetchImpl: async () => jsonResponse({}, 429) });
    expect(r429).toMatchObject({ status: 'error', reason: 'rate-limited' });
  });

  it('handles missing releases and HTTP errors', async () => {
    expect(await checkForUpdates('0.2.0-alpha.1', { fetchImpl: fetchOk([]) })).toMatchObject({ status: 'error', reason: 'no-releases' });
    expect(await checkForUpdates('0.2.0-alpha.1', { fetchImpl: async () => jsonResponse({}, 404) })).toMatchObject({ status: 'error', reason: 'no-releases' });
    expect(await checkForUpdates('0.2.0-alpha.1', { fetchImpl: async () => jsonResponse({}, 500) })).toMatchObject({ status: 'error', reason: 'http' });
  });

  it('handles malformed responses', async () => {
    expect(await checkForUpdates('0.2.0-alpha.1', { fetchImpl: fetchOk({ not: 'an array' }) })).toMatchObject({ status: 'error', reason: 'malformed' });
    const notJson = async () => new Response('<html>', { status: 200 });
    expect(await checkForUpdates('0.2.0-alpha.1', { fetchImpl: notJson })).toMatchObject({ status: 'error', reason: 'malformed' });
  });

  it('rejects an invalid installed version without fetching', async () => {
    let called = false;
    const r = await checkForUpdates('dev', { fetchImpl: async () => { called = true; return jsonResponse([]); } });
    expect(r).toMatchObject({ status: 'error', reason: 'invalid-installed-version' });
    expect(called).toBe(false);
  });
});
