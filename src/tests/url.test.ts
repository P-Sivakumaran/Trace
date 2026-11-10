import { describe, it, expect } from 'vitest';
import { isSafeUrl, safeUrlPathname } from '../utils/url';

describe('URL Security & Utilities', () => {
  it('identifies safe http and https URLs', () => {
    expect(isSafeUrl('http://example.com')).toBe(true);
    expect(isSafeUrl('https://example.com/api/test?query=1')).toBe(true);
    expect(isSafeUrl('mailto:investigator@trace.internal')).toBe(true);
    expect(isSafeUrl('#wikilink:123')).toBe(true);
  });

  it('rejects dangerous protocols (XSS and local files)', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('JAVASCRIPT:alert(1)')).toBe(false);
    expect(isSafeUrl('  javascript:void(0)')).toBe(false);
    expect(isSafeUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isSafeUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeUrl('vbscript:msgbox(1)')).toBe(false);
    expect(isSafeUrl(null)).toBe(false);
    expect(isSafeUrl('')).toBe(false);
  });

  it('extracts path safely even with malformed or relative URLs', () => {
    expect(safeUrlPathname('https://api.github.com/users/octocat')).toBe('/users/octocat');
    expect(safeUrlPathname('/api/local/endpoint')).toBe('/api/local/endpoint');
    expect(safeUrlPathname('invalid-url-string')).toBe('invalid-url-string');
    expect(safeUrlPathname('')).toBe('');
  });

  it('rejects malformed addresses and embedded control characters', () => {
    for (const value of ['http://', 'https://[invalid', 'https://exa mple.com', 'https://example.com/\nfile', 'java\tscript:alert(1)']) {
      expect(isSafeUrl(value), value).toBe(false);
    }
    expect(isSafeUrl(' HTTPS://example.com ')).toBe(true);
  });
});
