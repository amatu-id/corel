// Object → world geometry (with envelope / perspective / distortion), bounding boxes and hit-test polygons.
import { localPath } from './shapes.js';
import { layoutText, textPath, textOnPath, getFace } from './fonts.js';
import { xformPath, bbox, flatten, polysToPath, N, unionBox, xformBox, rectSub, I, smoothThrough, cpath, resample, polyLen } from './geom.js';
import { PT } from './util.js';

let resolve = () => null;          // id → object (set by the app)
export const setResolver = fn => { resolve = fn; };
export const find = id => resolve(id);
let epoch = 0;                     // bumps when fonts load so cached text geometry refreshes
export const bumpEpoch = () => { epoch++; };
export const getEpoch = () => epoch;

const cache = new WeakMap();
const GEOM_SKIP = new Set(['fill', 'ol', 'tr', 'name', 'lock', 'hid', 'pc']);
function gkey(o) {
  let k = epoch + '|';
  for (const p in o) {
    if (GEOM_SKIP.has(p)) continue;
    if (p === 'fx') { const f = o.fx || {}; k += JSON.stringify([f.env, f.persp, f.dist]); continue; }
    k += p + ':' + JSON.stringify(o[p]) + ';';
  }
  if (o.tp) { const t = resolve(o.tp.id); if (t) k += JSON.stringify(t.tf) + JSON.stringify(t.p || [t.w, t.h, t.r]); }
  return k;
}

// Local (pre-transform) base geometry of a leaf object.
export function baseLocal(o) {
  if (o.type === 'text') {
    const lay = layoutText(o);
    const tp = textPath(o, lay);
    return { p: tp || { sp: [rectSub(0, 0, Math.max(lay.w, 1), Math.max(lay.h, 1))] }, ready: !!tp, lay };
  }
  if (o.type === 'img') return { p: { sp: [rectSub(0, 0, o.w, o.h)] } };
  if (o.type === 'qr' || o.type === 'table') return { p: { sp: [rectSub(0, 0, o.w, o.h)] } };
  const lp = localPath(o);
  return { p: { sp: lp.sp }, lines: lp.lines?.length ? { sp: lp.lines } : null };
}

// ---------- Geometric effects in local space ----------
const lerp = (a, b, t) => a + (b - a) * t;
function quadPt(a, c, b, t) { const u = 1 - t; return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]; }
// Envelope: 8 handles [TL,TR,BR,BL, T,R,B,L] each edge is a quadratic through its mid handle; Coons patch.
export function envMap(env) {
  const [TL, TR, BR, BL, MT, MR, MB, ML] = env.pts, b = env.b;
  const ctl = (a, m, c) => [2 * m[0] - (a[0] + c[0]) / 2, 2 * m[1] - (a[1] + c[1]) / 2];
  const strt = env.mode === 'line';
  const CT = strt ? [(TL[0] + TR[0]) / 2, (TL[1] + TR[1]) / 2] : ctl(TL, MT, TR), CB = strt ? [(BL[0] + BR[0]) / 2, (BL[1] + BR[1]) / 2] : ctl(BL, MB, BR);
  const CL = strt ? [(TL[0] + BL[0]) / 2, (TL[1] + BL[1]) / 2] : ctl(TL, ML, BL), CR = strt ? [(TR[0] + BR[0]) / 2, (TR[1] + BR[1]) / 2] : ctl(TR, MR, BR);
  return (x, y) => {
    const u = b.w ? (x - b.x) / b.w : 0, v = b.h ? (y - b.y) / b.h : 0;
    const t = quadPt(TL, CT, TR, u), bt = quadPt(BL, CB, BR, u), l = quadPt(TL, CL, BL, v), r = quadPt(TR, CR, BR, v);
    return [
      (1 - v) * t[0] + v * bt[0] + (1 - u) * l[0] + u * r[0] - ((1 - u) * (1 - v) * TL[0] + u * (1 - v) * TR[0] + (1 - u) * v * BL[0] + u * v * BR[0]),
      (1 - v) * t[1] + v * bt[1] + (1 - u) * l[1] + u * r[1] - ((1 - u) * (1 - v) * TL[1] + u * (1 - v) * TR[1] + (1 - u) * v * BL[1] + u * v * BR[1]),
    ];
  };
}
export function envInit(b) {
  const { x, y, w, h } = b;
  return { b: { ...b }, mode: 'curve', pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x + w / 2, y], [x + w, y + h / 2], [x + w / 2, y + h], [x, y + h / 2]] };
}
// Perspective: unit square → quad homography
export function perspMap(pp) {
  const [p0, p1, p2, p3] = pp.q, b = pp.b;
  const dx1 = p1[0] - p2[0], dx2 = p3[0] - p2[0], dy1 = p1[1] - p2[1], dy2 = p3[1] - p2[1];
  const sx = p0[0] - p1[0] + p2[0] - p3[0], sy = p0[1] - p1[1] + p2[1] - p3[1];
  let g = 0, hh = 0;
  const den = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(sx) > 1e-9 || Math.abs(sy) > 1e-9) { g = (sx * dy2 - dx2 * sy) / den; hh = (dx1 * sy - sx * dy1) / den; }
  const a = p1[0] - p0[0] + g * p1[0], bb = p3[0] - p0[0] + hh * p3[0], c = p0[0];
  const d = p1[1] - p0[1] + g * p1[1], e = p3[1] - p0[1] + hh * p3[1], f = p0[1];
  return (x, y) => {
    const u = b.w ? (x - b.x) / b.w : 0, v = b.h ? (y - b.y) / b.h : 0, w = g * u + hh * v + 1;
    return [(a * u + bb * v + c) / w, (d * u + e * v + f) / w];
  };
}
export function perspInit(b) { const { x, y, w, h } = b; return { b: { ...b }, q: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]] }; }

function densify(polys, step) {
  return polys.map(p => {
    const out = [], q = p.pts, L = q.length;
    for (let i = 0; i < L - (p.c ? 0 : 1); i++) {
      const a = q[i], b = q[(i + 1) % L], d = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(d / step));
      for (let k = 0; k < n; k++) out.push([lerp(a[0], b[0], k / n), lerp(a[1], b[1], k / n)]);
    }
    if (!p.c) out.push(q[L - 1]);
    return { c: p.c, pts: out };
  });
}
function distort(p, d, bb) {
  const cx = bb.x + bb.w * (d.cx ?? .5), cy = bb.y + bb.h * (d.cy ?? .5), size = Math.max(bb.w, bb.h) || 1;
  if (d.k === 'push') { // pucker / bloat on béziers
    const a = (d.amp || 0) / 100;
    p = cpath(p);
    const mv = (x, y, s) => [x + (cx - x) * a * s, y + (cy - y) * a * s];
    return {
      sp: p.sp.map(s => {
        // densify so straight edges also bulge
        const nodes = [];
        const n = s.n, L = n.length;
        for (let i = 0; i < L; i++) {
          const A = n[i], B = n[(i + 1) % L];
          nodes.push(A);
          if (!s.c && i === L - 1) break;
          if (A.ox === A.x && A.oy === A.y && B.ix === B.x && B.iy === B.y) {
            A.ox = A.x + (B.x - A.x) / 3; A.oy = A.y + (B.y - A.y) / 3; B.ix = A.x + (B.x - A.x) * 2 / 3; B.iy = A.y + (B.y - A.y) * 2 / 3;
          }
        }
        return {
          c: s.c, n: nodes.map(q => {
            const [x, y] = mv(q.x, q.y, 1), [ix, iy] = mv(q.ix, q.iy, -1), [ox, oy] = mv(q.ox, q.oy, -1);
            return N(x, y, ix, iy, ox, oy, 0);
          })
        };
      })
    };
  }
  let polys = flatten(p, size / 400);
  if (d.k === 'zip') {
    const amp = (d.amp || 0) / 100 * size * 0.25, fr = Math.max(1, d.freq || 10);
    polys = polys.map(q => {
      const L = polyLen(q.pts, q.c), n = Math.max(6, Math.round(fr * 2 * Math.max(1, L / (size * 2))));
      const r = resample(q.pts, q.c ? n * 2 : n * 2 + 1, q.c);
      const out = r.map((pt, i) => {
        const pr = r[(i - 1 + r.length) % r.length], nx = r[(i + 1) % r.length];
        let tx = nx[0] - pr[0], ty = nx[1] - pr[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
        const s = (i % 2 ? 1 : -1) * amp * (d.rand ? (0.4 + Math.random() * 0.6) : 1);
        return [pt[0] - ty * s, pt[1] + tx * s];
      });
      return { c: q.c, pts: out };
    });
    if (d.smooth) return { sp: polys.map(q => ({ c: q.c, n: smoothThrough(q.pts, q.c) })) };
    return polysToPath(polys);
  }
  if (d.k === 'twist') {
    polys = densify(polys, size / 120);
    const rot = (d.rot || 0) * 2 * Math.PI, rmax = Math.hypot(bb.w, bb.h) / 2 || 1;
    polys = polys.map(q => ({ c: q.c, pts: q.pts.map(([x, y]) => { const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy), a = rot * r / rmax, c = Math.cos(a), s = Math.sin(a); return [cx + dx * c - dy * s, cy + dx * s + dy * c]; }) }));
    return polysToPath(polys);
  }
  return p;
}
function mapPath(p, fn, size) {
  const polys = densify(flatten(p, size / 500), size / 60);
  return polysToPath(polys.map(q => ({ c: q.c, pts: q.pts.map(([x, y]) => fn(x, y)) })));
}
export function applyLocalFx(o, p) {
  const fx = o.fx;
  if (!fx || !(fx.env || fx.persp || fx.dist)) return p;
  let b = bbox(p);
  const size = Math.max(b.w, b.h) || 1;
  if (fx.dist) { p = distort(p, fx.dist, b); }
  if (fx.env) p = mapPath(p, envMap(fx.env), size);
  if (fx.persp) p = mapPath(p, perspMap(fx.persp), size);
  return p;
}

// ---------- World geometry ----------
// geom(o) → { p: world path, lines?: world path, ready }
export function geom(o) {
  const k = gkey(o);
  const c = cache.get(o);
  if (c && c.k === k) return c.g;
  let g;
  if (o.type === 'text' && o.tp) g = textOnPathGeom(o);
  if (!g) {
    const b = baseLocal(o);
    let p = applyLocalFx(o, b.p);
    g = { p: xformPath(p, o.tf || I()), lines: b.lines ? xformPath(b.lines, o.tf || I()) : null, ready: b.ready !== false, lay: b.lay, local: b.p };
  }
  cache.set(o, { k, g });
  return g;
}
function textOnPathGeom(o) {
  const t = resolve(o.tp.id);
  if (!t || !getFace(o.font, o.wt, o.it)) return null;
  const tg = geom(t);
  const poly = flatten(tg.p, 0.05)[0];
  if (!poly) return null;
  let pts = poly.pts;
  if (o.tp.rev) pts = pts.slice().reverse();
  const p = textOnPath(o, pts, poly.c, o.tp.off || 0, o.tp.side || 0);
  if (!p) return null;
  return { p, ready: true, onPath: true };
}
export function polysOf(o, tol = 0.05) {
  const g = geom(o);
  return flatten(g.p, tol);
}
// Axis-aligned world bounding box (geometry only, no outline width).
export function objBox(o) {
  if (o.hid) return null;
  if (o.type === 'g') { let b = null; for (const c of o.ch) b = unionBox(b, objBox(c)); return b; }
  if (o.type === 'blend') return unionBox(objBox(o.a), objBox(o.b));
  if (o.type === 'dim' || o.type === 'conn') {
    const pts = o.type === 'conn' ? connPts(o) : dimPts(o);
    if (!pts.length) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  if (o.type === 'img' || o.type === 'qr' || o.type === 'table') return xformBox({ x: 0, y: 0, w: o.w, h: o.h }, o.tf);
  const g = geom(o);
  const b = bbox(g.p);
  return g.lines ? unionBox(b, bbox(g.lines)) : b;
}
export function selBox(objs) { let b = null; for (const o of objs) b = unionBox(b, objBox(o)); return b; }

// ---------- Connectors & dimensions ----------
export function anchorPt(spec) {
  if (!spec) return [0, 0];
  if (spec.pt) return spec.pt;
  const t = resolve(spec.id);
  if (!t) return spec.last || [0, 0];
  const b = objBox(t) || { x: 0, y: 0, w: 0, h: 0 };
  const m = { t: [b.x + b.w / 2, b.y], b: [b.x + b.w / 2, b.y + b.h], l: [b.x, b.y + b.h / 2], r: [b.x + b.w, b.y + b.h / 2], c: [b.x + b.w / 2, b.y + b.h / 2] };
  const p = m[spec.s || 'c'];
  spec.last = p;
  return p;
}
export function connPts(o) {
  const a = anchorPt(o.a), b = anchorPt(o.b);
  if (o.k !== 'r') return [a, b];
  const sa = o.a?.s, horizA = sa === 'l' || sa === 'r';
  if (horizA) { const mx = (a[0] + b[0]) / 2; return [a, [mx, a[1]], [mx, b[1]], b]; }
  const my = (a[1] + b[1]) / 2;
  return [a, [a[0], my], [b[0], my], b];
}
export function dimPts(o) { return o.pts || []; }
export const ptEm = sz => sz * PT;
