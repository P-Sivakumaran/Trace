export interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface NavCandidate {
  id: string;
  rect: Rect;
}

export type Direction = 'up' | 'down' | 'left' | 'right';

const DEFAULT_TOLERANCE = 1;
/** Larger favours candidates more closely aligned on the perpendicular axis; the guide's starting point. */
const FALLBACK_WEIGHT = 2;

function centerX(r: Rect): number {
  return (r.left + r.right) / 2;
}

function centerY(r: Rect): number {
  return (r.top + r.bottom) / 2;
}

function inDirection(current: Rect, candidate: Rect, direction: Direction, tolerance: number): boolean {
  switch (direction) {
    case 'right':
      return candidate.left >= current.right - tolerance;
    case 'left':
      return candidate.right <= current.left + tolerance;
    case 'down':
      return candidate.top >= current.bottom - tolerance;
    case 'up':
      return candidate.bottom <= current.top + tolerance;
  }
}

function perpendicularOverlap(current: Rect, candidate: Rect, direction: Direction): boolean {
  if (direction === 'left' || direction === 'right') {
    return candidate.top < current.bottom && candidate.bottom > current.top;
  }
  return candidate.left < current.right && candidate.right > current.left;
}

function gap(current: Rect, candidate: Rect, direction: Direction): number {
  switch (direction) {
    case 'right':
      return candidate.left - current.right;
    case 'left':
      return current.left - candidate.right;
    case 'down':
      return candidate.top - current.bottom;
    case 'up':
      return current.top - candidate.bottom;
  }
}

function perpendicularCenterOffset(current: Rect, candidate: Rect, direction: Direction): number {
  if (direction === 'left' || direction === 'right') {
    return Math.abs(centerY(candidate) - centerY(current));
  }
  return Math.abs(centerX(candidate) - centerX(current));
}

/**
 * Picks the next focus candidate in `direction` from `current`'s live geometry, following
 * the modern-web-guidance spatial-navigation pattern: an edge-based direction test (never a
 * centre comparison), a preference for candidates that overlap on the perpendicular axis, and
 * a `gap + weight * perpendicularCentreOffset` fallback when nothing overlaps. Positions must
 * come from live geometry the caller just measured (e.g. `renderedBoundingBox()`); this function
 * does no measuring or caching itself.
 *
 * Returns null when nothing qualifies in that direction. The caller must then skip
 * preventDefault() so the browser can still scroll natively.
 */
export function findSpatialCandidate(
  current: NavCandidate,
  candidates: NavCandidate[],
  direction: Direction,
  tolerance = DEFAULT_TOLERANCE
): string | null {
  const inRange = candidates.filter(
    (candidate) => candidate.id !== current.id && inDirection(current.rect, candidate.rect, direction, tolerance)
  );
  if (inRange.length === 0) return null;

  const overlapping = inRange.filter((candidate) => perpendicularOverlap(current.rect, candidate.rect, direction));
  const useOverlap = overlapping.length > 0;
  const pool = useOverlap ? overlapping : inRange;

  const score = (candidate: NavCandidate): number => {
    const g = gap(current.rect, candidate.rect, direction);
    const p = perpendicularCenterOffset(current.rect, candidate.rect, direction);
    // Among overlapping candidates, gap must dominate; perpendicular offset only breaks ties.
    return useOverlap ? g * 1_000_000 + p : g + FALLBACK_WEIGHT * p;
  };

  let best = pool[0];
  let bestScore = score(best);
  for (const candidate of pool.slice(1)) {
    const candidateScore = score(candidate);
    if (candidateScore < bestScore) {
      best = candidate;
      bestScore = candidateScore;
    }
  }
  return best.id;
}
