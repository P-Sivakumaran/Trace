import { describe, it, expect } from 'vitest';
import { computeForceLayout, selectVisibleLabels, type LayoutEdge, type LayoutNode } from '@/features/graph/forceLayout';

function clusteredGraph(clusters: number, perCluster: number, bridges: number) {
  const nodes: LayoutNode[] = [];
  const edges: LayoutEdge[] = [];
  const clusterOf: Record<string, number> = {};
  let r = 7;
  const rand = () => ((r = (r * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let c = 0; c < clusters; c++) {
    const hub = `c${c}-hub`;
    nodes.push({ id: hub, size: 10 });
    clusterOf[hub] = c;
    for (let i = 0; i < perCluster; i++) {
      const id = `c${c}-${i}`;
      nodes.push({ id, size: 5 });
      clusterOf[id] = c;
      edges.push({ source: hub, target: id });
      if (i > 0 && rand() < 0.3) edges.push({ source: id, target: `c${c}-${Math.floor(rand() * i)}` });
    }
  }
  for (let b = 0; b < bridges; b++) {
    const a = Math.floor(rand() * clusters);
    const z = (a + 1 + Math.floor(rand() * (clusters - 1))) % clusters;
    edges.push({ source: `c${a}-${Math.floor(rand() * perCluster)}`, target: `c${z}-${Math.floor(rand() * perCluster)}` });
  }
  return { nodes, edges, clusterOf };
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe('computeForceLayout', () => {
  it('lays out a small graph without overlaps and deterministically', () => {
    const { nodes, edges } = clusteredGraph(2, 6, 1);
    const p1 = computeForceLayout(nodes, edges);
    const p2 = computeForceLayout(nodes, edges);
    expect(p1).toEqual(p2);
    const ids = Object.keys(p1);
    expect(ids.length).toBe(nodes.length);
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const a = nodes.find((n) => n.id === ids[i])!;
        const b = nodes.find((n) => n.id === ids[j])!;
        expect(dist(p1[ids[i]], p1[ids[j]])).toBeGreaterThan((a.size! + b.size!) * 0.9);
      }
  });

  it('keeps clusters together on a large graph and stays fast', () => {
    const { nodes, edges, clusterOf } = clusteredGraph(12, 120, 40); // ~1450 nodes
    const t0 = performance.now();
    const pos = computeForceLayout(nodes, edges);
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(4000);

    // mean intra-cluster distance to hub should be well below inter-hub distance
    let intra = 0, k = 0;
    nodes.forEach((n) => {
      if (n.id.endsWith('hub')) return;
      intra += dist(pos[n.id], pos[`c${clusterOf[n.id]}-hub`]);
      k++;
    });
    intra /= k;
    let inter = 0, kk = 0;
    for (let a = 0; a < 12; a++)
      for (let b = a + 1; b < 12; b++) {
        inter += dist(pos[`c${a}-hub`], pos[`c${b}-hub`]);
        kk++;
      }
    inter /= kk;
    expect(intra * 1.5).toBeLessThan(inter);

    // no collapse into a ball, no explosion
    const xs = Object.values(pos).map((p) => p.x);
    const span = Math.max(...xs) - Math.min(...xs);
    expect(span).toBeGreaterThan(300);
    expect(span).toBeLessThan(200000);
  });

  it('does not move pinned nodes and places new nodes near their neighbours', () => {
    const { nodes, edges } = clusteredGraph(3, 10, 2);
    const base = computeForceLayout(nodes, edges);
    const pinned: LayoutNode[] = nodes.map((n) => ({ ...n, ...base[n.id], fixed: true }));
    pinned.push({ id: 'new', size: 5 });
    const e2 = [...edges, { source: 'c1-hub', target: 'new' }];
    const pos = computeForceLayout(pinned, e2);
    nodes.forEach((n) => expect(pos[n.id]).toEqual(base[n.id]));
    expect(dist(pos.new, pos['c1-hub'])).toBeLessThan(dist(pos.new, pos['c0-hub']));
  });
});

describe('selectVisibleLabels', () => {
  it('reveals more labels as zoom increases and always keeps forced ones', () => {
    const cands = Array.from({ length: 200 }, (_, i) => ({
      id: `n${i}`,
      x: (i % 20) * 50,
      y: Math.floor(i / 20) * 40,
      r: 4,
      label: `entity-${i}`,
      priority: i % 7,
      forced: i === 199,
    }));
    const low = selectVisibleLabels(cands, { zoom: 0.3, fontPx: 6, viewW: 1000, viewH: 400 });
    const high = selectVisibleLabels(cands, { zoom: 2, fontPx: 9, viewW: 1000, viewH: 400 });
    expect(low.has('n199')).toBe(true);
    expect(high.size).toBeGreaterThan(low.size);
  });
});
