/**
 * Validates whether a URL is safe to open or render as a link in the UI.
 * Prevents execution of dangerous protocols like javascript:, data:, file:, etc.
 */
export function isSafeUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed || Array.from(trimmed).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return false;
  if (trimmed.startsWith('#')) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'mailto:';
  } catch {
    return false;
  }
}

/**
 * Safely extracts the pathname from a URL or returns the input string if invalid.
 */
export function safeUrlPathname(url?: string | null): string {
  if (!url || typeof url !== 'string') return '';
  try {
    const parsed = new URL(url);
    return parsed.pathname || url;
  } catch {
    return url;
  }
}
