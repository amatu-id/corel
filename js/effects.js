// Live effects that produce extra geometry: blend, contour, extrude, block shadow, drop shadow.
import { geom, find } from './objgeom.js';
import { flatten, polyD, resample, polyArea, centroid, bbox, pathD, polyLen, polyAt } from './geom.js';
import { offsetPolys, unionPolys, geoReady } from './bool.js';
import { lerpHex, fillColor } from './fills.js';
import { clamp, lerp, mixHex, hex2rgb, rgb2hex } from './util.js';

const closedOnly = polys => polys.filter(p => p.c && p.pts.length > 2);

// ---------- Blend ----------
function compatible(a, b) {
  if (a.sp.length !== b.sp.length) return false;
  return a.sp.every((s, i) => s.c === b.sp[i].c && s.n.length === b.sp[i].n.length);
}
function alignRing(a, b, closed) {
  if (closed && Math.sign(polyArea(a)) !== Math.sign(polyArea(b))) b = b.slice().reverse();
  if (!closed) {
    const d0 = Math.hypot(a[0][0] - b[0][0], a[0][1] - b[0][1]) + Math.hypot(a.at(-1)[0] - b.at(-1)[0], a.at(-1)[1] - b.at(-1)[1]);
    const d1 = Math.hypot(a[0][0] - b.at(-1)[0], a[0][1] - b.at(-1)[1]) + Math.hypot(a.at(-1)[0] - b[0][0], a.at(-1)[1] - b[0][1]);
    return d1 < d0 ? b.slice().reverse() : b;
  }
  const n = a.length, ca = centroid(a), cb = centroid(b);
  let best = 0, bd = Infinity;
  for (let off = 0; off < n; off += 2) {
    let d = 0;
    for (let i = 0; i < n; i += 4) { const p = a[i], q = b[(i + off) % n]; d += (p[0] - ca[0] - q[0] + cb[0]) ** 2 + (p[1] - ca[1] - q[1] + cb[1]) ** 2; }
    if (d < bd) { bd = d; best = off; }
  }
  return b.slice(best).concat(b.slice(0, best));
}
function lerpFill(fa, fb, t, dir) {
  if (!fa && !fb) return null;
  if (fa?.t === 'solid' && fb?.t === 'solid') return { t: 'solid', c: lerpHex(fa.c, fb.c, t, dir) };
  if (fa?.t === 'grad' && fb?.t === 'grad' && fa.st.length === fb.st.length && fa.g === fb.g) {
    return { ...fa, st: fa.st.map((s, i) => ({ o: lerp(s.o, fb.st[i].o, t), c: lerpHex(s.c, fb.st[i].c, t, dir), a: lerp(s.a ?? 1, fb.st[i].a ?? 1, t) })), p1: fa.p1.map((v, i) => lerp(v, fb.p1[i], t)), p2: fa.p2.map((v, i) => lerp(v, fb.p2[i], t)) };
  }
  if (!fa || !fb) { const c = fillColor(fa || fb); return t < .5 ? (fa ? { t: 'solid', c } : null) : (fb ? { t: 'solid', c } : null); }
  return { t: 'solid', c: lerpHex(fillColor(fa), fillColor(fb), t, dir) };
}
function lerpOl(a, b, t) {
  if (!a && !b) return null;
  if (!a || !b) return t < .5 ? a : b;
  return { ...a, w: lerp(a.w, b.w, t), c: lerpHex(a.c, b.c, t) };
}
export function blendSteps(o) {
  const A = o.a, B = o.b, n = clamp(o.n ?? 12, 1, 500);
  const pa = geom(A).p, out = [];
  let pb = geom(B).p;
  const comp = A.type === B.type && compatible(pa, pb) && !o.forcePoly;
  if (comp) pb = alignNodes(pa, pb);
  let pairs = null;
  if (!comp) {
    const fa = flatten(pa, .05), fb = flatten(pb, .05), M = 180, L = Math.max(fa.length, fb.length);
    pairs = [];
    for (let i = 0; i < L; i++) {
      const qa = fa[i] || fa[fa.length - 1], qb = fb[i] || fb[fb.length - 1];
      const closed = qa.c && qb.c;
      const ra = resample(qa.pts, M, closed), rb = alignRing(ra, resample(qb.pts, M, closed), closed);
      pairs.push({ c: closed, a: ra, b: rb });
    }
  }
  let along = null;
  if (o.path) {
    const t = find(o.path);
    if (t) { const f = flatten(geom(t).p, .1)[0]; if (f) along = { pts: f.pts, c: f.c, L: polyLen(f.pts, f.c) }; }
  }
  const ca = centroid(flatten(pa, .2).flatMap(q => q.pts)), cb = centroid(flatten(pb, .2).flatMap(q => q.pts));
  const acc = o.acc || 0, oacc = o.oacc || 0;
  const ease = (t, a) => a ? (a > 0 ? Math.pow(t, 1 + a / 25) : 1 - Math.pow(1 - t, 1 - a / 25)) : t;
  for (let k = 1; k <= n; k++) {
    const t0 = k / (n + 1), t = ease(t0, oacc), tc = ease(t0, acc);
    let polys;
    if (comp) {
      const sp = pa.sp.map((s, si) => ({
        c: s.c, n: s.n.map((q, ni) => {
          const r = pb.sp[si].n[ni];
          return { x: lerp(q.x, r.x, t), y: lerp(q.y, r.y, t), ix: lerp(q.ix, r.ix, t), iy: lerp(q.iy, r.iy, t), ox: lerp(q.ox, r.ox, t), oy: lerp(q.oy, r.oy, t), t: q.t };
        })
      }));
      polys = { sp };
    } else polys = pairs.map(pr => ({ c: pr.c, pts: pr.a.map((p, i) => [lerp(p[0], pr.b[i][0], t), lerp(p[1], pr.b[i][1], t)]) }));
    // rotation / path placement
    const cx = lerp(ca[0], cb[0], t), cy = lerp(ca[1], cb[1], t);
    let dx = 0, dy = 0, rot = (o.rot || 0) * t * Math.PI / 180;
    if (along) { const p = polyAt(along.pts, along.L * (along.c ? t0 : t0), along.c); dx = p.x - cx; dy = p.y - cy; if (o.rotPath) rot += p.a; }
    const tr = (x, y) => {
      let X = x - cx, Y = y - cy;
      if (rot) { const c = Math.cos(rot), s = Math.sin(rot); [X, Y] = [X * c - Y * s, X * s + Y * c]; }
      return [X + cx + dx, Y + cy + dy];
    };
    let d;
    if (comp) {
      if (rot || dx || dy) polys.sp.forEach(s => s.n.forEach(q => { [q.x, q.y] = tr(q.x, q.y); [q.ix, q.iy] = tr(q.ix, q.iy); [q.ox, q.oy] = tr(q.ox, q.oy); }));
      d = pathD(polys);
    } else d = polyD(polys.map(q => ({ c: q.c, pts: (rot || dx || dy) ? q.pts.map(([x, y]) => tr(x, y)) : q.pts })));
    out.push({ d, fill: lerpFill(A.fill, B.fill, tc, o.cd || 'direct'), ol: lerpOl(A.ol, B.ol, tc), tr: A.tr || B.tr ? { t: 'uni', v: lerp(A.tr?.v || 0, B.tr?.v || 0, tc) } : null });
  }
  if (o.loop) out.reverse();
  return out;
}

// Rotates each closed subpath of b so its nodes line up with a's (same node count)
function alignNodes(pa, pb) {
  return {
    sp: pb.sp.map((s, si) => {
      const A = pa.sp[si];
      if (!s.c || s.n.length < 3) return s;
      const ca = centroid(A.n.map(q => [q.x, q.y])), cb = centroid(s.n.map(q => [q.x, q.y])), L = s.n.length;
      let best = 0, bd = Infinity;
      for (let k = 0; k < L; k++) {
        let d = 0;
        for (let i = 0; i < L; i++) { const p = A.n[i], q = s.n[(i + k) % L]; d += (p.x - ca[0] - q.x + cb[0]) ** 2 + (p.y - ca[1] - q.y + cb[1]) ** 2; }
        if (d < bd) { bd = d; best = k; }
      }
      return { c: s.c, n: [...s.n.slice(best), ...s.n.slice(0, best)] };
    })
  };
}

// ---------- Contour ----------
export function contourRings(o) {
  const c = o.fx.ct, g = geom(o);
  if (!geoReady()) return { back: [], front: [] };
  const polys = closedOnly(flatten(g.p, .04));
  if (!polys.length) return { back: [], front: [] };
  const base = fillColor(o.fill) || '#ffffff', baseO = o.ol?.c || '#000000';
  const off = Math.max(.05, c.off || 2), back = [], front = [];
  const col = t => ({ fill: o.fill || c.fc ? lerpHex(base, c.fc || base, t, c.cd || 'direct') : null, oc: lerpHex(baseO, c.oc || baseO, t) });
  if (c.dir === 'out') {
    const n = clamp(c.n || 3, 1, 200);
    for (let k = n; k >= 1; k--) back.push({ polys: offsetPolys(polys, off * k, c.join || 'round'), ...col(k / n) });
  } else {
    const max = c.dir === 'center' ? 400 : clamp(c.n || 3, 1, 200);
    const rings = [];
    for (let k = 1; k <= max; k++) {
      const r = offsetPolys(polys, -off * k, c.join || 'round');
      if (!r.length) break;
      rings.push(r);
    }
    rings.forEach((r, i) => front.push({ polys: r, ...col((i + 1) / (c.dir === 'center' ? rings.length : clamp(c.n || 3, 1, 200))) }));
  }
  return { back, front };
}

// ---------- Extrude ----------
export function extrudeFaces(o) {
  const e = o.fx.ext, g = geom(o);
  const polys = flatten(g.p, .08).filter(p => p.pts.length > 1);
  const b = bbox(g.p), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const vp = [cx + (e.vp?.[0] ?? 40), cy + (e.vp?.[1] ?? -40)], k = clamp(e.d ?? .25, 0.01, 0.99);
  const base = e.sh === 'solid' ? (e.c1 || '#888888') : fillColor(o.fill) || e.c1 || '#888888';
  const la = (e.light ?? 225) * Math.PI / 180, L = [Math.cos(la), Math.sin(la)];
  const faces = [];
  const backs = [];
  for (const p of polys) {
    const P = p.pts, Q = P.map(([x, y]) => [x + (vp[0] - x) * k, y + (vp[1] - y) * k]);
    const ccw = polyArea(P) > 0;
    const n = P.length;
    for (let i = 0; i < n - (p.c ? 0 : 1); i++) {
      const a = P[i], bq = P[(i + 1) % n], a2 = Q[i], b2 = Q[(i + 1) % n];
      let nx = bq[1] - a[1], ny = -(bq[0] - a[0]); const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
      if (!ccw) { nx = -nx; ny = -ny; }
      const lam = clamp(nx * -L[0] + ny * -L[1], -1, 1);
      const f = e.flat ? 0.15 : 0.08 + (1 - lam) * 0.28;
      const mid = [(a[0] + bq[0]) / 2, (a[1] + bq[1]) / 2];
      faces.push({ pts: [a, bq, b2, a2], dist: Math.hypot(mid[0] - vp[0], mid[1] - vp[1]), f, mid, bmid: [(a2[0] + b2[0]) / 2, (a2[1] + b2[1]) / 2] });
    }
    if (p.c) backs.push({ c: true, pts: Q });
  }
  faces.sort((a, b) => b.dist - a.dist);
  const shade = f => e.sh === 'shade' ? null : mixHex(base, '#000000', f);
  return { faces, backs, base, shade, vp, endColor: e.c2 || mixHex(base, '#000000', .6) };
}

// ---------- Block shadow ----------
export function blockPolys(o) {
  if (!geoReady()) return [];
  const bs = o.fx.bs, g = geom(o), polys = flatten(g.p, .06).filter(p => p.pts.length > 1);
  const dx = bs.x ?? 4, dy = bs.y ?? 4, parts = [polys.filter(p => p.c).map(p => ({ c: true, pts: p.pts.map(([x, y]) => [x + dx, y + dy]) }))];
  for (const p of polys) {
    const P = p.pts, n = P.length;
    for (let i = 0; i < n - (p.c ? 0 : 1); i++) {
      const a = P[i], b = P[(i + 1) % n];
      parts.push([{ c: true, pts: [a, b, [b[0] + dx, b[1] + dy], [a[0] + dx, a[1] + dy]] }]);
    }
  }
  parts.push(polys.filter(p => p.c));
  return unionPolys(parts);
}

// Perspective drop-shadow matrix anchored at the object's bottom edge
export function shadowMatrix(o, b) {
  const s = o.fx.sh;
  if (s.k === 'persp') {
    const y0 = b.y + b.h, a = Math.tan((s.ang ?? 40) * Math.PI / 180), st = s.st ?? .5;
    return [1, 0, -a * st, st, a * st * y0 + (s.x || 0), (1 - st) * y0 + (s.y || 0)];
  }
  return [1, 0, 0, 1, s.x ?? 2, s.y ?? 2];
}
export const darker = (hx, f) => { const [r, g, b] = hex2rgb(hx); return rgb2hex(r * (1 - f), g * (1 - f), b * (1 - f)); };
