// Path booleans (paper.js, keeps béziers) and polygon offsetting (Clipper) for contour, outlines and erasing.
import { loadScript } from './util.js';
import { pathD, parseD, flatten } from './geom.js';

const PAPER = 'https://cdn.jsdelivr.net/npm/paper@0.12.18/dist/paper-core.min.js';
const CLIP = 'https://cdn.jsdelivr.net/npm/clipper-lib@6.4.2/clipper.js';
let ready = null, okPaper = false, okClip = false;
export function loadGeoLibs() {
  if (!ready) ready = Promise.all([
    loadScript(PAPER).then(() => { window.paper.setup(new window.paper.Size(10, 10)); okPaper = true; }),
    loadScript(CLIP).then(() => { okClip = true; }),
  ]);
  return ready;
}
export const geoReady = () => okPaper && okClip;

// ---------- paper.js booleans ----------
function toItem(p) {
  const it = new window.paper.CompoundPath({ pathData: pathD(p), insert: false });
  it.fillRule = 'evenodd';
  // Normalise winding so even-odd input behaves under paper's non-zero booleans
  return it.reorient ? it.reorient(false, true) || it : it;
}
const fromItem = it => it ? parseD(it.pathData || '') : { sp: [] };
export function boolOp(op, a, b) {
  if (!okPaper) throw new Error('Pustaka geometri belum dimuat');
  const A = toItem(a), B = toItem(b);
  const r = op === 'union' ? A.unite(B, { insert: false }) : op === 'sub' ? A.subtract(B, { insert: false })
    : op === 'int' ? A.intersect(B, { insert: false }) : op === 'xor' ? A.exclude(B, { insert: false }) : A.divide(B, { insert: false });
  return fromItem(r);
}
export function boolMany(op, paths) {
  let acc = paths[0];
  for (let i = 1; i < paths.length; i++) acc = boolOp(op, acc, paths[i]);
  return acc;
}
export const isEmptyPath = p => !p || !p.sp.length || p.sp.every(s => s.n.length < 2);
// Douglas–Peucker style smoothing back into béziers
export function simplifyPath(p, tol = 0.25, closedHint) {
  if (!okPaper) return p;
  const polys = flatten(p, 0.02), out = { sp: [] };
  for (const q of polys) {
    if (q.pts.length < 3) { out.sp.push({ c: q.c, n: q.pts.map(([x, y]) => ({ x, y, ix: x, iy: y, ox: x, oy: y, t: 0 })) }); continue; }
    const pp = new window.paper.Path({ segments: q.pts, closed: closedHint ?? q.c, insert: false });
    pp.simplify(tol);
    const r = parseD(pp.pathData);
    out.sp.push(...r.sp);
  }
  return out;
}
export function smoothPolyline(pts, closed, tol = 2.5) {
  if (!okPaper || pts.length < 3) return null;
  const pp = new window.paper.Path({ segments: pts, closed, insert: false });
  pp.simplify(tol);
  return parseD(pp.pathData);
}

// ---------- Clipper offsets ----------
const SC = 1000;
const toC = polys => polys.filter(p => p.pts.length > 1).map(p => p.pts.map(([x, y]) => ({ X: Math.round(x * SC), Y: Math.round(y * SC) })));
const fromC = paths => paths.map(p => ({ c: true, pts: p.map(q => [q.X / SC, q.Y / SC]) }));
const JT = j => { const C = window.ClipperLib; return j === 'round' ? C.JoinType.jtRound : j === 'bevel' ? C.JoinType.jtSquare : C.JoinType.jtMiter; };
export function offsetPolys(polys, delta, join = 'round', miter = 4) {
  if (!okClip) return [];
  const C = window.ClipperLib;
  // even-odd clean first so holes are respected
  const cl = new C.Clipper(), sol = new C.Paths();
  cl.AddPaths(toC(polys.filter(p => p.c !== false)), C.PolyType.ptSubject, true);
  cl.Execute(C.ClipType.ctUnion, sol, C.PolyFillType.pftEvenOdd, C.PolyFillType.pftEvenOdd);
  const co = new C.ClipperOffset(miter, 0.02 * SC), out = new C.Paths();
  co.AddPaths(sol, JT(join), C.EndType.etClosedPolygon);
  co.Execute(out, delta * SC);
  return fromC(out);
}
// Expands strokes (open or closed) into filled outlines.
export function strokePolys(polys, width, cap = 'round', join = 'round') {
  if (!okClip) return [];
  const C = window.ClipperLib, co = new C.ClipperOffset(4, 0.02 * SC), out = new C.Paths();
  for (const p of polys) {
    if (p.pts.length < 2) continue;
    const et = p.c !== false ? C.EndType.etClosedLine : cap === 'round' ? C.EndType.etOpenRound : cap === 'square' ? C.EndType.etOpenSquare : C.EndType.etOpenButt;
    co.AddPath(toC([p])[0], JT(join), et);
  }
  co.Execute(out, width / 2 * SC);
  return fromC(out);
}
export function unionPolys(polysList, rule = 'nonzero') {
  if (!okClip) return [];
  const C = window.ClipperLib, cl = new C.Clipper(), sol = new C.Paths();
  // normalise each part (outer CCW / holes CW) so non-zero union never cancels opposite windings
  for (const ps of polysList) cl.AddPaths(C.Clipper.SimplifyPolygons(toC(ps), C.PolyFillType.pftEvenOdd), C.PolyType.ptSubject, true);
  const ft = rule === 'evenodd' ? C.PolyFillType.pftEvenOdd : C.PolyFillType.pftNonZero;
  cl.Execute(C.ClipType.ctUnion, sol, ft, ft);
  return fromC(sol);
}
export function clipPolys(subj, clip, op = 'diff') {
  if (!okClip) return subj;
  const C = window.ClipperLib, cl = new C.Clipper(), sol = new C.Paths();
  cl.AddPaths(toC(subj), C.PolyType.ptSubject, true);
  cl.AddPaths(toC(clip), C.PolyType.ptClip, true);
  const ct = op === 'diff' ? C.ClipType.ctDifference : op === 'int' ? C.ClipType.ctIntersection : op === 'xor' ? C.ClipType.ctXor : C.ClipType.ctUnion;
  cl.Execute(ct, sol, C.PolyFillType.pftEvenOdd, C.PolyFillType.pftNonZero);
  return fromC(sol);
}
