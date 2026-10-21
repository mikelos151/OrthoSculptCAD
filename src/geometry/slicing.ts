import { assertMesh } from "./core";
import { simplePolygon } from "./planar";
import type { MeshData, SliceResult, SliceLoop, Vec2 } from "../types";

type Interval = { triangle: number; lo: number; hi: number };
type IntervalNode = {
  center: number;
  low: Interval[];
  high: Interval[];
  left?: IntervalNode;
  right?: IntervalNode;
};
function buildIntervalTree(items: Interval[]): IntervalNode | undefined {
  if (!items.length) return;
  const mid = items.map((i) => (i.lo + i.hi) / 2).sort((a, b) => a - b);
  const center = mid[mid.length >> 1];
  const left: Interval[] = [],
    right: Interval[] = [],
    span: Interval[] = [];
  for (const i of items)
    (i.hi < center ? left : i.lo > center ? right : span).push(i);
  return {
    center,
    low: span.slice().sort((a, b) => a.lo - b.lo),
    high: span.sort((a, b) => b.hi - a.hi),
    left: buildIntervalTree(left),
    right: buildIntervalTree(right),
  };
}
function candidates(node: IntervalNode | undefined, z: number, out: number[]) {
  if (!node) return;
  if (z < node.center) {
    for (const i of node.low) {
      if (i.lo > z) break;
      out.push(i.triangle);
    }
    candidates(node.left, z, out);
  } else {
    for (const i of node.high) {
      if (i.hi < z) break;
      out.push(i.triangle);
    }
    candidates(node.right, z, out);
  }
}
function loopMetrics(points: Vec2[], closed: boolean): SliceLoop {
  let perimeter = 0,
    twiceArea = 0;
  let xmin = Infinity,
    xmax = -Infinity,
    ymin = Infinity,
    ymax = -Infinity;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    xmin = Math.min(xmin, a[0]);
    xmax = Math.max(xmax, a[0]);
    ymin = Math.min(ymin, a[1]);
    ymax = Math.max(ymax, a[1]);
    if (i + 1 < points.length || closed) {
      const b = points[(i + 1) % points.length];
      perimeter += Math.hypot(a[0] - b[0], a[1] - b[1]);
      twiceArea += a[0] * b[1] - b[0] * a[1];
    }
  }
  return {
    points,
    closed,
    perimeter,
    area: closed ? Math.abs(twiceArea) / 2 : 0,
    ml: xmax - xmin,
    ap: ymax - ymin,
  };
}
/** Immutable snapshot with a centered interval tree: queries do not scan all triangles. */
export class SliceIndex {
  private readonly mesh: MeshData;
  private readonly tree: IntervalNode | undefined;
  constructor(mesh: MeshData) {
    assertMesh(mesh);
    this.mesh = {
      ...mesh,
      positions: mesh.positions.slice(),
      indices: mesh.indices.slice(),
    };
    const items: Interval[] = [];
    for (let t = 0; t < mesh.indices.length; t += 3) {
      const zs = [0, 1, 2].map(
        (k) => mesh.positions[mesh.indices[t + k] * 3 + 2],
      );
      items.push({ triangle: t, lo: Math.min(...zs), hi: Math.max(...zs) });
    }
    this.tree = buildIntervalTree(items);
  }
  slice(z: number): SliceResult {
    const started = performance.now();
    if (!Number.isFinite(z)) throw new Error("Slice height must be finite");
    const triangles: number[] = [];
    candidates(this.tree, z, triangles);
    const { positions: p, indices } = this.mesh;
    const points = new Map<string, Vec2>();
    const adjacency = new Map<string, Set<string>>();
    const edges = new Map<string, boolean>();
    let duplicateCrossing = false;
    const connect = (a: string, b: string) => {
      if (a === b) return;
      const onPlane = a.startsWith("v") && b.startsWith("v"),
        key = [a, b].sort().join("|");
      if (edges.has(key)) {
        if (!onPlane || !edges.get(key)) duplicateCrossing = true;
        return;
      }
      edges.set(key, onPlane);
      if (!adjacency.has(a)) adjacency.set(a, new Set());
      if (!adjacency.has(b)) adjacency.set(b, new Set());
      adjacency.get(a)!.add(b);
      adjacency.get(b)!.add(a);
    };
    for (const t of triangles) {
      const ids = [indices[t], indices[t + 1], indices[t + 2]];
      const hits = new Set<string>();
      if (ids.every((i) => p[i * 3 + 2] === z)) continue;
      for (let k = 0; k < 3; k++) {
        const a = ids[k],
          b = ids[(k + 1) % 3],
          za = p[a * 3 + 2],
          zb = p[b * 3 + 2];
        if (za === z) {
          const key = `v${a}`;
          points.set(key, [p[a * 3], p[a * 3 + 1]]);
          hits.add(key);
        }
        if ((za < z && zb > z) || (za > z && zb < z)) {
          const f = (z - za) / (zb - za),
            key = `e${Math.min(a, b)}:${Math.max(a, b)}`;
          points.set(key, [
            p[a * 3] + f * (p[b * 3] - p[a * 3]),
            p[a * 3 + 1] + f * (p[b * 3 + 1] - p[a * 3 + 1]),
          ]);
          hits.add(key);
        }
      }
      if (hits.size === 2) {
        const [a, b] = [...hits];
        connect(a, b);
      }
    }
    const loops: SliceLoop[] = [];
    const visited = new Set<string>();
    let branched = false;
    for (const seed of adjacency.keys()) {
      if (visited.has(seed)) continue;
      const component: string[] = [];
      const stack = [seed];
      visited.add(seed);
      while (stack.length) {
        const a = stack.pop()!;
        component.push(a);
        for (const b of adjacency.get(a)!) {
          if (!visited.has(b)) {
            visited.add(b);
            stack.push(b);
          }
        }
      }
      const branch = component.some((k) => adjacency.get(k)!.size > 2);
      branched ||= branch;
      const start = component.find((k) => adjacency.get(k)!.size === 1) ?? seed;
      const order: string[] = [];
      const walked = new Set<string>();
      let current: string | undefined = start,
        previous: string | undefined;
      while (current !== undefined && !walked.has(current)) {
        order.push(current);
        walked.add(current);
        const next: string | undefined = [...adjacency.get(current)!].find(
          (k) => k !== previous,
        );
        previous = current;
        current = next;
      }
      const closed =
        !branch &&
        current === start &&
        order.length === component.length &&
        component.length >= 3 &&
        component.every((k) => adjacency.get(k)!.size === 2);
      loops.push(
        loopMetrics(
          order.map((k) => points.get(k)!),
          closed,
        ),
      );
    }
    const selfIntersection = loops.some(
      (l) => l.closed && !simplePolygon(l.points),
    );
    const valid =
      !branched &&
      !selfIntersection &&
      !duplicateCrossing &&
      loops.length === 1 &&
      loops[0].closed &&
      loops[0].area > 0;
    const warnings: string[] = [];
    if (duplicateCrossing)
      warnings.push("Duplicate crossing faces: ambiguous contour");
    if (selfIntersection) warnings.push("Self-intersecting/ambiguous contour");
    if (branched) warnings.push("Branched/ambiguous contour");
    if (loops.some((l) => !l.closed)) warnings.push("Open contour");
    if (loops.length !== 1) warnings.push("Expected exactly one contour");
    const one = valid ? loops[0] : undefined;
    return {
      z,
      loops,
      valid,
      perimeter: one?.perimeter ?? 0,
      area: one?.area ?? 0,
      ap: one?.ap ?? 0,
      ml: one?.ml ?? 0,
      queryMs: performance.now() - started,
      warnings,
    };
  }
}
