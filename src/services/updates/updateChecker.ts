/**
 * Check for Updates — compares the installed version against the official
 * GitHub Releases of dlxarl/Trace. Read-only: it never downloads anything;
 * the UI only offers a link to the release page.
 */
import { compareSemver, parseSemver } from './semver';

export const RELEASES_REPO = 'dlxarl/Trace';
export const RELEASES_API_URL = `https://api.github.com/repos/${RELEASES_REPO}/releases?per_page=30`;
export const RELEASES_PAGE_URL = `https://github.com/${RELEASES_REPO}/releases`;

export interface ReleaseInfo {
  version: string; // normalised, without leading "v"
  tag: string;
  name: string;
  url: string; // release page (html_url)
  notes: string; // markdown body
  publishedAt: string;
  prerelease: boolean;
}

export type UpdateCheckResult =
  | { status: 'update-available'; installed: string; latest: ReleaseInfo }
  | { status: 'up-to-date'; installed: string; latest: ReleaseInfo | null }
  | { status: 'error'; installed: string; reason: 'network' | 'rate-limited' | 'no-releases' | 'malformed' | 'http' | 'invalid-installed-version'; message: string };

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** Only github.com release pages may be offered as links. */
function safeReleaseUrl(raw: unknown, tag: string): string {
  if (typeof raw === 'string') {
    try {
      const u = new URL(raw);
      if (u.protocol === 'https:' && u.hostname === 'github.com' && u.pathname.startsWith(`/${RELEASES_REPO}/releases`)) return u.toString();
    } catch {
      /* fall through */
    }
  }
  return `${RELEASES_PAGE_URL}/tag/${encodeURIComponent(tag)}`;
}

/**
 * Picks the highest-precedence published (non-draft) release. Prereleases are
 * included on purpose: TRACE ships alpha builds, and a newer alpha is an update.
 */
export function pickLatestRelease(payload: unknown): ReleaseInfo | null {
  if (!Array.isArray(payload)) throw new Error('Expected an array of releases');
  let best: ReleaseInfo | null = null;
  for (const r of payload) {
    if (!r || typeof r !== 'object') continue;
    const rel = r as Record<string, unknown>;
    if (rel.draft === true) continue;
    const tag = typeof rel.tag_name === 'string' ? rel.tag_name : '';
    const parsed = parseSemver(tag);
    if (!parsed) continue; // non-semver tags are ignored, not fatal
    const version = tag.replace(/^v/, '');
    const info: ReleaseInfo = {
      version,
      tag,
      name: typeof rel.name === 'string' && rel.name ? rel.name : tag,
      url: safeReleaseUrl(rel.html_url, tag),
      notes: typeof rel.body === 'string' ? rel.body : '',
      publishedAt: typeof rel.published_at === 'string' ? rel.published_at : '',
      prerelease: rel.prerelease === true || parsed.prerelease.length > 0,
    };
    if (!best || compareSemver(version, best.version) > 0) best = info;
  }
  return best;
}

export async function checkForUpdates(
  installedVersion: string,
  opts: { fetchImpl?: FetchLike; signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<UpdateCheckResult> {
  const installed = installedVersion.replace(/^v/, '');
  if (!parseSemver(installed)) {
    return { status: 'error', installed, reason: 'invalid-installed-version', message: `Installed version "${installedVersion}" is not a valid semantic version.` };
  }
  const fetchImpl: FetchLike = opts.fetchImpl ?? ((u, i) => fetch(u, i));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 10000);
  opts.signal?.addEventListener('abort', () => controller.abort());

  let res: Response;
  try {
    res = await fetchImpl(RELEASES_API_URL, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller.signal,
    });
  } catch (err: any) {
    clearTimeout(timer);
    const aborted = err?.name === 'AbortError';
    return { status: 'error', installed, reason: 'network', message: aborted ? 'The request to GitHub timed out.' : 'Could not reach GitHub. Check your internet connection.' };
  }
  clearTimeout(timer);

  if (res.status === 403 || res.status === 429) {
    const remaining = res.headers.get('x-ratelimit-remaining');
    const reset = Number(res.headers.get('x-ratelimit-reset'));
    if (res.status === 429 || remaining === '0') {
      const when = Number.isFinite(reset) && reset > 0 ? ` Try again after ${new Date(reset * 1000).toLocaleTimeString()}.` : ' Try again later.';
      return { status: 'error', installed, reason: 'rate-limited', message: `GitHub API rate limit reached.${when}` };
    }
  }
  if (res.status === 404) {
    return { status: 'error', installed, reason: 'no-releases', message: 'No releases were found for this repository.' };
  }
  if (!res.ok) {
    return { status: 'error', installed, reason: 'http', message: `GitHub responded with HTTP ${res.status}.` };
  }

  let latest: ReleaseInfo | null;
  try {
    latest = pickLatestRelease(await res.json());
  } catch {
    return { status: 'error', installed, reason: 'malformed', message: 'GitHub returned an unexpected response.' };
  }
  if (!latest) {
    return { status: 'error', installed, reason: 'no-releases', message: 'No published releases with a valid version were found.' };
  }
  if (compareSemver(latest.version, installed) > 0) {
    return { status: 'update-available', installed, latest };
  }
  return { status: 'up-to-date', installed, latest };
}
