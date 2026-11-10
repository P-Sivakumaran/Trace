import { useCallback, useEffect, useState } from 'react';
import { cacheNotes, fetchReleaseNotes, readCachedNotes, type ReleaseInfo, type ReleaseNotesResult } from './updateChecker';

export type ReleaseNotesState =
  | { status: 'loading'; cached: ReleaseInfo | null }
  | { status: 'ok'; release: ReleaseInfo }
  | { status: 'not-found' }
  | { status: 'error'; message: string; cached: ReleaseInfo | null };

/**
 * Changelog (GitHub release notes) of one version. Shows the last cached copy
 * immediately and refreshes it in the background; works offline from cache.
 */
export function useReleaseNotes(version: string, enabled = true): { state: ReleaseNotesState; reload: () => void } {
  const [state, setState] = useState<ReleaseNotesState>(() => ({ status: 'loading', cached: readCachedNotes(version) }));
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const cached = readCachedNotes(version);
    setState({ status: 'loading', cached });
    fetchReleaseNotes(version).then((r: ReleaseNotesResult) => {
      if (!alive) return;
      if (r.status === 'ok') {
        cacheNotes(r.release);
        setState({ status: 'ok', release: r.release });
      } else if (r.status === 'not-found') {
        setState({ status: 'not-found' });
      } else if (cached) {
        setState({ status: 'ok', release: cached }); // offline: keep the last copy
      } else {
        setState({ status: 'error', message: r.message, cached: null });
      }
    });
    return () => {
      alive = false;
    };
  }, [version, enabled, nonce]);

  return { state, reload: useCallback(() => setNonce((n) => n + 1), []) };
}
