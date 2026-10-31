// Parametric object geometry (local coordinates, origin top-left) and the Perfect Shapes library.
import { N, rectSub, ellipseSub, arcNodes, parseD, xformPath, reverseSub, S } from './geom.js';

const K4 = 0.5522847498;
const poly = pts => ({ c: true, n: pts.map(p => N(p[0], p[1])) });
const open = pts => ({ c: false, n: pts.map(p => N(p[0], p[1])) });

// ---------- Rectangle ----------
export function rectPath(o) {
  const { w, h } = o, r = (o.r || [0, 0, 0, 0]).map(v => Math.max(0, Math.min(v, Math.min(w, h) / 2)));
  if (!r.some(v => v > 0)) return { sp: [rectSub(0, 0, w, h)] };
  const ct = o.ct || 'round';
  const C = [[0, 0, [0, -1], [1, 0]], [w, 0, [1, 0], [0, 1]], [w, h, [0, 1], [-1, 0]], [0, h, [-1, 0], [0, -1]]];
  const nodes = [];
  C.forEach(([cx, cy, ui, uo], i) => {
    const rr = r[i];
    if (!rr) { nodes.push(N(cx, cy)); return; }
    const p1 = [cx - rr * ui[0], cy - rr * ui[1]], p2 = [cx + rr * uo[0], cy + rr * uo[1]];
    if (ct === 'chamfer') { nodes.push(N(p1[0], p1[1]), N(p2[0], p2[1])); return; }
    const k = rr * K4;
    const c1 = ct === 'round' ? [p1[0] + k * ui[0], p1[1] + k * ui[1]] : [p1[0] + k * uo[0], p1[1] + k * uo[1]];
    const c2 = ct === 'round' ? [p2[0] - k * uo[0], p2[1] - k * uo[1]] : [p2[0] - k * ui[0], p2[1] - k * ui[1]];
    nodes.push(N(p1[0], p1[1], p1[0], p1[1], c1[0], c1[1]), N(p2[0], p2[1], c2[0], c2[1], p2[0], p2[1]));
  });
  return { sp: [{ c: true, n: nodes }] };
}

// ---------- Ellipse / pie / arc ----------
export function ellPath(o) {
  const rx = o.w / 2, ry = o.h / 2;
  if (!o.k || o.k === 'e') return { sp: [ellipseSub(rx, ry, rx, ry)] };
  let s = -(o.a1 ?? 0) * Math.PI / 180, e = -(o.a0 ?? 0) * Math.PI / 180;
  while (e <= s + 1e-9) e += 2 * Math.PI;
  const arc = arcNodes(rx, ry, rx, ry, s, e);
  if (o.k === 'arc') return { sp: [{ c: false, n: arc }] };
  return { sp: [{ c: true, n: [N(rx, ry), ...arc] }] };
}

// ---------- Polygon / star / complex star ----------
export function polyPath(o) {
  const n = Math.max(3, o.n | 0), rx = o.w / 2, ry = o.h / 2, pts = [];
  const a0 = -Math.PI / 2;
  if (o.cs) { // complex star {n/k}
    const k = Math.max(2, Math.min(Math.floor((n - 1) / 2), o.k || 2));
    const out = [];
    for (let i = 0; i < n; i++) { const a = a0 + i * 2 * Math.PI / n; out.push([rx + rx * Math.cos(a), ry + ry * Math.sin(a)]); }
    const g = gcd(n, k), sp = [];
    for (let s = 0; s < g; s++) {
      const loop = []; let i = s;
      do { loop.push(out[i]); i = (i + k) % n; } while (i !== s);
      sp.push(poly(loop));
    }
    return { sp };
  }
  const ir = o.ir ?? Math.cos(Math.PI / n), tw = (o.tw || 0) * Math.PI / 180;
  for (let i = 0; i < n; i++) {
    const a = a0 + i * 2 * Math.PI / n;
    pts.push([rx + rx * Math.cos(a), ry + ry * Math.sin(a)]);
    if (o.star || Math.abs(ir - Math.cos(Math.PI / n)) > 1e-6 || tw) {
      const b = a + Math.PI / n + tw;
      pts.push([rx + rx * ir * Math.cos(b), ry + ry * ir * Math.sin(b)]);
    }
  }
  return { sp: [poly(pts)] };
}
const gcd = (a, b) => b ? gcd(b, a % b) : a;
export function polyNodes(o) { // outer + inner control positions for the shape tool
  const n = Math.max(3, o.n | 0), rx = o.w / 2, ry = o.h / 2, ir = o.ir ?? Math.cos(Math.PI / n), tw = (o.tw || 0) * Math.PI / 180;
  const a = -Math.PI / 2 + Math.PI / n + tw;
  return { outer: [rx, 0], inner: [rx + rx * ir * Math.cos(a), ry + ry * ir * Math.sin(a)] };
}

// ---------- Spiral ----------
export function spiralPath(o) {
  const rev = Math.max(0.5, o.rev || 4), th1 = rev * 2 * Math.PI, steps = Math.ceil(rev * 8);
  const log = !!o.log, ex = Math.max(1, o.ex || 50) / 100;
  // r(θ) normalised to 1 at θ1
  const b = log ? Math.log(1 + 10 * ex) / th1 * 2.2 : 0;
  const rf = th => log ? (Math.exp(b * th) - 1) / (Math.exp(b * th1) - 1) : th / th1;
  const drf = th => log ? b * Math.exp(b * th) / (Math.exp(b * th1) - 1) : 1 / th1;
  const sx = o.w / 2, sy = o.h / 2, nodes = [];
  const P = th => { const r = rf(th); return [sx + sx * r * Math.cos(th), sy + sy * r * Math.sin(th)]; };
  const D = th => { const r = rf(th), dr = drf(th); return [sx * (dr * Math.cos(th) - r * Math.sin(th)), sy * (dr * Math.sin(th) + r * Math.cos(th))]; };
  const dt = th1 / steps;
  for (let i = 0; i <= steps; i++) {
    const th = i * dt, p = P(th), d = D(th);
    nodes.push(N(p[0], p[1], p[0] - d[0] * dt / 3, p[1] - d[1] * dt / 3, p[0] + d[0] * dt / 3, p[1] + d[1] * dt / 3, i && i < steps ? 1 : 0));
  }
  nodes[0].ix = nodes[0].x; nodes[0].iy = nodes[0].y;
  const L = nodes[nodes.length - 1]; L.ox = L.x; L.oy = L.y;
  return { sp: [{ c: false, n: nodes }] };
}

// ---------- Perfect shapes ----------
// Each: {n: label, g: group, p: default params, f(w,h,p) → {sp, lines?}, hd: [{pos(w,h,p)→[x,y], set(w,h,p,x,y)}]}
const unitD = (d, w, h, box = 100) => xformPath(parseD(d), S(w / box, h / box));
const cl = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ell = (cx, cy, rx, ry) => ellipseSub(cx, cy, rx, ry);

function arrowR(w, h, t, hl) { // shaft thickness fraction t, head length fraction hl
  const hx = w * (1 - hl), y0 = h * (1 - t) / 2, y1 = h - y0;
  return [[0, y0], [hx, y0], [hx, 0], [w, h / 2], [hx, h], [hx, y1], [0, y1]];
}
function rotPts(pts, w, h, rot) { // pts made in (w',h') space; rot 90 → map to w×h
  if (rot === 0) return pts;
  if (rot === 180) return pts.map(([x, y]) => [w - x, h - y]);
  if (rot === 90) return pts.map(([x, y]) => [w - y, x]);      // down
  return pts.map(([x, y]) => [y, h - x]);                       // up (270)
}
const arrowHd = (vert) => [{
  pos: (w, h, p) => vert ? [w * (1 - p[0]) / 2, h * p[1]] : [w * (1 - p[1]), h * (1 - p[0]) / 2],
  set: (w, h, p, x, y) => { if (vert) { p[0] = cl(1 - 2 * x / w, .05, 1); p[1] = cl(y / h, .05, .95); } else { p[1] = cl(1 - x / w, .05, .95); p[0] = cl(1 - 2 * y / h, .05, 1); } }
}];
const xHd = (i, lo = 0, hi = 1, fy = 0) => [{ pos: (w, h, p) => [w * p[i], h * fy], set: (w, h, p, x) => { p[i] = cl(x / w, lo, hi); } }];
const yHd = (i, lo = 0, hi = 1, fx = 0) => [{ pos: (w, h, p) => [w * fx, h * p[i]], set: (w, h, p, x, y) => { p[i] = cl(y / h, lo, hi); } }];
const insetHd = (i, lo = 0, hi = .5) => [{ pos: (w, h, p) => [Math.min(w, h) * p[i], 0], set: (w, h, p, x) => { p[i] = cl(x / Math.min(w, h), lo, hi); } }];

function starPts(w, h, n, ir) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + i * Math.PI / n, r = i % 2 ? ir : 1;
    pts.push([w / 2 + w / 2 * r * Math.cos(a), h / 2 + h / 2 * r * Math.sin(a)]);
  }
  return pts;
}
const starShape = (n, ir) => ({
  g: 'stars', p: [ir], f: (w, h, p) => ({ sp: [poly(starPts(w, h, n, p[0]))] }),
  hd: [{ pos: (w, h, p) => { const a = -Math.PI / 2 + Math.PI / n; return [w / 2 + w / 2 * p[0] * Math.cos(a), h / 2 + h / 2 * p[0] * Math.sin(a)]; }, set: (w, h, p, x, y) => { p[0] = cl(Math.hypot((x - w / 2) / (w / 2), (y - h / 2) / (h / 2)), .05, .98); } }]
});
function calloutPts(w, h, tx, ty, kind) {
  // tail tip (tx,ty) in box coords; picks the nearest edge for the tail base
  const cx = w / 2, cy = h / 2, dx = (tx - cx) / w, dy = (ty - cy) / h;
  if (kind === 'ell') {
    const a = Math.atan2((ty - cy) / h, (tx - cx) / w), sw = 0.22;
    const arc = arcNodes(cx, cy, w / 2, h / 2, a + sw, a - sw + 2 * Math.PI);
    return { sp: [{ c: true, n: [...arc, N(tx, ty)] }] };
  }
  const bw = 0.1;
  let pts;
  if (Math.abs(dy) >= Math.abs(dx)) {
    const bx = cl(tx / w, .15, .85) * w, b0 = Math.max(0, bx - w * bw), b1 = Math.min(w, bx + w * bw);
    pts = dy > 0 ? [[0, 0], [w, 0], [w, h], [Math.max(b1, b0), h], [tx, ty], [Math.min(b0, b1), h], [0, h]]
      : [[0, 0], [b0, 0], [tx, ty], [b1, 0], [w, 0], [w, h], [0, h]];
  } else {
    const by = cl(ty / h, .15, .85) * h, b0 = Math.max(0, by - h * bw * 1.5), b1 = Math.min(h, by + h * bw * 1.5);
    pts = dx > 0 ? [[0, 0], [w, 0], [w, b0], [tx, ty], [w, b1], [w, h], [0, h]]
      : [[0, 0], [w, 0], [w, h], [0, h], [0, b1], [tx, ty], [0, b0]];
  }
  return { sp: [poly(pts)] };
}
const tailHd = [{ pos: (w, h, p) => [w * p[0], h * p[1]], set: (w, h, p, x, y) => { p[0] = x / w; p[1] = y / h; } }];
const docWave = (w, h, a, x0 = 0, y0 = 0) => { // document shape with wavy bottom
  const yb = y0 + h * (1 - a);
  return { c: true, n: [N(x0, y0), N(x0 + w, y0), N(x0 + w, yb, x0 + w, yb, x0 + w * .75, yb - h * a * 1.4), N(x0, yb, x0 + w * .25, yb + h * a * 2.2, x0, yb)] };
};

export const PS = {
  // Basic
  parallelogram: { n: 'Jajaran genjang', g: 'basic', p: [.25], f: (w, h, p) => ({ sp: [poly([[w * p[0], 0], [w, 0], [w * (1 - p[0]), h], [0, h]])] }), hd: xHd(0, 0, .95) },
  trapezoid: { n: 'Trapesium', g: 'basic', p: [.25], f: (w, h, p) => ({ sp: [poly([[w * p[0], 0], [w * (1 - p[0]), 0], [w, h], [0, h]])] }), hd: xHd(0, 0, .5) },
  triangle: { n: 'Segitiga', g: 'basic', p: [.5], f: (w, h, p) => ({ sp: [poly([[w * p[0], 0], [w, h], [0, h]])] }), hd: xHd(0) },
  rtriangle: { n: 'Segitiga siku-siku', g: 'basic', p: [], f: (w, h) => ({ sp: [poly([[0, 0], [w, h], [0, h]])] }) },
  diamond: { n: 'Belah ketupat', g: 'basic', p: [], f: (w, h) => ({ sp: [poly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]])] }) },
  hexagon: { n: 'Segi enam', g: 'basic', p: [.25], f: (w, h, p) => ({ sp: [poly([[w * p[0], 0], [w * (1 - p[0]), 0], [w, h / 2], [w * (1 - p[0]), h], [w * p[0], h], [0, h / 2]])] }), hd: xHd(0, 0, .5) },
  octagon: { n: 'Segi delapan', g: 'basic', p: [.29], f: (w, h, p) => { const d = Math.min(w, h) * p[0]; return { sp: [poly([[d, 0], [w - d, 0], [w, d], [w, h - d], [w - d, h], [d, h], [0, h - d], [0, d]])] }; }, hd: insetHd(0) },
  plus: { n: 'Tanda tambah', g: 'basic', p: [.3], f: (w, h, p) => { const d = Math.min(w, h) * p[0]; return { sp: [poly([[d, 0], [w - d, 0], [w - d, d], [w, d], [w, h - d], [w - d, h - d], [w - d, h], [d, h], [d, h - d], [0, h - d], [0, d], [d, d]])] }; }, hd: insetHd(0, 0.02, .49) },
  frame: { n: 'Bingkai', g: 'basic', p: [.14], f: (w, h, p) => { const d = Math.min(w, h) * p[0]; return { sp: [rectSub(0, 0, w, h), reverseSub(rectSub(d, d, w - 2 * d, h - 2 * d))] }; }, hd: insetHd(0, .01, .49) },
  donut: { n: 'Donat', g: 'basic', p: [.25], f: (w, h, p) => { const d = Math.min(w, h) * p[0]; return { sp: [ell(w / 2, h / 2, w / 2, h / 2), reverseSub(ell(w / 2, h / 2, w / 2 - d, h / 2 - d))] }; }, hd: insetHd(0, .01, .49) },
  heart: { n: 'Hati', g: 'basic', p: [], f: (w, h) => ({ sp: unitD('M50 92C34 80 4 60 4 32 4 16 16 6 29 6 39 6 46 12 50 20 54 12 61 6 71 6 84 6 96 16 96 32 96 60 66 80 50 92Z', w, h).sp }) },
  bolt: { n: 'Petir', g: 'basic', p: [], f: (w, h) => ({ sp: [poly([[.39, 0], [.82, 0], [.58, .38], [.88, .38], [.24, 1], [.42, .55], [.12, .55]].map(([x, y]) => [x * w, y * h]))] }) },
  moon: {
    n: 'Bulan sabit', g: 'basic', p: [.5], f: (w, h, p) => {
      const o = arcNodes(w, h / 2, w, h / 2, Math.PI / 2, Math.PI * 1.5);
      const i = reverseSub({ c: false, n: arcNodes(w, h / 2, w * p[0], h / 2, Math.PI / 2, Math.PI * 1.5) }).n;
      const top = o[o.length - 1], bot = o[0], il = i[i.length - 1];
      top.ox = i[0].ox; top.oy = i[0].oy; bot.ix = il.ix; bot.iy = il.iy;
      return { sp: [{ c: true, n: [...o, ...i.slice(1, -1)] }] };
    }, hd: [{ pos: (w, h, p) => [w - w * p[0], h / 2], set: (w, h, p, x) => { p[0] = cl(1 - x / w, .05, .95); } }]
  },
  cylinder: {
    n: 'Tabung', g: 'basic', p: [.14], f: (w, h, p) => {
      const e = h * p[0], rx = w / 2;
      const top = arcNodes(rx, e, rx, e, Math.PI, Math.PI * 2), bot = arcNodes(rx, h - e, rx, e, 0, Math.PI);
      const n = [...bot.map(q => ({ ...q })), ...top.map(q => ({ ...q }))];
      return { sp: [{ c: true, n }], lines: [{ c: false, n: arcNodes(rx, e, rx, e, 0, Math.PI) }] };
    }, hd: yHd(0, .02, .5)
  },
  cube: {
    n: 'Kubus', g: 'basic', p: [.25], f: (w, h, p) => {
      const d = Math.min(w, h) * p[0];
      return { sp: [poly([[d, 0], [w, 0], [w, h - d], [w - d, h], [0, h], [0, d]])], lines: [open([[0, d], [w - d, d], [w - d, h]]), open([[w - d, d], [w, 0]])] };
    }, hd: insetHd(0, .02, .9)
  },
  teardrop: { n: 'Tetesan', g: 'basic', p: [], f: (w, h) => ({ sp: unitD('M50 4C62 28 86 48 86 66 86 86 70 96 50 96 30 96 14 86 14 66 14 48 38 28 50 4Z', w, h).sp }) },
  cloud: { n: 'Awan', g: 'basic', p: [], f: (w, h) => ({ sp: unitD('M26 86C12 86 4 77 4 66 4 55 13 47 24 48 24 33 36 22 50 24 58 12 76 12 83 25 94 27 98 40 94 50 99 58 98 74 88 80 84 87 74 88 66 84 60 90 46 92 38 86 34 87 30 87 26 86Z', w, h).sp }) },
  sun: {
    n: 'Matahari', g: 'basic', p: [], f: (w, h) => {
      const sp = [ell(w / 2, h / 2, w * .22, h * .22)];
      for (let i = 0; i < 12; i++) {
        const a = i * Math.PI / 6, b = .06;
        sp.push(poly([[.5 + .3 * Math.cos(a - b), .5 + .3 * Math.sin(a - b)], [.5 + .5 * Math.cos(a), .5 + .5 * Math.sin(a)], [.5 + .3 * Math.cos(a + b), .5 + .3 * Math.sin(a + b)]].map(([x, y]) => [x * w, y * h])));
      }
      return { sp };
    }
  },
  arch: { n: 'Lengkung', g: 'basic', p: [.25], f: (w, h, p) => { const t = Math.min(w, h) * p[0]; const o = arcNodes(w / 2, h, w / 2, h, Math.PI, 2 * Math.PI), i = reverseSub({ c: false, n: arcNodes(w / 2, h, w / 2 - t, h - t, Math.PI, 2 * Math.PI) }).n; return { sp: [{ c: true, n: [...o, ...i] }] }; }, hd: insetHd(0, .02, .49) },
  // Arrows
  arrowR: { n: 'Panah kanan', g: 'arrows', p: [.5, .35], f: (w, h, p) => ({ sp: [poly(arrowR(w, h, p[0], p[1]))] }), hd: arrowHd(false) },
  arrowL: { n: 'Panah kiri', g: 'arrows', p: [.5, .35], f: (w, h, p) => ({ sp: [poly(rotPts(arrowR(w, h, p[0], p[1]), w, h, 180))] }), hd: [{ pos: (w, h, p) => [w * p[1], h * (1 - p[0]) / 2], set: (w, h, p, x, y) => { p[1] = cl(x / w, .05, .95); p[0] = cl(1 - 2 * y / h, .05, 1); } }] },
  arrowD: { n: 'Panah bawah', g: 'arrows', p: [.5, .35], f: (w, h, p) => ({ sp: [poly(rotPts(arrowR(h, w, p[0], p[1]), w, h, 90))] }), hd: [{ pos: (w, h, p) => [w * (1 - p[0]) / 2, h * (1 - p[1])], set: (w, h, p, x, y) => { p[0] = cl(1 - 2 * x / w, .05, 1); p[1] = cl(1 - y / h, .05, .95); } }] },
  arrowU: { n: 'Panah atas', g: 'arrows', p: [.5, .35], f: (w, h, p) => ({ sp: [poly(rotPts(arrowR(h, w, p[0], p[1]), w, h, 270))] }), hd: arrowHd(true) },
  arrowLR: {
    n: 'Panah kiri-kanan', g: 'arrows', p: [.45, .25], f: (w, h, p) => {
      const hx = w * p[1], y0 = h * (1 - p[0]) / 2, y1 = h - y0;
      return { sp: [poly([[0, h / 2], [hx, 0], [hx, y0], [w - hx, y0], [w - hx, 0], [w, h / 2], [w - hx, h], [w - hx, y1], [hx, y1], [hx, h]])] };
    }, hd: [{ pos: (w, h, p) => [w * p[1], h * (1 - p[0]) / 2], set: (w, h, p, x, y) => { p[1] = cl(x / w, .03, .49); p[0] = cl(1 - 2 * y / h, .05, 1); } }]
  },
  arrowUD: {
    n: 'Panah atas-bawah', g: 'arrows', p: [.45, .25], f: (w, h, p) => {
      const hy = h * p[1], x0 = w * (1 - p[0]) / 2, x1 = w - x0;
      return { sp: [poly([[w / 2, 0], [w, hy], [x1, hy], [x1, h - hy], [w, h - hy], [w / 2, h], [0, h - hy], [x0, h - hy], [x0, hy], [0, hy]])] };
    }, hd: [{ pos: (w, h, p) => [w * (1 - p[0]) / 2, h * p[1]], set: (w, h, p, x, y) => { p[1] = cl(y / h, .03, .49); p[0] = cl(1 - 2 * x / w, .05, 1); } }]
  },
  arrowQ: {
    n: 'Panah empat arah', g: 'arrows', p: [.16], f: (w, h, p) => {
      const t = p[0], q = [];
      const base = [[.5, 0], [.68, .18], [.5 + t / 2, .18], [.5 + t / 2, .5 - t / 2]];
      for (let r = 0; r < 4; r++) for (const [x, y] of base) { let X = x - .5, Y = y - .5; for (let k = 0; k < r; k++) [X, Y] = [-Y, X]; q.push([(X + .5) * w, (Y + .5) * h]); }
      return { sp: [poly(q)] };
    }, hd: [{ pos: (w, h, p) => [w * (.5 + p[0] / 2), h * .18], set: (w, h, p, x) => { p[0] = cl((x / w - .5) * 2, .04, .34); } }]
  },
  chevron: { n: 'Chevron', g: 'arrows', p: [.35], f: (w, h, p) => { const d = w * p[0]; return { sp: [poly([[0, 0], [w - d, 0], [w, h / 2], [w - d, h], [0, h], [d, h / 2]])] }; }, hd: [{ pos: (w, h, p) => [w * (1 - p[0]), 0], set: (w, h, p, x) => { p[0] = cl(1 - x / w, 0, .95); } }] },
  pentarrow: { n: 'Panah segi lima', g: 'arrows', p: [.3], f: (w, h, p) => { const d = w * p[0]; return { sp: [poly([[0, 0], [w - d, 0], [w, h / 2], [w - d, h], [0, h]])] }; }, hd: [{ pos: (w, h, p) => [w * (1 - p[0]), 0], set: (w, h, p, x) => { p[0] = cl(1 - x / w, 0, 1); } }] },
  notched: { n: 'Panah bertakik', g: 'arrows', p: [.5, .35], f: (w, h, p) => { const pts = arrowR(w, h, p[0], p[1]); pts.push([w * .14, h / 2]); return { sp: [poly(pts)] }; }, hd: arrowHd(false) },
  // Flowchart
  process: { n: 'Proses', g: 'flow', p: [], f: (w, h) => ({ sp: [rectSub(0, 0, w, h)] }) },
  altproc: { n: 'Proses alternatif', g: 'flow', p: [.17], f: (w, h, p) => rectPath({ w, h, r: Array(4).fill(Math.min(w, h) * p[0]) }), hd: insetHd(0, 0, .5) },
  decision: { n: 'Keputusan', g: 'flow', p: [], f: (w, h) => ({ sp: [poly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]])] }) },
  data: { n: 'Data', g: 'flow', p: [.2], f: (w, h, p) => ({ sp: [poly([[w * p[0], 0], [w, 0], [w * (1 - p[0]), h], [0, h]])] }), hd: xHd(0, 0, .9) },
  predef: { n: 'Proses terdefinisi', g: 'flow', p: [.12], f: (w, h, p) => ({ sp: [rectSub(0, 0, w, h)], lines: [open([[w * p[0], 0], [w * p[0], h]]), open([[w * (1 - p[0]), 0], [w * (1 - p[0]), h]])] }), hd: xHd(0, .02, .45) },
  internal: { n: 'Penyimpanan internal', g: 'flow', p: [.2], f: (w, h, p) => ({ sp: [rectSub(0, 0, w, h)], lines: [open([[w * p[0], 0], [w * p[0], h]]), open([[0, h * p[0]], [w, h * p[0]]])] }), hd: xHd(0, .02, .9) },
  document: { n: 'Dokumen', g: 'flow', p: [.12], f: (w, h, p) => ({ sp: [docWave(w, h, p[0])] }), hd: yHd(0, 0, .3, 0) },
  multidoc: {
    n: 'Multidokumen', g: 'flow', p: [.1], f: (w, h, p) => {
      const o = .08;
      return { sp: [docWave(w * (1 - 2 * o), h * (1 - 2 * o), p[0], w * 2 * o, 0), docWave(w * (1 - 2 * o), h * (1 - 2 * o), p[0], w * o, h * o), docWave(w * (1 - 2 * o), h * (1 - 2 * o), p[0], 0, h * 2 * o)] };
    }
  },
  terminator: { n: 'Terminator', g: 'flow', p: [], f: (w, h) => rectPath({ w, h, r: Array(4).fill(Math.min(w, h) / 2) }) },
  prep: { n: 'Persiapan', g: 'flow', p: [.2], f: (w, h, p) => ({ sp: [poly([[w * p[0], 0], [w * (1 - p[0]), 0], [w, h / 2], [w * (1 - p[0]), h], [w * p[0], h], [0, h / 2]])] }), hd: xHd(0, 0, .5) },
  manualin: { n: 'Input manual', g: 'flow', p: [.3], f: (w, h, p) => ({ sp: [poly([[0, h * p[0]], [w, 0], [w, h], [0, h]])] }), hd: yHd(0, 0, .95) },
  manualop: { n: 'Operasi manual', g: 'flow', p: [.2], f: (w, h, p) => ({ sp: [poly([[0, 0], [w, 0], [w * (1 - p[0]), h], [w * p[0], h]])] }), hd: [{ pos: (w, h, p) => [w * p[0], h], set: (w, h, p, x) => { p[0] = cl(x / w, 0, .5); } }] },
  connector: { n: 'Konektor', g: 'flow', p: [], f: (w, h) => ({ sp: [ell(w / 2, h / 2, w / 2, h / 2)] }) },
  offpage: { n: 'Konektor luar halaman', g: 'flow', p: [.25], f: (w, h, p) => ({ sp: [poly([[0, 0], [w, 0], [w, h * (1 - p[0])], [w / 2, h], [0, h * (1 - p[0])]])] }), hd: [{ pos: (w, h, p) => [w, h * (1 - p[0])], set: (w, h, p, x, y) => { p[0] = cl(1 - y / h, 0, 1); } }] },
  card: { n: 'Kartu', g: 'flow', p: [.25], f: (w, h, p) => { const d = Math.min(w, h) * p[0]; return { sp: [poly([[d, 0], [w, 0], [w, h], [0, h], [0, d]])] }; }, hd: insetHd(0, 0, 1) },
  tape: {
    n: 'Pita berlubang', g: 'flow', p: [.1], f: (w, h, p) => {
      const a = h * p[0];
      return { sp: [{ c: true, n: [N(0, a, 0, a, w * .25, a - a * 2.4), N(w, a, w * .75, a + a * 2.4, w, a), N(w, h - a, w, h - a, w * .75, h - a + a * 2.4), N(0, h - a, w * .25, h - a - a * 2.4, 0, h - a)] }] };
    }, hd: yHd(0, 0, .3)
  },
  summing: { n: 'Penjumlahan', g: 'flow', p: [], f: (w, h) => { const k = .3536; return { sp: [ell(w / 2, h / 2, w / 2, h / 2)], lines: [open([[w * (.5 - k), h * (.5 - k)], [w * (.5 + k), h * (.5 + k)]]), open([[w * (.5 + k), h * (.5 - k)], [w * (.5 - k), h * (.5 + k)]])] }; } },
  or: { n: 'Atau', g: 'flow', p: [], f: (w, h) => ({ sp: [ell(w / 2, h / 2, w / 2, h / 2)], lines: [open([[w / 2, 0], [w / 2, h]]), open([[0, h / 2], [w, h / 2]])] }) },
  collate: { n: 'Susun', g: 'flow', p: [], f: (w, h) => ({ sp: [poly([[0, 0], [w, 0], [0, h], [w, h]])] }) },
  sort: { n: 'Urutkan', g: 'flow', p: [], f: (w, h) => ({ sp: [poly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]])], lines: [open([[0, h / 2], [w, h / 2]])] }) },
  extract: { n: 'Ekstrak', g: 'flow', p: [], f: (w, h) => ({ sp: [poly([[w / 2, 0], [w, h], [0, h]])] }) },
  merge: { n: 'Gabung', g: 'flow', p: [], f: (w, h) => ({ sp: [poly([[0, 0], [w, 0], [w / 2, h]])] }) },
  stored: {
    n: 'Data tersimpan', g: 'flow', p: [.17], f: (w, h, p) => {
      const d = w * p[0], k = d * 1.33;
      return { sp: [{ c: true, n: [N(d, 0, d - k, h * .22, d, 0), N(w, 0, w, 0, w - k, h * .22), N(w, h, w - k, h * .78, w, h), N(d, h, d, h, d - k, h * .78)] }] };
    }, hd: xHd(0, .02, .45)
  },
  delay: { n: 'Penundaan', g: 'flow', p: [], f: (w, h) => { const r = Math.min(w / 2, h / 2); const arc = arcNodes(w - r, h / 2, r, h / 2, -Math.PI / 2, Math.PI / 2); return { sp: [{ c: true, n: [N(0, 0), ...arc, N(0, h)] }] }; } },
  disk: { n: 'Disk magnetik', g: 'flow', p: [.14], f: (w, h, p) => PS.cylinder.f(w, h, p), hd: yHd(0, .02, .5) },
  display: { n: 'Tampilan', g: 'flow', p: [], f: (w, h) => { const r = w * .16; const arc = arcNodes(w - r, h / 2, r, h / 2, -Math.PI / 2, Math.PI / 2); return { sp: [{ c: true, n: [N(w * .16, 0), ...arc, N(w * .16, h), N(0, h / 2)] }] }; } },
  // Banners
  ribbon: {
    n: 'Pita', g: 'banner', p: [.18, .25], f: (w, h, p) => {
      const e = w * p[0], f = h * p[1];
      return { sp: [poly([[e, 0], [w - e, 0], [w - e, h - f], [e, h - f]]), poly([[e * .55, f], [e, f], [e, h - f], [e * .55 + e * .45, h], [0, h], [e * .5, (h + f) / 2 + f * .2]].map(x => x)), poly([[w - e, f], [w - e * .55, f], [w - e * .5, (h + f) / 2 + f * .2], [w, h], [w - e, h], [w - e, h - f]])] };
    }, hd: [{ pos: (w, h, p) => [w * p[0], 0], set: (w, h, p, x) => { p[0] = cl(x / w, .05, .45); } }, { pos: (w, h, p) => [w / 2, h * (1 - p[1])], set: (w, h, p, x, y) => { p[1] = cl(1 - y / h, .05, .6); } }]
  },
  wave: {
    n: 'Bendera gelombang', g: 'banner', p: [.12], f: (w, h, p) => {
      const a = h * p[0];
      return { sp: [{ c: true, n: [N(0, a, 0, a, w * .3, a - a * 2.6), N(w, a, w * .7, a + a * 2.6, w, a), N(w, h - a, w, h - a, w * .7, h - a + a * 2.6), N(0, h - a, w * .3, h - a - a * 2.6, 0, h - a)] }] };
    }, hd: yHd(0, 0, .3)
  },
  scroll: {
    n: 'Gulungan', g: 'banner', p: [.12], f: (w, h, p) => {
      const r = Math.min(w, h) * p[0];
      return { sp: [rectSub(r, r, w - 2 * r, h - 2 * r), ell(r, r * 1.5, r, r * 1.5 * .9), ell(w - r, h - r * 1.5, r, r * 1.5 * .9)], lines: [] };
    }, hd: insetHd(0, .02, .3)
  },
  // Callouts
  callRect: { n: 'Keterangan persegi', g: 'callout', p: [.2, 1.35], f: (w, h, p) => calloutPts(w, h, w * p[0], h * p[1], 'rect'), hd: tailHd },
  callEll: { n: 'Keterangan oval', g: 'callout', p: [.15, 1.3], f: (w, h, p) => calloutPts(w, h, w * p[0], h * p[1], 'ell'), hd: tailHd },
  callLine: { n: 'Keterangan garis', g: 'callout', p: [-.25, 1.4], f: (w, h, p) => ({ sp: [rectSub(0, 0, w, h)], lines: [open([[w * .1, h], [w * p[0], h * p[1]]])] }), hd: tailHd },
  // Stars
  star4: { n: 'Bintang 4 sudut', ...starShape(4, .38) },
  star5: { n: 'Bintang 5 sudut', ...starShape(5, .42) },
  star6: { n: 'Bintang 6 sudut', ...starShape(6, .55) },
  star8: { n: 'Bintang 8 sudut', ...starShape(8, .62) },
  star12: { n: 'Bintang 12 sudut', ...starShape(12, .72) },
  star16: { n: 'Bintang 16 sudut', ...starShape(16, .78) },
  star24: { n: 'Bintang 24 sudut', ...starShape(24, .82) },
  seal: { n: 'Segel', ...starShape(32, .9) },
  burst1: { n: 'Ledakan 1', g: 'stars', p: [], f: (w, h) => ({ sp: unitD('M50 2 58 26 80 10 74 36 98 34 80 52 98 68 72 68 80 94 58 78 48 98 40 76 18 90 24 66 2 62 20 48 4 28 28 32 22 8 42 24Z', w, h).sp }) },
  burst2: { n: 'Ledakan 2', g: 'stars', p: [], f: (w, h) => ({ sp: unitD('M6 20 34 30 40 2 54 26 74 6 72 32 98 30 80 50 96 72 70 68 74 96 54 76 38 98 34 72 6 82 22 58 2 44 24 38Z', w, h).sp }) },
};
export const PS_GROUPS = [
  ['basic', 'Bentuk Dasar', 'basic'], ['arrows', 'Bentuk Panah', 'arrows'], ['flow', 'Bentuk Diagram Alir', 'flow'],
  ['banner', 'Bentuk Spanduk', 'banner'], ['callout', 'Bentuk Keterangan', 'callout'], ['stars', 'Bentuk Bintang', 'stars'],
];
export function psPath(o) {
  const d = PS[o.sh] || PS.process;
  const r = d.f(o.w, o.h, o.p || d.p);
  return { sp: r.sp, lines: r.lines };
}

export function localPath(o) {
  switch (o.type) {
    case 'rect': return rectPath(o);
    case 'ell': return ellPath(o);
    case 'poly': return polyPath(o);
    case 'spiral': return spiralPath(o);
    case 'ps': return psPath(o);
    case 'curve': return o.p;
    default: return { sp: [rectSub(0, 0, o.w || 1, o.h || 1)] };
  }
}
export const TYPE_LABEL = {
  rect: 'Persegi Panjang', ell: 'Elips', poly: 'Poligon', star: 'Bintang', cstar: 'Bintang Kompleks', spiral: 'Spiral',
  ps: 'Bentuk Sempurna', curve: 'Kurva', text: 'Teks Artistik', ptext: 'Teks Paragraf', img: 'Bitmap', g: 'Grup',
  blend: 'Grup Campuran', dim: 'Dimensi', conn: 'Penghubung', table: 'Tabel', qr: 'Kode QR', barcode: 'Barcode',
};
export function typeLabel(o) {
  if (o.type === 'poly') return o.cs ? 'Bintang Kompleks' : o.star ? 'Bintang' : 'Poligon';
  if (o.type === 'text') return o.mode === 'para' ? 'Teks Paragraf' : 'Teks Artistik';
  if (o.type === 'ps') return (PS[o.sh]?.n) || 'Bentuk Sempurna';
  if (o.type === 'ell') return o.k === 'pie' ? 'Pai' : o.k === 'arc' ? 'Busur' : 'Elips';
  return TYPE_LABEL[o.type] || 'Objek';
}
export const isClosedType = o => !['spiral'].includes(o.type) && !(o.type === 'ell' && o.k === 'arc') && !(o.type === 'curve' && !o.p.sp.some(s => s.c));
