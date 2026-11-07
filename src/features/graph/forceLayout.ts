/**
 * ForceAtlas2-style force-directed layout with Barnes–Hut approximation.
 *
 * Pure, dependency-free and synchronous so it can run on the main thread
 * for graphs with a few thousand nodes (O(n log n) per iteration).
 *
 * Properties tuned for investigation graphs:
 *  - degree-weighted repulsion (hubs push harder → become cluster centers)
 *  - linear attraction along edges, optionally lin-log for tighter clusters
 *  - "strong gravity" toward the barycenter so disconnected components and
 *    leaves stay around the main network instead of drifting away
 *  - adaptive per-node speed (swing / traction) for stable convergence
 *  - final overlap-prevention pass using node radii
 *  - pinned nodes keep their position (manual placement / incremental adds)
 */

export interface LayoutNode {
  id: string;
  x?: number;
  y?: number;
  /** Visual radius in model units, used for overlap prevention. */
  size?: number;
  /** When true the node is not moved, but still exerts forces. */
  fixed?: boolean;
}

export interface LayoutEdge {
  source: string;
  target: string;
  weight?: number;
}

export interface ForceLayoutOptions {
  iterations?: number;
  /** Repulsion coefficient (kr). */
  scalingRatio?: number;
  gravity?: number;
  /** Barnes–Hut accuracy; larger = faster, less accurate. */
  theta?: number;
  linLog?: boolean;
  /** Seed for deterministic initial placement. */
  seed?: number;
  /** Extra spacing between node borders in the overlap pass. */
  padding?: number;
}

export type Positions = Record<string, { x: number; y: number }>;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Iteration budget that keeps large graphs interactive. */
export function defaultIterations(n: number): number {
  if (n <= 50) return 700;
  if (n <= 200) return 500;
  if (n <= 800) return 300;
  if (n <= 2000) return 180;
  return 120;
}

// ---------------------------------------------------------------------------
// Barnes–Hut quadtree stored in flat typed arrays (no per-iteration allocs
// beyond a reusable pool).
// ---------------------------------------------------------------------------
class QuadTree {
  // per-cell data
  cx: Float64Array; // center of mass x * mass (accumulated) → normalized after build
  cy: Float64Array;
  mass: Float64Array;
  size: Float64Array; // cell width
  minX: Float64Array;
  minY: Float64Array;
  child: Int32Array; // first child index (4 consecutive), -1 = leaf
  body: Int32Array; // node index if leaf with single body, -1 empty, -2 internal
  count = 0;
  cap: number;

  constructor(cap: number) {
    this.cap = cap;
    this.cx = new Float64Array(cap);
    this.cy = new Float64Array(cap);
    this.mass = new Float64Array(cap);
    this.size = new Float64Array(cap);
    this.minX = new Float64Array(cap);
    this.minY = new Float64Array(cap);
    this.child = new Int32Array(cap);
    this.body = new Int32Array(cap);
  }

  private grow() {
    const nc = this.cap * 2;
    const g = <T extends Float64Array | Int32Array>(a: T): T => {
      const b = new (a.constructor as any)(nc) as T;
      b.set(a);
      return b;
    };
    this.cx = g(this.cx);
    this.cy = g(this.cy);
    this.mass = g(this.mass);
    this.size = g(this.size);
    this.minX = g(this.minX);
    this.minY = g(this.minY);
    this.child = g(this.child);
    this.body = g(this.body);
    this.cap = nc;
  }

  private alloc(minX: number, minY: number, size: number): number {
    if (this.count >= this.cap) this.grow();
    const i = this.count++;
    this.cx[i] = 0;
    this.cy[i] = 0;
    this.mass[i] = 0;
    this.size[i] = size;
    this.minX[i] = minX;
    this.minY[i] = minY;
    this.child[i] = -1;
    this.body[i] = -1;
    return i;
  }

  build(xs: Float64Array, ys: Float64Array, ms: Float64Array) {
    const n = xs.length;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < n; i++) {
      if (xs[i] < x0) x0 = xs[i];
      if (ys[i] < y0) y0 = ys[i];
      if (xs[i] > x1) x1 = xs[i];
      if (ys[i] > y1) y1 = ys[i];
    }
    const size = Math.max(x1 - x0, y1 - y0, 1) * 1.0001;
    this.count = 0;
    this.alloc(x0, y0, size);
    for (let i = 0; i < n; i++) this.insert(0, i, xs, ys, ms, 0);
    // normalize centers of mass
    for (let c = 0; c < this.count; c++) {
      const m = this.mass[c];
      if (m > 0) {
        this.cx[c] /= m;
        this.cy[c] /= m;
      }
    }
  }

  private quadrant(cell: number, x: number, y: number): number {
    const half = this.size[cell] / 2;
    const qx = x >= this.minX[cell] + half ? 1 : 0;
    const qy = y >= this.minY[cell] + half ? 1 : 0;
    return qy * 2 + qx;
  }

  private subdivide(cell: number) {
    const half = this.size[cell] / 2;
    const mx = this.minX[cell];
    const my = this.minY[cell];
    const first = this.alloc(mx, my, half);
    this.alloc(mx + half, my, half);
    this.alloc(mx, my + half, half);
    this.alloc(mx + half, my + half, half);
    this.child[cell] = first;
  }

  private insert(
    cell: number,
    i: number,
    xs: Float64Array,
    ys: Float64Array,
    ms: Float64Array,
    depth: number
  ) {
    // iterative descent
    for (;;) {
      const m = ms[i];
      this.mass[cell] += m;
      this.cx[cell] += xs[i] * m;
      this.cy[cell] += ys[i] * m;

      if (this.child[cell] === -1) {
        if (this.body[cell] === -1) {
          this.body[cell] = i;
          return;
        }
        // occupied leaf: split (guard against coincident points)
        if (depth > 40) return;
        const existing = this.body[cell];
        this.body[cell] = -2;
        this.subdivide(cell);
        const q = this.child[cell] + this.quadrant(cell, xs[existing], ys[existing]);
        const em = ms[existing];
        this.mass[q] += em;
        this.cx[q] += xs[existing] * em;
        this.cy[q] += ys[existing] * em;
        this.body[q] = existing;
      }
      cell = this.child[cell] + this.quadrant(cell, xs[i], ys[i]);
      depth++;
    }
  }

  /** Accumulate repulsion on node i into fx/fy. */
  applyRepulsion(
    i: number,
    xs: Float64Array,
    ys: Float64Array,
    ms: Float64Array,
    kr: number,
    theta2: number,
    fx: Float64Array,
    fy: Float64Array,
    stack: Int32Array
  ) {
    const xi = xs[i];
    const yi = ys[i];
    const mi = ms[i];
    let sp = 0;
    stack[sp++] = 0;
    while (sp > 0) {
      const c = stack[--sp];
      const m = this.mass[c];
      if (m === 0) continue;
      if (this.child[c] === -1 && this.body[c] === i) continue;
      const dx = xi - this.cx[c];
      const dy = yi - this.cy[c];
      let d2 = dx * dx + dy * dy;
      const s = this.size[c];
      if (this.child[c] === -1 || (s * s) / (d2 || 1e-9) < theta2) {
        if (d2 < 0.01) d2 = 0.01;
        // FA2 repulsion: kr * mi * mj / d  → divided by d again for the unit vector
        const f = (kr * mi * m) / d2;
        fx[i] += dx * f;
        fy[i] += dy * f;
      } else {
        const ch = this.child[c];
        stack[sp++] = ch;
        stack[sp++] = ch + 1;
        stack[sp++] = ch + 2;
        stack[sp++] = ch + 3;
      }
    }
  }
}

/**
 * Seed positions: keep known positions, place unplaced nodes next to their
 * already-placed neighbours (so incremental additions appear near context),
 * otherwise scatter them on a disc proportional to graph size.
 */
function seedPositions(
  nodes: LayoutNode[],
  adj: number[][],
  rand: () => number
): { xs: Float64Array; ys: Float64Array; placed: Uint8Array } {
  const n = nodes.length;
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  const placed = new Uint8Array(n);
  const radius = Math.sqrt(n) * 40 + 50;

  let anyPlaced = false;
  for (let i = 0; i < n; i++) {
    const nd = nodes[i];
    if (typeof nd.x === 'number' && typeof nd.y === 'number' && isFinite(nd.x) && isFinite(nd.y)) {
      xs[i] = nd.x;
      ys[i] = nd.y;
      placed[i] = 1;
      anyPlaced = true;
    }
  }

  // BFS-ish: repeatedly place nodes with placed neighbours
  if (anyPlaced) {
    let progress = true;
    while (progress) {
      progress = false;
      for (let i = 0; i < n; i++) {
        if (placed[i]) continue;
        let sx = 0, sy = 0, k = 0;
        for (const j of adj[i]) {
          if (placed[j] === 1 || placed[j] === 2) {
            sx += xs[j];
            sy += ys[j];
            k++;
          }
        }
        if (k > 0) {
          const a = rand() * Math.PI * 2;
          const r = 30 + rand() * 30;
          xs[i] = sx / k + Math.cos(a) * r;
          ys[i] = sy / k + Math.sin(a) * r;
          placed[i] = 2;
          progress = true;
        }
      }
    }
  }

  for (let i = 0; i < n; i++) {
    if (placed[i]) continue;
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * radius;
    xs[i] = Math.cos(a) * r;
    ys[i] = Math.sin(a) * r;
  }
  return { xs, ys, placed };
}

export function computeForceLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  opts: ForceLayoutOptions = {}
): Positions {
  const n = nodes.length;
  const out: Positions = {};
  if (n === 0) return out;
  if (n === 1) {
    out[nodes[0].id] = { x: nodes[0].x ?? 0, y: nodes[0].y ?? 0 };
    return out;
  }

  const index = new Map<string, number>();
  nodes.forEach((nd, i) => index.set(nd.id, i));

  const es: number[] = [];
  const ew: number[] = [];
  const adj: number[][] = Array.from({ length: n }, () => []);
  const deg = new Float64Array(n);
  const seen = new Set<string>();
  for (const e of edges) {
    const s = index.get(e.source);
    const t = index.get(e.target);
    if (s === undefined || t === undefined || s === t) continue;
    const key = s < t ? `${s}|${t}` : `${t}|${s}`;
    if (seen.has(key)) continue; // collapse multi-edges for layout purposes
    seen.add(key);
    es.push(s, t);
    ew.push(e.weight ?? 1);
    adj[s].push(t);
    adj[t].push(s);
    deg[s]++;
    deg[t]++;
  }
  const m = ew.length;

  const seed = opts.seed ?? hashString(nodes.map((x) => x.id).join('|').slice(0, 2048));
  const rand = mulberry32(seed);
  const { xs, ys } = seedPositions(nodes, adj, rand);

  const fixed = new Uint8Array(n);
  const sizes = new Float64Array(n);
  const mass = new Float64Array(n);
  let allFixed = true;
  for (let i = 0; i < n; i++) {
    fixed[i] = nodes[i].fixed ? 1 : 0;
    if (!fixed[i]) allFixed = false;
    sizes[i] = nodes[i].size ?? 6;
    mass[i] = 1 + Math.pow(deg[i], 0.8);
  }
  if (allFixed) {
    for (let i = 0; i < n; i++) out[nodes[i].id] = { x: xs[i], y: ys[i] };
    return out;
  }

  const iterations = opts.iterations ?? defaultIterations(n);
  // Larger graphs get relatively stronger repulsion so dense regions breathe.
  const kr = opts.scalingRatio ?? 10;
  const kg = opts.gravity ?? 1.5;
  const theta = opts.theta ?? 1.0;
  const theta2 = theta * theta;
  const linLog = opts.linLog ?? false;
  const padding = opts.padding ?? 4;

  const fx = new Float64Array(n);
  const fy = new Float64Array(n);
  const pfx = new Float64Array(n);
  const pfy = new Float64Array(n);
  const tree = new QuadTree(Math.max(64, n * 4));
  const stack = new Int32Array(Math.max(256, n * 8));

  let speed = 1;
  let speedEfficiency = 1;
  const jitterTolerance = n > 5000 ? 10 : n > 500 ? 1.5 : 1;

  for (let iter = 0; iter < iterations; iter++) {
    pfx.set(fx);
    pfy.set(fy);
    fx.fill(0);
    fy.fill(0);

    // --- repulsion (Barnes–Hut) ---
    tree.build(xs, ys, mass);
    for (let i = 0; i < n; i++) {
      tree.applyRepulsion(i, xs, ys, mass, kr, theta2, fx, fy, stack);
    }

    // --- gravity (strong gravity: proportional to distance) ---
    let gx = 0, gy = 0;
    for (let i = 0; i < n; i++) {
      gx += xs[i];
      gy += ys[i];
    }
    gx /= n;
    gy /= n;
    for (let i = 0; i < n; i++) {
      const dx = xs[i] - gx;
      const dy = ys[i] - gy;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      // Mix of FA2 regular gravity (constant) and strong gravity (linear)
      // – keeps peripheral components close without collapsing the core.
      const f = kg * mass[i] * (1 + d / 120) / d;
      fx[i] -= dx * f;
      fy[i] -= dy * f;
    }

    // --- attraction along edges ---
    for (let k = 0; k < m; k++) {
      const s = es[2 * k];
      const t = es[2 * k + 1];
      const dx = xs[s] - xs[t];
      const dy = ys[s] - ys[t];
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d === 0) continue;
      const w = ew[k];
      // "dissuade hubs": divide by source mass so hubs sit in the middle of
      // their satellites rather than being pulled outward.
      let f: number;
      if (linLog) {
        f = (w * Math.log(1 + d)) / d;
      } else {
        f = w;
      }
      const fs = f;
      const ft = f;
      fx[s] -= dx * fs;
      fy[s] -= dy * fs;
      fx[t] += dx * ft;
      fy[t] += dy * ft;
    }

    // --- adaptive speed (FA2 swing/traction) ---
    let swing = 0, traction = 0;
    for (let i = 0; i < n; i++) {
      if (fixed[i]) continue;
      const sx = fx[i] - pfx[i];
      const sy = fy[i] - pfy[i];
      const tx = fx[i] + pfx[i];
      const ty = fy[i] + pfy[i];
      swing += mass[i] * Math.sqrt(sx * sx + sy * sy);
      traction += 0.5 * mass[i] * Math.sqrt(tx * tx + ty * ty);
    }
    const estimatedJitter = 0.05 * Math.sqrt(n);
    const minJ = Math.sqrt(estimatedJitter);
    const maxJ = 10;
    let jt = jitterTolerance * Math.max(minJ, Math.min(maxJ, (estimatedJitter * traction) / (n * n)));
    const minSpeedEfficiency = 0.05;
    if (traction && swing / traction > 2.0) {
      if (speedEfficiency > minSpeedEfficiency) speedEfficiency *= 0.5;
      jt = Math.max(jt, jitterTolerance);
    }
    const targetSpeed = swing === 0 ? speed * 2 : (jt * speedEfficiency * traction) / swing;
    if (swing > jt * traction) {
      if (speedEfficiency > minSpeedEfficiency) speedEfficiency *= 0.7;
    } else if (speed < 1000) {
      speedEfficiency *= 1.3;
    }
    const maxRise = 0.5;
    speed = speed + Math.min(targetSpeed - speed, maxRise * speed);

    // cooling in the last 30% of iterations for a settled result
    const cool = iter > iterations * 0.7 ? 1 - (iter - iterations * 0.7) / (iterations * 0.3) * 0.8 : 1;

    for (let i = 0; i < n; i++) {
      if (fixed[i]) continue;
      const sx = fx[i] - pfx[i];
      const sy = fy[i] - pfy[i];
      const nodeSwing = mass[i] * Math.sqrt(sx * sx + sy * sy);
      let factor = speed / (1 + Math.sqrt(speed * nodeSwing));
      const fl = Math.sqrt(fx[i] * fx[i] + fy[i] * fy[i]);
      // cap displacement per step
      const maxStep = 40;
      if (fl * factor > maxStep) factor = maxStep / fl;
      xs[i] += fx[i] * factor * cool;
      ys[i] += fy[i] * factor * cool;
    }
  }

  resolveOverlaps(xs, ys, sizes, fixed, padding, n > 1500 ? 3 : 6);

  for (let i = 0; i < n; i++) out[nodes[i].id] = { x: xs[i], y: ys[i] };
  return out;
}

/** Grid-hashed pairwise push-apart so circles never overlap. */
function resolveOverlaps(
  xs: Float64Array,
  ys: Float64Array,
  r: Float64Array,
  fixed: Uint8Array,
  padding: number,
  passes: number
) {
  const n = xs.length;
  let maxR = 0;
  for (let i = 0; i < n; i++) if (r[i] > maxR) maxR = r[i];
  const cell = (maxR + padding) * 2;
  for (let p = 0; p < passes; p++) {
    const grid = new Map<string, number[]>();
    for (let i = 0; i < n; i++) {
      const key = `${Math.floor(xs[i] / cell)},${Math.floor(ys[i] / cell)}`;
      let b = grid.get(key);
      if (!b) grid.set(key, (b = []));
      b.push(i);
    }
    let moved = false;
    for (let i = 0; i < n; i++) {
      const gx = Math.floor(xs[i] / cell);
      const gy = Math.floor(ys[i] / cell);
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const b = grid.get(`${gx + ox},${gy + oy}`);
          if (!b) continue;
          for (const j of b) {
            if (j <= i) continue;
            const dx = xs[j] - xs[i];
            const dy = ys[j] - ys[i];
            const minD = r[i] + r[j] + padding;
            const d2 = dx * dx + dy * dy;
            if (d2 >= minD * minD) continue;
            const d = Math.sqrt(d2) || 0.01;
            const push = (minD - d) / 2;
            const ux = d2 === 0 ? 1 : dx / d;
            const uy = d2 === 0 ? 0 : dy / d;
            if (fixed[i] && fixed[j]) continue;
            const wi = fixed[i] ? 0 : fixed[j] ? 2 : 1;
            const wj = fixed[j] ? 0 : fixed[i] ? 2 : 1;
            xs[i] -= ux * push * wi;
            ys[i] -= uy * push * wi;
            xs[j] += ux * push * wj;
            ys[j] += uy * push * wj;
            moved = true;
          }
        }
      }
    }
    if (!moved) break;
  }
}

// ---------------------------------------------------------------------------
// Label level-of-detail
// ---------------------------------------------------------------------------
export interface LabelCandidate {
  id: string;
  /** rendered (screen) position */
  x: number;
  y: number;
  /** rendered node radius */
  r: number;
  label: string;
  /** higher = shown first */
  priority: number;
  /** always shown regardless of zoom/collisions (selected, hovered…) */
  forced?: boolean;
}

/**
 * Greedy collision-aware label selection in screen space.
 * Returns the set of ids whose labels should be visible.
 *
 * `zoom` gates how deep into the priority list we go: at low zoom only hubs,
 * zooming in progressively reveals peripheral entities.
 */
export function selectVisibleLabels(
  candidates: LabelCandidate[],
  opts: { zoom: number; fontPx: number; viewW: number; viewH: number; maxLabels?: number }
): Set<string> {
  const { zoom, fontPx, viewW, viewH } = opts;
  const visible = new Set<string>();
  const charW = fontPx * 0.58;
  const lineH = fontPx + 4;

  // Fraction of candidates eligible for labelling by zoom level.
  const eligibleFrac = zoom < 0.35 ? 0.03 : zoom < 0.6 ? 0.1 : zoom < 0.9 ? 0.3 : zoom < 1.4 ? 0.65 : 1;
  const maxLabels = opts.maxLabels ?? 400;

  const onScreen = candidates.filter(
    (c) => c.forced || (c.x > -100 && c.x < viewW + 100 && c.y > -40 && c.y < viewH + 40)
  );
  onScreen.sort((a, b) => (a.forced === b.forced ? b.priority - a.priority : a.forced ? -1 : 1));
  const eligibleCount = Math.max(
    onScreen.filter((c) => c.forced).length,
    Math.ceil(onScreen.length * eligibleFrac),
    Math.min(onScreen.length, 8)
  );

  // Coarse occupancy grid of label boxes.
  const cell = 40;
  const grid = new Map<number, Array<[number, number, number, number]>>();
  const key = (gx: number, gy: number) => gx * 100003 + gy;
  const collides = (x0: number, y0: number, x1: number, y1: number) => {
    for (let gx = Math.floor(x0 / cell); gx <= Math.floor(x1 / cell); gx++) {
      for (let gy = Math.floor(y0 / cell); gy <= Math.floor(y1 / cell); gy++) {
        const b = grid.get(key(gx, gy));
        if (!b) continue;
        for (const r of b) if (x0 < r[2] && x1 > r[0] && y0 < r[3] && y1 > r[1]) return true;
      }
    }
    return false;
  };
  const occupy = (x0: number, y0: number, x1: number, y1: number) => {
    const box: [number, number, number, number] = [x0, y0, x1, y1];
    for (let gx = Math.floor(x0 / cell); gx <= Math.floor(x1 / cell); gx++) {
      for (let gy = Math.floor(y0 / cell); gy <= Math.floor(y1 / cell); gy++) {
        const k = key(gx, gy);
        let b = grid.get(k);
        if (!b) grid.set(k, (b = []));
        b.push(box);
      }
    }
  };

  for (let i = 0; i < onScreen.length && visible.size < maxLabels; i++) {
    const c = onScreen[i];
    if (!c.forced && i >= eligibleCount && c.priority < 10000) continue;
    const w = Math.min(c.label.length, 28) * charW + 8;
    const x0 = c.x - w / 2;
    const y0 = c.y + c.r + 2;
    const x1 = c.x + w / 2;
    const y1 = y0 + lineH;
    if (!c.forced && collides(x0, y0, x1, y1)) continue;
    occupy(x0, y0, x1, y1);
    visible.add(c.id);
  }
  return visible;
}
