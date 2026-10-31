// Drawing tools: curves, artistic media, smart drawing, shapes, perfect shapes, tables, dimensions, connectors.
import { App } from '../app.js';
import { V } from '../view.js';
import { mk } from '../model.js';
import { geom, objBox, anchorPt } from '../objgeom.js';
import { N, T, I, mul, R, pathD, polyD, bsplineNodes, resample, nearestOnPath, segsOf, segPoint, rectSub } from '../geom.js';
import { smoothPolyline, simplifyPath } from '../bool.js';
import { PS } from '../shapes.js';
import { deep, clamp } from '../util.js';
import { S, sq, dot, wpath, wd, line, hint, setCursor, constrain, snapped, clearSnap, near } from './common.js';
import { Pick } from './pick.js';

export const TO = App.topt = {
  curve: { smooth: 50, close: true }, media: { preset: 'taper', w: 4, smooth: 50, nib: 45, c: '#000000' },
  rect: { r: 0, ct: 'round' }, ell: { k: 'e', a0: 0, a1: 270 }, poly: { n: 5 }, star: { n: 5, sharp: 53 }, cstar: { n: 9, k: 2 },
  graph: { rows: 4, cols: 4 }, spiral: { rev: 4, log: false, ex: 100 },
  ps: { g: 'basic', basic: 'heart', arrows: 'arrowR', flow: 'process', banner: 'ribbon', callout: 'callRect', stars: 'star5' },
  table: { rows: 3, cols: 3 }, dim: { dec: 1, sz: 8, su: true }, conn: { k: 's' },
};
const pxw = px => px / V.z;
const selOverlay = () => Pick.overlay.call({ ...Pick, drag: null, mode: 'scale', syncMode() { } });
const finishCreate = (o, label) => { App.add(o, label); hint('Objek dibuat · Tekan Spasi untuk Alat Pilih'); };
const mkCurve = (sp, extra = {}) => mk('curve', { p: { sp }, ...extra });

// ---------- Drag-box base ----------
function boxFrom(d, ev) {
  let [x0, y0] = d.p0, [x1, y1] = d.p1;
  if (ev.mod) { const s = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); x1 = x0 + Math.sign(x1 - x0 || 1) * s; y1 = y0 + Math.sign(y1 - y0 || 1) * s; }
  if (ev.shift) { x0 = 2 * d.p0[0] - x1; y0 = 2 * d.p0[1] - y1; }
  return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
}
function boxTool(id, name, build, help) {
  return {
    id, name, cursor: 'crosshair',
    activate() { setCursor('crosshair'); hint(help || 'Seret untuk menggambar · ⌘/Ctrl sama sisi · Shift dari tengah'); },
    down(ev) { this.d = { p0: snapped(ev), p1: snapped(ev) }; },
    move(ev) { if (!ev.down) { snapped(ev); App.overlay(); return; } if (!this.d) return; this.d.p1 = snapped(ev); this.d.ev = ev; this.d.b = boxFrom(this.d, ev); this.d.tmp = this.d.b.w > 0 && this.d.b.h > 0 ? build(this.d.b, ev) : null; App.overlay(); },
    up(ev) {
      const d = this.d; this.d = null; clearSnap();
      if (!d?.b || d.b.w * V.z < 2 || d.b.h * V.z < 2) { const o = V.hit(ev); if (o) App.select(o); App.overlay(); return; }
      const o = build(d.b, ev);
      finishCreate(o, 'Buat ' + name.replace('Alat ', ''));
    },
    overlay() {
      let s = selOverlay();
      if (this.d?.tmp) for (const p of tmpPaths(this.d.tmp)) s += wpath(p, 'pv');
      return s;
    },
  };
}
function tmpPaths(o) {
  if (o.type === 'g') return o.ch.flatMap(tmpPaths);
  const g = geom(o);
  return g.lines ? [g.p, g.lines] : [g.p];
}
const at = b => T(b.x, b.y);

export const Rect = boxTool('rect', 'Alat Persegi Panjang', b => mk('rect', { w: b.w, h: b.h, r: Array(4).fill(TO.rect.r), ct: TO.rect.ct, tf: at(b) }));
export const Ellipse = boxTool('ellipse', 'Alat Elips', b => mk('ell', { w: b.w, h: b.h, k: TO.ell.k, a0: TO.ell.a0, a1: TO.ell.a1, tf: at(b) }));
export const Polygon = boxTool('polygon', 'Alat Poligon', b => mk('poly', { w: b.w, h: b.h, n: TO.poly.n, tf: at(b) }));
export const Star = boxTool('star', 'Alat Bintang', b => mk('poly', { w: b.w, h: b.h, n: TO.star.n, star: true, ir: clamp(1 - TO.star.sharp / 100, .03, .97), tf: at(b) }));
export const CStar = boxTool('cstar', 'Alat Bintang Kompleks', b => mk('poly', { w: b.w, h: b.h, n: TO.cstar.n, cs: true, k: TO.cstar.k, tf: at(b) }));
export const Spiral = boxTool('spiral', 'Alat Spiral', b => mk('spiral', { w: b.w, h: b.h, rev: TO.spiral.rev, log: TO.spiral.log, ex: TO.spiral.ex, fill: null, tf: at(b) }));
export const Graph = boxTool('graph', 'Alat Kertas Grafik', b => {
  const { rows, cols } = TO.graph, cw = b.w / cols, rh = b.h / rows, ch = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) ch.push(mk('rect', { w: cw, h: rh, tf: T(b.x + c * cw, b.y + r * rh) }));
  return mk('g', { ch, name: 'Kertas Grafik' });
});
export const Shapes = boxTool('shapes', 'Alat Bentuk Sempurna', b => {
  const sh = TO.ps[TO.ps.g] || 'process';
  return mk('ps', { sh, w: b.w, h: b.h, p: deep(PS[sh]?.p || []), tf: at(b) });
}, 'Seret untuk menggambar bentuk · Pilih bentuk di bilah properti · Seret ◆ merah untuk mengubah bentuk');
export const Table = boxTool('table', 'Alat Tabel', b => {
  const { rows, cols } = TO.table;
  return mk('table', { w: b.w, h: b.h, cw: Array(cols).fill(b.w / cols), rh: Array(rows).fill(b.h / rows), cells: Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ t: '' }))), ol: { w: .25, c: '#000000' }, sz: 9, font: 'Arial', fill: null, tf: at(b) });
}, 'Seret untuk membuat tabel · Dobel klik sel dengan Alat Pilih untuk mengetik');

// ---------- 3-point rectangle / ellipse ----------
function threePoint(id, name, make) {
  return {
    id, name,
    activate() { setCursor('crosshair'); hint('Seret untuk garis dasar, lalu gerakkan untuk tinggi dan klik'); },
    down(ev) {
      const p = snapped(ev);
      if (this.st?.phase === 1) { const o = make(this.st.a, this.st.b, p); this.st = null; if (o) finishCreate(o, 'Buat ' + name); return; }
      this.st = { phase: 0, a: p, b: p };
    },
    move(ev) {
      const p = snapped(ev);
      if (!this.st) { App.overlay(); return; }
      if (this.st.phase === 0 && ev.down) this.st.b = ev.mod ? constrain(...this.st.a, ...p) : p;
      if (this.st.phase === 1) this.st.c = p;
      App.overlay();
    },
    up() { if (this.st?.phase === 0) { if (Math.hypot(this.st.b[0] - this.st.a[0], this.st.b[1] - this.st.a[1]) * V.z < 3) this.st = null; else this.st.phase = 1; } },
    key(e) { if (e.key === 'Escape' && this.st) { this.st = null; App.overlay(); return true; } },
    overlay() {
      let s = selOverlay();
      if (!this.st) return s;
      s += line(S(...this.st.a), S(...this.st.b), 'ln acc');
      if (this.st.phase === 1 && this.st.c) { const o = make(this.st.a, this.st.b, this.st.c); if (o) s += wpath(geom(o).p, 'pv'); }
      return s;
    },
  };
}
function frame3(a, b, c) { // origin a, x-axis a→b, height = signed distance of c
  const dx = b[0] - a[0], dy = b[1] - a[1], w = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
  const h = ((c[0] - a[0]) * -dy + (c[1] - a[1]) * dx) / (w || 1);
  return { w, h, ang, a };
}
export const Rect3 = threePoint('rect3', 'Persegi Panjang 3 Titik', (a, b, c) => {
  const f = frame3(a, b, c); if (Math.abs(f.h) < 1e-3) return null;
  const tf = mul(T(a[0], a[1]), mul(R(f.ang * 180 / Math.PI), f.h < 0 ? T(0, f.h) : I()));
  return mk('rect', { w: f.w, h: Math.abs(f.h), r: Array(4).fill(TO.rect.r), ct: TO.rect.ct, tf });
});
export const Ellipse3 = threePoint('ellipse3', 'Elips 3 Titik', (a, b, c) => {
  const f = frame3(a, b, c); if (Math.abs(f.h) < 1e-3) return null;
  const H = Math.abs(f.h) * 2;
  const tf = mul(T(a[0], a[1]), mul(R(f.ang * 180 / Math.PI), T(0, -H / 2)));
  return mk('ell', { w: f.w, h: H, k: TO.ell.k, a0: TO.ell.a0, a1: TO.ell.a1, tf });
});

// ---------- Freehand / 2-point line ----------
function polyFromStroke(pts, closed) {
  const tol = (0.4 + TO.curve.smooth / 100 * 5.5) / V.z;
  const p = smoothPolyline(pts, closed, tol);
  if (p) return p;
  return { sp: [{ c: closed, n: pts.map(q => N(q[0], q[1])) }] };
}
export const Freehand = {
  id: 'freehand', name: 'Alat Tangan Bebas',
  activate() { setCursor('crosshair'); hint('Seret untuk menggambar bebas · Klik, klik untuk garis lurus · Kehalusan di bilah properti'); this.ls = null; },
  down(ev) { this.pts = [snapped(ev)]; this.drag = false; },
  move(ev) {
    if (ev.down && this.pts) { const l = this.pts[this.pts.length - 1]; if (Math.hypot(ev.x - l[0], ev.y - l[1]) * V.z > 1.2) { this.pts.push([ev.x, ev.y]); this.drag = true; } }
    else if (this.ls) this.hov = ev.mod ? constrain(...this.ls, ...snapped(ev)) : snapped(ev);
    App.overlay();
  },
  up(ev) {
    clearSnap();
    if (!this.pts) return;
    if (!this.drag) {
      const p = this.pts[0];
      if (this.ls) { const e = ev.mod ? constrain(...this.ls, ...p) : p; if (Math.hypot(e[0] - this.ls[0], e[1] - this.ls[1]) * V.z > 2) finishCreate(mkCurve([{ c: false, n: [N(...this.ls), N(...e)] }]), 'Buat garis'); this.ls = null; }
      else this.ls = p;
      this.pts = null; return;
    }
    const pts = this.pts; this.pts = null;
    const first = pts[0], last = snapped(ev);
    pts.push(last);
    const closed = TO.curve.close && Math.hypot(last[0] - first[0], last[1] - first[1]) * V.z < 10 && pts.length > 6;
    if (closed) pts.pop();
    const p = polyFromStroke(pts, closed);
    finishCreate(mk('curve', { p }), 'Buat kurva bebas');
  },
  key(e) { if (e.key === 'Escape' && this.ls) { this.ls = null; App.overlay(); return true; } },
  overlay() {
    let s = selOverlay();
    if (this.pts?.length > 1) s += `<path class="pv" d="M${this.pts.map(p => S(...p).map(v => v.toFixed(1)).join(' ')).join('L')}"/>`;
    if (this.ls && this.hov) s += line(S(...this.ls), S(...this.hov), 'pv');
    return s;
  },
};
export const Line2 = {
  id: 'line2', name: 'Alat Garis 2 Titik',
  activate() { setCursor('crosshair'); hint('Seret untuk membuat garis lurus · ⌘/Ctrl kelipatan 15°'); },
  down(ev) { this.a = snapped(ev); this.b = this.a; },
  move(ev) { if (ev.down && this.a) { const p = snapped(ev); this.b = ev.mod ? constrain(...this.a, ...p) : p; } else snapped(ev); App.overlay(); },
  up() { clearSnap(); if (this.a && Math.hypot(this.b[0] - this.a[0], this.b[1] - this.a[1]) * V.z > 2) finishCreate(mkCurve([{ c: false, n: [N(...this.a), N(...this.b)] }]), 'Buat garis'); this.a = null; },
  overlay() { let s = selOverlay(); if (this.a) s += line(S(...this.a), S(...this.b), 'pv'); return s; },
};

// ---------- Bézier & Pen ----------
function penTool(id, name, preview) {
  return {
    id, name,
    activate() { setCursor('crosshair'); this.nodes = null; hint('Klik untuk node sudut · Seret untuk node mulus · Klik node awal untuk menutup · Dobel klik / Enter selesai · ⌫ hapus node terakhir'); },
    deactivate() { this.finish(); },
    down(ev) {
      const p = snapped(ev);
      if (this.nodes?.length > 1 && near(ev, S(this.nodes[0].x, this.nodes[0].y), 7)) { this.finish(true); return; }
      if (!this.nodes) this.nodes = [];
      const n = N(...p); this.nodes.push(n); this.dn = n;
    },
    move(ev) {
      const p = snapped(ev);
      if (ev.down && this.dn) {
        const n = this.dn; let q = ev.mod ? constrain(n.x, n.y, ...p) : p;
        if (Math.hypot(q[0] - n.x, q[1] - n.y) * V.z > 2) { n.ox = q[0]; n.oy = q[1]; n.ix = 2 * n.x - q[0]; n.iy = 2 * n.y - q[1]; n.t = 2; if (ev.alt) { n.ix = n.x; n.iy = n.y; n.t = 0; } }
      }
      this.hov = this.nodes?.length && !ev.down ? (ev.mod ? constrain(this.nodes.at(-1).x, this.nodes.at(-1).y, ...p) : p) : null;
      App.overlay();
    },
    up() { this.dn = null; clearSnap(); },
    dbl() { if (this.nodes?.length > 2) { this.nodes.pop(); } this.finish(); },
    key(e) {
      if (!this.nodes) return false;
      if (e.key === 'Enter' || e.key === 'Escape') { this.finish(); return true; }
      if (e.key === 'Backspace' || e.key === 'Delete') { this.nodes.pop(); if (!this.nodes.length) this.nodes = null; App.overlay(); return true; }
    },
    finish(close = false) {
      const n = this.nodes; this.nodes = null; this.hov = null;
      if (!n || n.length < 2) { App.overlay(); return; }
      if (!close) { n[0].ix = n[0].x; n[0].iy = n[0].y; const l = n[n.length - 1]; l.ox = l.x; l.oy = l.y; }
      finishCreate(mkCurve([{ c: close, n }]), 'Buat kurva Bézier');
    },
    overlay() {
      let s = selOverlay();
      const n = this.nodes;
      if (!n?.length) return s;
      const sp = [{ c: false, n: n.map(q => ({ ...q })) }];
      if (preview && this.hov) sp[0].n.push(N(...this.hov));
      if (sp[0].n.length > 1) s += wpath({ sp }, 'pv');
      if (!preview && this.hov) s += line(S(n.at(-1).x, n.at(-1).y), S(...this.hov), 'ln dim');
      for (const q of n) {
        const p = S(q.x, q.y);
        if (q.t) { s += line(S(q.ix, q.iy), S(q.ox, q.oy), 'hl') + dot(...S(q.ix, q.iy), 'hd', 2.6) + dot(...S(q.ox, q.oy), 'hd', 2.6); }
        s += sq(p[0], p[1], q === n[0] ? 'n first' : 'n', 3);
      }
      return s;
    },
  };
}
export const Bezier = penTool('bezier', 'Alat Bézier', false);
export const Pen = penTool('pen', 'Alat Pena', true);

// ---------- B-spline & polyline ----------
export const BSpline = {
  id: 'bspline', name: 'Alat B-Spline',
  activate() { setCursor('crosshair'); this.cp = null; hint('Klik untuk titik kendali · Klik titik awal untuk menutup · Dobel klik / Enter selesai'); },
  deactivate() { this.finish(); },
  down(ev) {
    const p = snapped(ev);
    if (this.cp?.length > 2 && near(ev, S(...this.cp[0]), 7)) return this.finish(true);
    (this.cp ||= []).push(p);
  },
  move(ev) { this.hov = snapped(ev); App.overlay(); },
  up() { clearSnap(); },
  dbl() { if (this.cp?.length > 3) this.cp.pop(); this.finish(); },
  key(e) { if (this.cp && (e.key === 'Enter' || e.key === 'Escape')) { this.finish(); return true; } if (this.cp && e.key === 'Backspace') { this.cp.pop(); App.overlay(); return true; } },
  finish(closed = false) {
    const cp = this.cp; this.cp = null;
    if (!cp || cp.length < 2) { App.overlay(); return; }
    finishCreate(mkCurve([{ c: closed, n: bsplineNodes(cp, closed) }]), 'Buat B-spline');
  },
  overlay() {
    let s = selOverlay();
    if (!this.cp) return s;
    const cp = this.hov ? [...this.cp, this.hov] : this.cp;
    s += `<path class="ln dim" d="M${cp.map(p => S(...p).join(' ')).join('L')}"/>`;
    if (cp.length > 2) s += wpath({ sp: [{ c: false, n: bsplineNodes(cp, false) }] }, 'pv');
    for (const p of this.cp) s += dot(...S(...p), 'hd', 3);
    return s;
  },
};
export const Polyline = {
  id: 'polyline', name: 'Alat Polilinia',
  activate() { setCursor('crosshair'); this.pts = null; hint('Klik untuk segmen lurus · Seret untuk bebas · Dobel klik / Enter selesai'); },
  deactivate() { this.finish(); },
  down(ev) {
    const p = snapped(ev);
    if (this.pts?.length > 2 && near(ev, S(...this.pts[0]), 7)) return this.finish(true);
    (this.pts ||= []).push(p); this.drawing = true;
  },
  move(ev) {
    const p = snapped(ev);
    if (ev.down && this.pts) { const l = this.pts.at(-1); if (Math.hypot(p[0] - l[0], p[1] - l[1]) * V.z > 2) this.pts.push(p); }
    this.hov = this.pts && !ev.down ? (ev.mod ? constrain(...this.pts.at(-1), ...p) : p) : null;
    App.overlay();
  },
  up() { clearSnap(); },
  dbl() { this.finish(); },
  key(e) { if (this.pts && (e.key === 'Enter' || e.key === 'Escape')) { this.finish(); return true; } if (this.pts && e.key === 'Backspace') { this.pts.pop(); App.overlay(); return true; } },
  finish(closed = false) {
    const pts = this.pts; this.pts = null;
    if (!pts || pts.length < 2) { App.overlay(); return; }
    const clean = pts.filter((p, i) => !i || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 1e-6);
    finishCreate(mkCurve([{ c: closed, n: clean.map(q => N(...q)) }]), 'Buat polilinia');
  },
  overlay() {
    let s = selOverlay();
    if (!this.pts) return s;
    const pts = this.hov ? [...this.pts, this.hov] : this.pts;
    s += `<path class="pv" d="M${pts.map(p => S(...p).map(v => v.toFixed(1)).join(' ')).join('L')}"/>`;
    return s;
  },
};
export const Curve3 = {
  id: 'curve3', name: 'Alat Kurva 3 Titik',
  activate() { setCursor('crosshair'); hint('Seret dari titik awal ke titik akhir, lalu gerakkan untuk kelengkungan dan klik'); },
  down(ev) {
    const p = snapped(ev);
    if (this.st?.ph === 1) { const o = mkCurve([this.sub(p)]); this.st = null; finishCreate(o, 'Buat kurva 3 titik'); return; }
    this.st = { ph: 0, a: p, b: p };
  },
  move(ev) { const p = snapped(ev); if (this.st?.ph === 0 && ev.down) this.st.b = p; if (this.st?.ph === 1) this.st.c = p; App.overlay(); },
  up() { if (this.st?.ph === 0) { if (Math.hypot(this.st.b[0] - this.st.a[0], this.st.b[1] - this.st.a[1]) * V.z < 3) this.st = null; else { this.st.ph = 1; this.st.c = this.st.b; } } },
  sub(c) {
    const { a, b } = this.st, q = [2 * c[0] - (a[0] + b[0]) / 2, 2 * c[1] - (a[1] + b[1]) / 2];
    return { c: false, n: [N(a[0], a[1], a[0], a[1], a[0] + 2 / 3 * (q[0] - a[0]), a[1] + 2 / 3 * (q[1] - a[1])), N(b[0], b[1], b[0] + 2 / 3 * (q[0] - b[0]), b[1] + 2 / 3 * (q[1] - b[1]), b[0], b[1])] };
  },
  key(e) { if (e.key === 'Escape' && this.st) { this.st = null; App.overlay(); return true; } },
  overlay() {
    let s = selOverlay();
    if (!this.st) return s;
    if (this.st.ph === 0) s += line(S(...this.st.a), S(...this.st.b), 'pv');
    else s += wpath({ sp: [this.sub(this.st.c)] }, 'pv');
    return s;
  },
};

// ---------- Artistic media ----------
export const MEDIA = {
  taper: { n: 'Meruncing kedua ujung', f: t => Math.pow(Math.sin(Math.PI * t), .55) },
  wedge: { n: 'Baji', f: t => 1 - t * .96 },
  tear: { n: 'Tetesan', f: t => t < .82 ? .15 + .85 * Math.sin(t / .82 * Math.PI / 2) : Math.sqrt(Math.max(0, 1 - ((t - .82) / .18) ** 2)) },
  swell: { n: 'Membesar di tengah', f: t => .35 + .65 * Math.sin(Math.PI * t) },
  ribbon: { n: 'Pita rata', f: () => 1, cap: true },
  brush: { n: 'Kuas kering', f: t => (.55 + .45 * Math.sin(Math.PI * t)) * (.8 + .2 * Math.sin(t * 40)) },
  callig: { n: 'Kaligrafi (pena miring)', f: () => 1, callig: true },
};
function chaikin(pts, it = 2) {
  for (let k = 0; k < it; k++) {
    const o = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; o.push([.75 * a[0] + .25 * b[0], .75 * a[1] + .25 * b[1]], [.25 * a[0] + .75 * b[0], .25 * a[1] + .75 * b[1]]); }
    o.push(pts[pts.length - 1]); pts = o;
  }
  return pts;
}
export function strokeShape(pts, opt = TO.media) {
  if (pts.length < 2) return null;
  const pr = MEDIA[opt.preset] || MEDIA.taper, W = opt.w;
  let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const n = clamp(Math.round(L / Math.max(.25, W / 4)), 8, 900);
  const P = chaikin(resample(pts, n, false), 2), M = P.length, left = [], right = [];
  const nib = (opt.nib ?? 45) * Math.PI / 180;
  for (let i = 0; i < M; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(M - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    let w = W / 2 * pr.f(i / (M - 1));
    if (pr.callig) w = W / 2 * (.12 + .88 * Math.abs(Math.sin(Math.atan2(ty, tx) - nib)));
    left.push([P[i][0] - ty * w, P[i][1] + tx * w]); right.push([P[i][0] + ty * w, P[i][1] - tx * w]);
  }
  let ring = [...left, ...right.reverse()];
  if (pr.cap) { // rounded ends
    const cap = (c, a0) => { const r = []; for (let k = 1; k < 8; k++) { const t = a0 + Math.PI * k / 8; r.push([c[0] + Math.cos(t) * W / 2, c[1] + Math.sin(t) * W / 2]); } return r; };
    const e = P[M - 1], pe = P[M - 2], s = P[0], ps = P[1];
    const ae = Math.atan2(e[1] - pe[1], e[0] - pe[0]) + Math.PI / 2, as = Math.atan2(s[1] - ps[1], s[0] - ps[0]) + Math.PI / 2;
    ring = [...left, ...cap(e, ae - Math.PI)].concat(right, cap(s, as - Math.PI));
  }
  const smooth = smoothPolyline(ring, true, Math.max(.02, W * .04 * (.3 + opt.smooth / 100)));
  return smooth || { sp: [{ c: true, n: ring.map(q => N(...q)) }] };
}
export const Media = {
  id: 'media', name: 'Alat Media Artistik',
  activate() { setCursor('crosshair'); hint('Seret untuk menggoreskan kuas · Pilih gaya, lebar dan kehalusan di bilah properti'); },
  down(ev) { this.pts = [[ev.x, ev.y]]; },
  move(ev) { if (ev.down && this.pts) { const l = this.pts.at(-1); if (Math.hypot(ev.x - l[0], ev.y - l[1]) * V.z > 1.5) this.pts.push([ev.x, ev.y]); App.overlay(); } },
  up() {
    const pts = this.pts; this.pts = null;
    if (!pts || pts.length < 3) return App.overlay();
    const raw = smoothPolyline(pts, false, (0.5 + TO.media.smooth / 100 * 4) / V.z);
    const flat = raw ? resample(polyOfPath(raw), Math.max(12, pts.length), false) : pts;
    const p = strokeShape(flat);
    if (p) finishCreate(mk('curve', { p, fill: { t: 'solid', c: TO.media.c || '#000000' }, ol: null, name: 'Media Artistik' }), 'Goresan media artistik');
  },
  overlay() {
    let s = selOverlay();
    if (this.pts?.length > 2) { const p = strokeShape(this.pts); if (p) s += wd(pathD(p), 'pvf'); }
    return s;
  },
};
function polyOfPath(p) { const out = []; for (const s of p.sp) for (const [a, b] of segsOf(s)) { for (let k = 0; k <= 8; k++) out.push(segPoint(a, b, k / 8)); } return out; }

// ---------- Smart drawing ----------
function dp(pts, eps) { // Douglas–Peucker
  if (pts.length < 3) return pts;
  let dmax = 0, idx = 0;
  const [a, b] = [pts[0], pts[pts.length - 1]], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  for (let i = 1; i < pts.length - 1; i++) { const d = Math.abs((b[1] - a[1]) * pts[i][0] - (b[0] - a[0]) * pts[i][1] + b[0] * a[1] - b[1] * a[0]) / L; if (d > dmax) { dmax = d; idx = i; } }
  if (dmax > eps) return [...dp(pts.slice(0, idx + 1), eps).slice(0, -1), ...dp(pts.slice(idx), eps)];
  return [a, b];
}
export const Smart = {
  id: 'smart', name: 'Alat Gambar Cerdas',
  activate() { setCursor('crosshair'); hint('Gambar bentuk kasar — persegi, elips, segitiga dan garis dikenali otomatis'); },
  down(ev) { this.pts = [[ev.x, ev.y]]; },
  move(ev) { if (ev.down && this.pts) { this.pts.push([ev.x, ev.y]); App.overlay(); } },
  up() {
    const pts = this.pts; this.pts = null;
    if (!pts || pts.length < 4) return App.overlay();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const w = x1 - x0, h = y1 - y0, size = Math.max(w, h), first = pts[0], last = pts.at(-1);
    const closed = Math.hypot(last[0] - first[0], last[1] - first[1]) < size * .22;
    const simp = dp(closed ? [...pts, first] : pts, size * .09);
    let o;
    if (!closed) {
      if (simp.length === 2) o = mkCurve([{ c: false, n: [N(...first), N(...last)] }]);
      else o = mk('curve', { p: polyFromStroke(pts, false) });
    } else {
      const corners = simp.length - 1;
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const rv = pts.map(([x, y]) => Math.hypot((x - cx) / (w / 2 || 1), (y - cy) / (h / 2 || 1)));
      const mean = rv.reduce((a, b) => a + b, 0) / rv.length, dev = Math.sqrt(rv.reduce((a, b) => a + (b - mean) ** 2, 0) / rv.length);
      if (dev < .12 && corners > 4) o = mk('ell', { w, h, tf: T(x0, y0) });
      else if (corners === 4) {
        const axis = simp.slice(0, 4).every((p, i) => { const q = simp[i + 1]; const a = Math.abs(Math.atan2(q[1] - p[1], q[0] - p[0])) % (Math.PI / 2); return a < .3 || a > Math.PI / 2 - .3; });
        o = axis ? mk('rect', { w, h, tf: T(x0, y0) }) : mkCurve([{ c: true, n: simp.slice(0, 4).map(q => N(...q)) }]);
      } else if (corners === 3) o = mkCurve([{ c: true, n: simp.slice(0, 3).map(q => N(...q)) }]);
      else if (corners <= 8 && corners > 4) o = mkCurve([{ c: true, n: simp.slice(0, -1).map(q => N(...q)) }]);
      else o = mk('curve', { p: polyFromStroke(pts, true) });
    }
    finishCreate(o, 'Gambar cerdas');
  },
  overlay() { let s = selOverlay(); if (this.pts?.length > 1) s += `<path class="pv" d="M${this.pts.map(p => S(...p).map(v => v.toFixed(1)).join(' ')).join('L')}"/>`; return s; },
};

// ---------- Dimensions ----------
function dimTool(id, name, kind, need, help) {
  return {
    id, name,
    activate() { setCursor('crosshair'); this.pts = null; hint(help); },
    down(ev) {
      let p = snapped(ev);
      if (kind === 'seg' && !this.pts) {
        const seg = segmentAt(ev);
        if (!seg) return;
        this.pts = [seg[0], seg[1]];
        return;
      }
      (this.pts ||= []).push(p);
      if (this.pts.length >= need) this.finish();
    },
    move(ev) { this.hov = snapped(ev); App.overlay(); },
    up() { },
    dbl() { if (kind === 'lead' && this.pts?.length >= 2) this.finish(); },
    key(e) {
      if (!this.pts) return false;
      if (e.key === 'Escape') { this.pts = null; App.overlay(); return true; }
      if (e.key === 'Enter' && kind === 'lead') { this.finish(); return true; }
    },
    build(pts) {
      let k = kind;
      if (kind === 'hv') { const [a, b] = pts, c = pts[2] || this.hov || b; k = Math.abs(c[1] - (a[1] + b[1]) / 2) > Math.abs(c[0] - (a[0] + b[0]) / 2) ? 'h' : 'v'; }
      if (kind === 'seg') k = 'par';
      return mk('dim', { k, pts, sz: TO.dim.sz, dec: TO.dim.dec, su: TO.dim.su, ol: { w: .18, c: '#000000' }, fill: null, font: 'Arial' });
    },
    finish() {
      let pts = this.pts; this.pts = null;
      if (!pts) return;
      if (kind === 'lead') { pts = pts.filter((p, i) => !i || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 1e-6); if (pts.length < 2) return; const o = this.build(pts); o.txt = 'Keterangan'; finishCreate(o, 'Buat garis keterangan'); App.ui.editLabel?.(o); return; }
      finishCreate(this.build(pts), 'Buat dimensi');
    },
    overlay() {
      let s = selOverlay();
      if (!this.pts) return s;
      const pts = [...this.pts]; if (this.hov) pts.push(this.hov);
      if (pts.length >= 2 && kind !== 'lead' && (kind === 'ang' ? pts.length >= 3 : true)) {
        const o = this.build(pts.length > need ? pts.slice(0, need) : pts);
        s += `<g transform="matrix(${V.z} 0 0 ${V.z} ${V.tx} ${V.ty})" class="pvdim">` + App.ui.renderTemp(o) + '</g>';
      } else s += `<path class="pv" d="M${pts.map(p => S(...p).join(' ')).join('L')}"/>`;
      return s;
    },
  };
}
function segmentAt(ev) {
  const tol = 6 / V.z;
  for (const o of [...App.ctxList].reverse()) {
    if (!['curve', 'rect', 'poly', 'ps', 'ell'].includes(o.type)) continue;
    const p = geom(o).p, r = nearestOnPath(p, ev.x, ev.y);
    if (r.d < tol) { const s = p.sp[r.si], n = s.n, a = n[r.seg], b = n[(r.seg + 1) % n.length]; return [[a.x, a.y], [b.x, b.y]]; }
  }
  return null;
}
export const DimPar = dimTool('dimpar', 'Alat Dimensi Paralel', 'par', 3, 'Klik titik awal, titik akhir, lalu posisi garis dimensi');
export const DimHV = dimTool('dimhv', 'Alat Dimensi Horizontal/Vertikal', 'hv', 3, 'Klik dua titik, lalu posisi garis dimensi (arah otomatis)');
export const DimAng = dimTool('dimang', 'Alat Dimensi Sudut', 'ang', 4, 'Klik titik sudut, kaki pertama, kaki kedua, lalu jari-jari busur');
export const DimSeg = dimTool('dimseg', 'Alat Dimensi Segmen', 'seg', 3, 'Klik segmen objek, lalu posisi garis dimensi');
export const Leader = dimTool('leader', 'Alat Keterangan 3 Titik', 'lead', 3, 'Klik ujung panah, siku, lalu ujung teks');

// ---------- Connectors ----------
function anchorAt(ev, exclude) {
  const tol = 12 / V.z;
  let best = null, bd = tol;
  for (const o of App.ctxList) {
    if (o.type === 'conn' || o.type === 'dim' || o === exclude || o.hid) continue;
    const b = objBox(o); if (!b) continue;
    for (const s of ['t', 'r', 'b', 'l', 'c']) { const p = anchorPt({ id: o.id, s }); const d = Math.hypot(p[0] - ev.x, p[1] - ev.y); if (d < bd) { bd = d; best = { id: o.id, s, p }; } }
  }
  return best;
}
export const Conn = {
  id: 'conn', name: 'Alat Penghubung',
  activate() { setCursor('crosshair'); hint('Seret dari titik sambung satu objek ke objek lain · Penghubung mengikuti saat objek dipindah'); },
  down(ev) { const a = anchorAt(ev); this.d = { a: a ? { id: a.id, s: a.s } : { pt: snapped(ev) }, b: null, hov: [ev.x, ev.y] }; },
  move(ev) { if (this.d && ev.down) { const b = anchorAt(ev, App.find(this.d.a.id)); this.d.b = b ? { id: b.id, s: b.s } : { pt: snapped(ev) }; } this.hovA = anchorAt(ev); App.overlay(); },
  up() {
    const d = this.d; this.d = null; clearSnap();
    if (!d?.b) return;
    const pa = anchorPt(d.a), pb = anchorPt(d.b);
    if (Math.hypot(pa[0] - pb[0], pa[1] - pb[1]) * V.z < 4) return;
    finishCreate(mk('conn', { k: TO.conn.k, a: d.a, b: d.b, ol: { w: .3, c: '#000000', ae: 'tri' }, fill: null }), 'Buat penghubung');
  },
  overlay() {
    let s = selOverlay();
    for (const o of App.ctxList) { if (o.type === 'conn' || o.type === 'dim') continue; const b = objBox(o); if (!b) continue; for (const k of ['t', 'r', 'b', 'l']) { const p = S(...anchorPt({ id: o.id, s: k })); s += `<circle class="anc" cx="${p[0]}" cy="${p[1]}" r="2.6"/>`; } }
    if (this.hovA) { const p = S(...this.hovA.p); s += `<circle class="anc on" cx="${p[0]}" cy="${p[1]}" r="5"/>`; }
    if (this.d?.b) { const o = mk('conn', { k: TO.conn.k, a: this.d.a, b: this.d.b, ol: { w: .3, c: '#000' } }); s += `<g transform="matrix(${V.z} 0 0 ${V.z} ${V.tx} ${V.ty})" class="pvdim">` + App.ui.renderTemp(o) + '</g>'; }
    return s;
  },
};
export { polyD, rectSub, simplifyPath };
