import { describe, expect, it } from 'vitest';
import { findSpatialCandidate, type NavCandidate } from '../features/graph/spatialNavigation';

function rect(left: number, top: number, width: number, height: number): NavCandidate['rect'] {
  return { left, top, right: left + width, bottom: top + height };
}

describe('findSpatialCandidate', () => {
  it('picks the nearest candidate in the pressed direction when it overlaps perpendicularly', () => {
    const current: NavCandidate = { id: 'a', rect: rect(0, 0, 20, 20) };
    const candidates: NavCandidate[] = [
      current,
      { id: 'near', rect: rect(40, 5, 20, 20) },
      { id: 'far', rect: rect(100, 5, 20, 20) },
    ];
    expect(findSpatialCandidate(current, candidates, 'right')).toBe('near');
  });

  it('prefers a perpendicular-overlapping candidate over a closer non-overlapping one', () => {
    const current: NavCandidate = { id: 'a', rect: rect(0, 0, 20, 20) };
    const candidates: NavCandidate[] = [
      current,
      // Closer on the nav axis but far off the perpendicular axis (no row overlap).
      { id: 'closer-offaxis', rect: rect(25, 500, 20, 20) },
      // Further on the nav axis but shares the current element's row.
      { id: 'aligned', rect: rect(60, 5, 20, 20) },
    ];
    expect(findSpatialCandidate(current, candidates, 'right')).toBe('aligned');
  });

  it('falls back to gap + weighted perpendicular offset when nothing overlaps', () => {
    const current: NavCandidate = { id: 'a', rect: rect(0, 0, 20, 20) };
    const candidates: NavCandidate[] = [
      current,
      // Nearly aligned, modest gap.
      { id: 'aligned-far-gap', rect: rect(200, 15, 20, 20) },
      // Much closer gap but far off-row; should still win if the weight doesn't overwhelm the gap savings.
      { id: 'skewed-near-gap', rect: rect(30, 400, 20, 20) },
    ];
    // gap+2*perp for skewed: 10 + 2*390=790; for aligned-far-gap: 180+2*5=190 -> aligned wins.
    expect(findSpatialCandidate(current, candidates, 'right')).toBe('aligned-far-gap');
  });

  it('returns null when nothing qualifies in the pressed direction, so native scroll is preserved', () => {
    const current: NavCandidate = { id: 'a', rect: rect(100, 100, 20, 20) };
    const candidates: NavCandidate[] = [current, { id: 'behind', rect: rect(0, 0, 20, 20) }];
    expect(findSpatialCandidate(current, candidates, 'right')).toBeNull();
  });

  it('never returns the current element itself', () => {
    const current: NavCandidate = { id: 'a', rect: rect(0, 0, 20, 20) };
    expect(findSpatialCandidate(current, [current], 'down')).toBeNull();
  });

  it('uses edge-based comparison, not centre comparison, for the direction test', () => {
    // A large candidate whose centre is to the left of current, but whose right edge still
    // reaches past current's left edge, must not count as a valid "left" target: its edge is
    // on the wrong side relative to current's edge.
    const current: NavCandidate = { id: 'a', rect: rect(100, 0, 20, 20) };
    const overlapping: NavCandidate = { id: 'wide', rect: rect(0, 0, 150, 20) }; // right edge = 150 > current.left (100)
    expect(findSpatialCandidate(current, [current, overlapping], 'left')).toBeNull();
  });
});
