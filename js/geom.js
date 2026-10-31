// Geometry: affine matrices, bézier paths (nodes with in/out handles), flattening, SVG path I/O.
// Matrix m = [a,b,c,d,e,f]  →  x' = a·x + c·y + e,  y' = b·x + d·y + f   (SVG convention, y down)

export const I = () => [1, 0, 0, 1, 0, 0];
export function mul(m, n) {
  return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
}
export function inv(m) {
  const det = m[0] * m[3] - m[1] * m[2] || 1e-12;
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
}
export const ap = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
export const apv = (m, x, y) => [m[0] * x + m[2] * y, m[1] * x + m[3] * y];
export const T = (x, y) => [1, 0, 0, 1, x, y];
export const S = (sx, sy, cx = 0, cy = 0) => [sx, 0, 0, sy, cx - sx * cx, cy - sy * cy];
export function R(d, cx = 0, cy = 0) { // degrees, clockwise on screen
  const a = d * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return [c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy];
}
export function K(kx, ky, cx = 0, cy = 0) {
  const tx = Math.tan(kx * Math.PI / 180), ty = Math.tan(ky * Math.PI / 180);
  return mul(T(cx, cy), mul([1, ty, tx, 1, 0, 0], T(-cx, -cy)));
}
export const isI = m => m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0;
export const det = m => m[0] * m[3] - m[1] * m[2];
export function decompose(m) {
  const sx = Math.hypot(m[0], m[1]);
  const rot = Math.atan2(m[1], m[0]) * 180 / Math.PI;
  const dt = det(m);
  const sy = dt / (sx || 1e-12);
  const skew = Math.atan2(m[0] * m[2] + m[1] * m[3], sx * sx) * 180 / Math.PI;
  return { sx, sy, rot, skew };
}
export const msvg = m => `matrix(${m.map(v => +v.toFixed(5)).join(' ')})`;

// ---------- Paths ----------
// path = { sp: [ { c: closed, n: [ {x,y, ix,iy, ox,oy, t} ] } ] }   t: 0 cusp, 1 smooth, 2 symmetric
export const N = (x, y, ix = x, iy = y, ox = x, oy = y, t = 0) => ({ x, y, ix, iy, ox, oy, t });
export const lineSeg = (a, b) => a.ox === a.x && a.oy === a.y && b.ix === b.x && b.iy === b.y;
export const cpath = p => ({ sp: p.sp.map(s => ({ c: s.c, n: s.n.map(n => ({ ...n })) })) });

export function segsOf(sub) {
  const r = [], n = sub.n, L = n.length;
  for (let i = 0; i < L - 1; i++) r.push([n[i], n[i + 1], i]);
  if (sub.c && L > 1) r.push([n[L - 1], n[0], L - 1]);
  return r;
}
export function xformPath(p, m) {
  return {
    sp: p.sp.map(s => ({
      c: s.c, n: s.n.map(n => {
        const [x, y] = ap(m, n.x, n.y), [ix, iy] = ap(m, n.ix, n.iy), [ox, oy] = ap(m, n.ox, n.oy);
        return { x, y, ix, iy, ox, oy, t: n.t };
      })
    }))
  };
}
const fx = v => { const r = Math.round(v * 1000) / 1000; return Object.is(r, -0) ? '0' : String(r); };
export function pathD(p) {
  let d = '';
  for (const s of p.sp) {
    if (!s.n.length) continue;
    d += 'M' + fx(s.n[0].x) + ' ' + fx(s.n[0].y);
    for (const [a, b] of segsOf(s)) {
      if (s.c && b === s.n[0] && lineSeg(a, b)) continue; // closing line is implied by Z
      d += lineSeg(a, b) ? 'L' + fx(b.x) + ' ' + fx(b.y)
        : 'C' + fx(a.ox) + ' ' + fx(a.oy) + ' ' + fx(b.ix) + ' ' + fx(b.iy) + ' ' + fx(b.x) + ' ' + fx(b.y);
    }
    if (s.c) d += 'Z';
  }
  return d;
}
export function polyD(polys) {
  let d = '';
  for (const p of polys) {
    if (!p.pts.length) continue;
    d += 'M' + p.pts.map(q => fx(q[0]) + ' ' + fx(q[1])).join('L');
    if (p.c) d += 'Z';
  }
  return d;
}

// ---------- Bézier maths ----------
export function bez(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}
export function bezD(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return 3 * u * u * (p1 - p0) + 6 * u * t * (p2 - p1) + 3 * t * t * (p3 - p2);
}
export function segPoint(a, b, t) { return [bez(a.x, a.ox, b.ix, b.x, t), bez(a.y, a.oy, b.iy, b.y, t)]; }
export function segTangent(a, b, t) {
  let dx = bezD(a.x, a.ox, b.ix, b.x, t), dy = bezD(a.y, a.oy, b.iy, b.y, t);
  if (Math.hypot(dx, dy) < 1e-9) { dx = b.x - a.x; dy = b.y - a.y; }
  return [dx, dy];
}
// Splits segment a→b at t. Returns [newA_out, mid node, newB_in].
export function splitSeg(a, b, t) {
  const L = (p, q) => p + (q - p) * t;
  const x01 = L(a.x, a.ox), y01 = L(a.y, a.oy), x12 = L(a.ox, b.ix), y12 = L(a.oy, b.iy), x23 = L(b.ix, b.x), y23 = L(b.iy, b.y);
  const x012 = L(x01, x12), y012 = L(y01, y12), x123 = L(x12, x23), y123 = L(y12, y23);
  const x = L(x012, x123), y = L(y012, y123);
  const line = lineSeg(a, b);
  const mid = line ? N(x, y) : N(x, y, x012, y012, x123, y123, 1);
  return { aout: line ? [a.x, a.y] : [x01, y01], mid, bin: line ? [b.x, b.y] : [x23, y23] };
}
function extrema(p0, p1, p2, p3) {
  const a = -p0 + 3 * p1 - 3 * p2 + p3, b = 2 * (p0 - 2 * p1 + p2), c = p1 - p0, r = [];
  if (Math.abs(a) < 1e-12) { if (Math.abs(b) > 1e-12) r.push(-c / b); }
  else {
    const D = b * b - 4 * a * c;
    if (D >= 0) { const s = Math.sqrt(D); r.push((-b + s) / (2 * a), (-b - s) / (2 * a)); }
  }
  return r.filter(t => t > 0 && t < 1);
}
export function bbox(p) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x, y) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
  for (const s of p.sp) {
    if (s.n.length === 1) add(s.n[0].x, s.n[0].y);
    for (const [a, b] of segsOf(s)) {
      add(a.x, a.y); add(b.x, b.y);
      if (lineSeg(a, b)) continue;
      for (const t of extrema(a.x, a.ox, b.ix, b.x)) add(bez(a.x, a.ox, b.ix, b.x, t), bez(a.y, a.oy, b.iy, b.y, t));
      for (const t of extrema(a.y, a.oy, b.iy, b.y)) add(bez(a.x, a.ox, b.ix, b.x, t), bez(a.y, a.oy, b.iy, b.y, t));
    }
  }
  if (x0 === Infinity) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
export function unionBox(a, b) {
  if (!a) return b; if (!b) return a;
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}
export function boxPts(b) { return [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]]; }
export function xformBox(b, m) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of boxPts(b)) { const [X, Y] = ap(m, x, y); x0 = Math.min(x0, X); y0 = Math.min(y0, Y); x1 = Math.max(x1, X); y1 = Math.max(y1, Y); }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// Adaptive flattening → [{c, pts:[[x,y]...]}]
export function flatten(p, tol = 0.04) {
  const out = [];
  for (const s of p.sp) {
    if (!s.n.length) continue;
    const pts = [[s.n[0].x, s.n[0].y]];
    for (const [a, b] of segsOf(s)) {
      if (lineSeg(a, b)) pts.push([b.x, b.y]);
      else flatCubic(a.x, a.y, a.ox, a.oy, b.ix, b.iy, b.x, b.y, tol, pts, 0);
    }
    if (s.c && pts.length > 1) { const f = pts[0], l = pts[pts.length - 1]; if (Math.abs(f[0] - l[0]) < 1e-9 && Math.abs(f[1] - l[1]) < 1e-9) pts.pop(); }
    out.push({ c: s.c, pts });
  }
  return out;
}
function flatCubic(x0, y0, x1, y1, x2, y2, x3, y3, tol, pts, d) {
  const dx = x3 - x0, dy = y3 - y0, L = Math.hypot(dx, dy) || 1e-9;
  const d1 = Math.abs((x1 - x3) * dy - (y1 - y3) * dx) / L, d2 = Math.abs((x2 - x3) * dy - (y2 - y3) * dx) / L;
  const tight = L < 1e-6 ? Math.hypot(x1 - x0, y1 - y0) + Math.hypot(x2 - x0, y2 - y0) : d1 + d2;
  if (d > 12 || tight <= tol) { pts.push([x3, y3]); return; }
  const x01 = (x0 + x1) / 2, y01 = (y0 + y1) / 2, x12 = (x1 + x2) / 2, y12 = (y1 + y2) / 2, x23 = (x2 + x3) / 2, y23 = (y2 + y3) / 2;
  const xa = (x01 + x12) / 2, ya = (y01 + y12) / 2, xb = (x12 + x23) / 2, yb = (y12 + y23) / 2, xm = (xa + xb) / 2, ym = (ya + yb) / 2;
  flatCubic(x0, y0, x01, y01, xa, ya, xm, ym, tol, pts, d + 1);
  flatCubic(xm, ym, xb, yb, x23, y23, x3, y3, tol, pts, d + 1);
}
export function polysToPath(polys) {
  return { sp: polys.filter(p => p.pts.length).map(p => ({ c: p.c !== false, n: p.pts.map(q => N(q[0], q[1])) })) };
}
export function polyArea(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
  return a / 2;
}
export function inPolys(polys, x, y) { // even-odd
  let inside = false;
  for (const p of polys) {
    const q = p.pts;
    for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
      if ((q[i][1] > y) !== (q[j][1] > y) && x < (q[j][0] - q[i][0]) * (y - q[i][1]) / (q[j][1] - q[i][1]) + q[i][0]) inside = !inside;
    }
  }
  return inside;
}
export function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  let t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
export function distPolys(polys, x, y) {
  let m = Infinity;
  for (const p of polys) {
    const q = p.pts, L = q.length;
    for (let i = 0; i < L - (p.c ? 0 : 1); i++) { const a = q[i], b = q[(i + 1) % L]; m = Math.min(m, distSeg(x, y, a[0], a[1], b[0], b[1])); }
  }
  return m;
}
export function polyLen(pts, closed) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  if (closed && pts.length > 1) L += Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]);
  return L;
}
// Point + tangent angle at arc length s along a polyline.
export function polyAt(pts, s, closed) {
  const q = closed ? [...pts, pts[0]] : pts;
  if (q.length < 2) return { x: q[0]?.[0] || 0, y: q[0]?.[1] || 0, a: 0 };
  let acc = 0;
  for (let i = 1; i < q.length; i++) {
    const dx = q[i][0] - q[i - 1][0], dy = q[i][1] - q[i - 1][1], L = Math.hypot(dx, dy);
    if (acc + L >= s || i === q.length - 1) {
      const t = L ? Math.max(0, Math.min(1, (s - acc) / L)) : 0;
      return { x: q[i - 1][0] + dx * t, y: q[i - 1][1] + dy * t, a: Math.atan2(dy, dx) };
    }
    acc += L;
  }
}
export function resample(pts, n, closed) {
  const L = polyLen(pts, closed), out = [];
  if (!L) return Array.from({ length: n }, () => [pts[0][0], pts[0][1]]);
  for (let i = 0; i < n; i++) { const r = polyAt(pts, closed ? L * i / n : L * i / (n - 1), closed); out.push([r.x, r.y]); }
  return out;
}
export function centroid(pts) {
  let x = 0, y = 0;
  for (const p of pts) { x += p[0]; y += p[1]; }
  return [x / pts.length, y / pts.length];
}
export function reverseSub(s) {
  return { c: s.c, n: s.n.slice().reverse().map(n => ({ x: n.x, y: n.y, ix: n.ox, iy: n.oy, ox: n.ix, oy: n.iy, t: n.t })) };
}

// ---------- Primitive builders ----------
const K4 = 0.5522847498;
export function rectSub(x, y, w, h) { return { c: true, n: [N(x, y), N(x + w, y), N(x + w, y + h), N(x, y + h)] }; }
export function ellipseSub(cx, cy, rx, ry) {
  const kx = rx * K4, ky = ry * K4;
  return {
    c: true, n: [
      N(cx + rx, cy, cx + rx, cy - ky, cx + rx, cy + ky, 2), N(cx, cy + ry, cx + kx, cy + ry, cx - kx, cy + ry, 2),
      N(cx - rx, cy, cx - rx, cy + ky, cx - rx, cy - ky, 2), N(cx, cy - ry, cx - kx, cy - ry, cx + kx, cy - ry, 2)]
  };
}
// Elliptical arc as bézier nodes from angle a0 to a1 (radians, screen-clockwise), sweep a1>a0.
export function arcNodes(cx, cy, rx, ry, a0, a1) {
  const n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / (Math.PI / 2) - 1e-9)), da = (a1 - a0) / n, k = 4 / 3 * Math.tan(da / 4);
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + da * i, c = Math.cos(a), s = Math.sin(a);
    const x = cx + rx * c, y = cy + ry * s, tx = -rx * s * k, ty = ry * c * k;
    pts.push(N(x, y, x - tx, y - ty, x + tx, y + ty, 1));
  }
  pts[0].ix = pts[0].x; pts[0].iy = pts[0].y; pts[0].t = 0;
  const L = pts[pts.length - 1]; L.ox = L.x; L.oy = L.y; L.t = 0;
  return pts;
}

// ---------- SVG path parsing ----------
export function parseD(d) {
  const toks = String(d).match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) || [];
  const sp = [];
  let i = 0, cmd = '', cx = 0, cy = 0, sx = 0, sy = 0, lc = null, lq = null, cur = null;
  const num = () => parseFloat(toks[i++]);
  const flag = () => { // arc flags may be glued: "a1 1 0 011 1"
    const t = toks[i];
    if (t.length > 1 && /^[01]/.test(t)) { toks[i] = t.slice(1); return +t[0]; }
    i++; return +t;
  };
  const start = (x, y) => { cur = { c: false, n: [N(x, y)] }; sp.push(cur); };
  const lineTo = (x, y) => { if (!cur) start(cx, cy); cur.n.push(N(x, y)); };
  const cubTo = (x1, y1, x2, y2, x, y) => {
    if (!cur) start(cx, cy);
    const p = cur.n[cur.n.length - 1]; p.ox = x1; p.oy = y1;
    cur.n.push(N(x, y, x2, y2, x, y));
  };
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
    const ox = rel ? cx : 0, oy = rel ? cy : 0;
    if (C === 'Z') {
      if (cur) { closeSub(cur); cx = sx; cy = sy; cur = null; }
      lc = lq = null; continue;
    }
    if (i >= toks.length || /[a-zA-Z]/.test(toks[i])) { i++; continue; }
    if (C === 'M') { cx = num() + ox; cy = num() + oy; sx = cx; sy = cy; start(cx, cy); cmd = rel ? 'l' : 'L'; lc = lq = null; }
    else if (C === 'L') { cx = num() + ox; cy = num() + oy; lineTo(cx, cy); lc = lq = null; }
    else if (C === 'H') { cx = num() + ox; lineTo(cx, cy); lc = lq = null; }
    else if (C === 'V') { cy = num() + oy; lineTo(cx, cy); lc = lq = null; }
    else if (C === 'C') {
      const x1 = num() + ox, y1 = num() + oy, x2 = num() + ox, y2 = num() + oy; cx = num() + ox; cy = num() + oy;
      cubTo(x1, y1, x2, y2, cx, cy); lc = [x2, y2]; lq = null;
    } else if (C === 'S') {
      const x1 = lc ? 2 * cx - lc[0] : cx, y1 = lc ? 2 * cy - lc[1] : cy;
      const x2 = num() + ox, y2 = num() + oy; cx = num() + ox; cy = num() + oy;
      cubTo(x1, y1, x2, y2, cx, cy); lc = [x2, y2]; lq = null;
    } else if (C === 'Q' || C === 'T') {
      let qx, qy;
      if (C === 'Q') { qx = num() + ox; qy = num() + oy; } else { qx = lq ? 2 * cx - lq[0] : cx; qy = lq ? 2 * cy - lq[1] : cy; }
      const x = num() + ox, y = num() + oy;
      cubTo(cx + 2 / 3 * (qx - cx), cy + 2 / 3 * (qy - cy), x + 2 / 3 * (qx - x), y + 2 / 3 * (qy - y), x, y);
      cx = x; cy = y; lq = [qx, qy]; lc = null;
    } else if (C === 'A') {
      const rx = num(), ry = num(), ph = num(), fa = flag(), fs = flag(), x = num() + ox, y = num() + oy;
      for (const c of arcToCubics(cx, cy, rx, ry, ph, fa, fs, x, y)) cubTo(...c);
      cx = x; cy = y; lc = lq = null;
    } else i++;
  }
  return { sp: sp.filter(s => s.n.length) };
}
function closeSub(s) {
  s.c = true;
  const f = s.n[0], l = s.n[s.n.length - 1];
  if (s.n.length > 1 && Math.abs(f.x - l.x) < 1e-6 && Math.abs(f.y - l.y) < 1e-6) {
    f.ix = l.ix; f.iy = l.iy; s.n.pop();
  }
}
export function arcToCubics(x1, y1, rx, ry, phi, fa, fs, x2, y2) {
  if (!rx || !ry) return [[x1, y1, x2, y2, x2, y2]];
  rx = Math.abs(rx); ry = Math.abs(ry);
  const p = phi * Math.PI / 180, cp = Math.cos(p), s = Math.sin(p);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2, x1p = cp * dx + s * dy, y1p = -s * dx + cp * dy;
  const lam = x1p * x1p / (rx * rx) + y1p * y1p / (ry * ry);
  if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p, den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  let co = Math.sqrt(Math.max(0, num / den)); if (fa === fs) co = -co;
  const cxp = co * rx * y1p / ry, cyp = -co * ry * x1p / rx;
  const cx = cp * cxp - s * cyp + (x1 + x2) / 2, cy = s * cxp + cp * cyp + (y1 + y2) / 2;
  const ang = (ux, uy, vx, vy) => { const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); return a; };
  const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!fs && dt > 0) dt -= 2 * Math.PI; else if (fs && dt < 0) dt += 2 * Math.PI;
  const n = Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9) || 1, d = dt / n, k = 4 / 3 * Math.tan(d / 4), out = [];
  let a = t1;
  const pt = (t) => [cx + rx * Math.cos(t) * cp - ry * Math.sin(t) * s, cy + rx * Math.cos(t) * s + ry * Math.sin(t) * cp];
  const dv = (t) => [-rx * Math.sin(t) * cp - ry * Math.cos(t) * s, -rx * Math.sin(t) * s + ry * Math.cos(t) * cp];
  for (let i = 0; i < n; i++) {
    const b = a + d, [ax, ay] = pt(a), [bx, by] = pt(b), [dax, day] = dv(a), [dbx, dby] = dv(b);
    out.push([ax + k * dax, ay + k * day, bx - k * dbx, by - k * dby, bx, by]);
    a = b;
  }
  return out;
}

// Handles for smooth curves through points (Catmull–Rom → bézier).
export function smoothThrough(pts, closed, tension = 1) {
  const L = pts.length, n = [];
  for (let i = 0; i < L; i++) {
    const p = pts[i], pr = pts[closed ? (i - 1 + L) % L : Math.max(0, i - 1)], nx = pts[closed ? (i + 1) % L : Math.min(L - 1, i + 1)];
    const tx = (nx[0] - pr[0]) / 6 * tension, ty = (nx[1] - pr[1]) / 6 * tension;
    n.push(N(p[0], p[1], p[0] - tx, p[1] - ty, p[0] + tx, p[1] + ty, 1));
  }
  if (!closed && L) { n[0].ix = n[0].x; n[0].iy = n[0].y; n[0].t = 0; n[L - 1].ox = n[L - 1].x; n[L - 1].oy = n[L - 1].y; n[L - 1].t = 0; }
  return n;
}
// Uniform cubic B-spline from control points → bézier nodes.
export function bsplineNodes(cp, closed) {
  const L = cp.length;
  if (L < 3) return cp.map(p => N(p[0], p[1]));
  const P = closed ? cp : [cp[0], cp[0], ...cp, cp[L - 1], cp[L - 1]];
  const M = P.length, segs = closed ? M : M - 3, nodes = [];
  const g = i => P[((i % M) + M) % M];
  for (let i = 0; i < segs; i++) {
    const p0 = g(i), p1 = g(i + 1), p2 = g(i + 2), p3 = g(i + 3);
    const b0 = [(p0[0] + 4 * p1[0] + p2[0]) / 6, (p0[1] + 4 * p1[1] + p2[1]) / 6];
    const b1 = [(2 * p1[0] + p2[0]) / 3, (2 * p1[1] + p2[1]) / 3];
    const b2 = [(p1[0] + 2 * p2[0]) / 3, (p1[1] + 2 * p2[1]) / 3];
    const b3 = [(p1[0] + 4 * p2[0] + p3[0]) / 6, (p1[1] + 4 * p2[1] + p3[1]) / 6];
    if (!nodes.length) nodes.push(N(b0[0], b0[1]));
    const last = nodes[nodes.length - 1]; last.ox = b1[0]; last.oy = b1[1]; last.t = 1;
    if (closed && i === segs - 1) { nodes[0].ix = b2[0]; nodes[0].iy = b2[1]; nodes[0].t = 1; }
    else nodes.push(N(b3[0], b3[1], b2[0], b2[1], b3[0], b3[1], 1));
  }
  if (!closed) nodes[0].t = nodes[nodes.length - 1].t = 0;
  return nodes;
}
// Nearest point on a path: {si, seg (index), t, d, x, y}
export function nearestOnPath(p, x, y) {
  let best = { d: Infinity };
  p.sp.forEach((s, si) => {
    for (const [a, b, i] of segsOf(s)) {
      const STEPS = lineSeg(a, b) ? 1 : 40;
      let pt = [a.x, a.y];
      for (let k = 1; k <= STEPS; k++) {
        const t = k / STEPS, q = lineSeg(a, b) ? [b.x, b.y] : segPoint(a, b, t);
        const dx = q[0] - pt[0], dy = q[1] - pt[1], L = dx * dx + dy * dy;
        let u = L ? ((x - pt[0]) * dx + (y - pt[1]) * dy) / L : 0; u = Math.max(0, Math.min(1, u));
        const px = pt[0] + u * dx, py = pt[1] + u * dy, d = Math.hypot(x - px, y - py);
        if (d < best.d) best = { d, si, seg: i, t: (k - 1 + u) / STEPS, x: px, y: py };
        pt = q;
      }
    }
  });
  return best;
}
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
