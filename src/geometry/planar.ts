import type { Vec2 } from "../types";

export function orientation(a: Vec2, b: Vec2, c: Vec2): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}
/** Sweep on x extents; rejects non-adjacent crossings, touches, overlaps and zero-length edges. */
export function simplePolygon(points: Vec2[]): boolean {
  const n = points.length;
  if (n < 3) return false;
  const segments = points
    .map((a, i) => {
      const b = points[(i + 1) % n];
      return {
        i,
        a,
        b,
        lo: Math.min(a[0], b[0]),
        hi: Math.max(a[0], b[0]),
        bottom: Math.min(a[1], b[1]),
        top: Math.max(a[1], b[1]),
      };
    })
    .sort((a, b) => a.lo - b.lo);
  let active: typeof segments = [];
  for (const s of segments) {
    if (s.a[0] === s.b[0] && s.a[1] === s.b[1]) return false;
    active = active.filter((t) => t.hi >= s.lo);
    for (const t of active) {
      const delta = Math.abs(s.i - t.i);
      if (
        delta === 1 ||
        delta === n - 1 ||
        s.top < t.bottom ||
        t.top < s.bottom
      )
        continue;
      if (
        orientation(s.a, s.b, t.a) * orientation(s.a, s.b, t.b) <= 0 &&
        orientation(t.a, t.b, s.a) * orientation(t.a, t.b, s.b) <= 0
      )
        return false;
    }
    active.push(s);
  }
  return true;
}
