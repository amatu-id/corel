// Shape tool (node editing), brush deformation tools, Crop, Knife, Eraser and Virtual Segment Delete.
import { App } from '../app.js';
import { V } from '../view.js';
import { mk } from '../model.js';
import { geom, objBox, envInit, perspInit } from '../objgeom.js';
import { N, inv, ap, xformPath, nearestOnPath, splitSeg, segsOf, cpath, reverseSub, lineSeg, flatten, polysToPath, bbox, I, inPolys, polyArea, parseD, pathD } from '../geom.js';
import { polyNodes, PS } from '../shapes.js';
import { boolOp, isEmptyPath, strokePolys, simplifyPath, loadGeoLibs } from '../bool.js';
import { curveOf, toCurveObj, canCurve } from '../ops.js';
import { ensureFonts } from '../fonts.js';
import { deep, clamp, toast } from '../util.js';
import { S, sq, dot, dia, wpath, line, hint, setCursor, near, snapped, clearSnap, rectSVG, psHandles } from './common.js';
import { Pick } from './pick.js';

const K = (si, ni) => si + ':' + ni;
const selOverlay = () => Pick.overlay.call({ ...Pick, drag: null, mode: 'scale', syncMode() { } });

// ---------- Node operations (also used by the property bar) ----------
export const NodeOps = {
  sel: new Set(),
  target() { const o = App.sel[0]; return App.sel.length === 1 && o?.type === 'curve' ? o : null; },
  each(fn) { const o = this.target(); if (!o) return null; for (const k of this.sel) { const [si, ni] = k.split(':').map(Number); const s = o.p.sp[si]; if (s?.n[ni]) fn(s, ni, si, o); } return o; },
  done(label) { App.commit(label); App.overlay(); },
  selectAll() { const o = this.target(); if (!o) return; this.sel = new Set(); o.p.sp.forEach((s, si) => s.n.forEach((_, ni) => this.sel.add(K(si, ni)))); App.overlay(); App.emit('nodes'); },
  add() {
    const o = this.target(); if (!o) return;
    const keys = [...this.sel].map(k => k.split(':').map(Number)).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
    if (!keys.length) return toast('Pilih node terlebih dahulu');
    for (const [si, ni] of keys) {
      const s = o.p.sp[si]; if (!s.c && ni === s.n.length - 1) continue;
      const a = s.n[ni], b = s.n[(ni + 1) % s.n.length], r = splitSeg(a, b, .5);
      a.ox = r.aout[0]; a.oy = r.aout[1]; b.ix = r.bin[0]; b.iy = r.bin[1];
      s.n.splice(ni + 1, 0, r.mid);
    }
    this.sel = new Set(); this.done('Tambah node');
  },
  del() {
    const o = this.target(); if (!o || !this.sel.size) return;
    const keys = [...this.sel].map(k => k.split(':').map(Number)).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
    for (const [si, ni] of keys) o.p.sp[si]?.n.splice(ni, 1);
    o.p.sp = o.p.sp.filter(s => s.n.length > (s.c ? 2 : 1));
    this.sel = new Set();
    if (!o.p.sp.length) { App.remove([o]); App.commit('Hapus objek'); return; }
    this.done('Hapus node');
  },
  setType(t) {
    const o = this.each((s, ni) => {
      const n = s.n[ni]; n.t = t;
      if (t === 0) return;
      const vx1 = n.x - n.ix, vy1 = n.y - n.iy, vx2 = n.ox - n.x, vy2 = n.oy - n.y;
      let l1 = Math.hypot(vx1, vy1), l2 = Math.hypot(vx2, vy2);
      if (!l1 && !l2) { // give the node handles from its neighbours
        const L = s.n.length, p = s.n[(ni - 1 + L) % L], q = s.n[(ni + 1) % L];
        const dx = (q.x - p.x) / 6, dy = (q.y - p.y) / 6;
        n.ix = n.x - dx; n.iy = n.y - dy; n.ox = n.x + dx; n.oy = n.y + dy; return;
      }
      let ux = vx1 + vx2, uy = vy1 + vy2; const u = Math.hypot(ux, uy) || 1; ux /= u; uy /= u;
      if (t === 2) l1 = l2 = (l1 + l2) / 2;
      n.ix = n.x - ux * l1; n.iy = n.y - uy * l1; n.ox = n.x + ux * l2; n.oy = n.y + uy * l2;
    });
    if (o) this.done(['Node sudut', 'Node mulus', 'Node simetris'][t]);
  },
  toLine() { const o = this.each((s, ni) => { if (!s.c && ni === s.n.length - 1) return; const a = s.n[ni], b = s.n[(ni + 1) % s.n.length]; a.ox = a.x; a.oy = a.y; b.ix = b.x; b.iy = b.y; a.t = b.t = 0; }); if (o) this.done('Ke garis'); },
  toCurve() {
    const o = this.each((s, ni) => {
      if (!s.c && ni === s.n.length - 1) return;
      const a = s.n[ni], b = s.n[(ni + 1) % s.n.length];
      if (!lineSeg(a, b)) return;
      a.ox = a.x + (b.x - a.x) / 3; a.oy = a.y + (b.y - a.y) / 3; b.ix = a.x + (b.x - a.x) * 2 / 3; b.iy = a.y + (b.y - a.y) * 2 / 3;
    });
    if (o) this.done('Ke kurva');
  },
  reverse() { const o = this.target(); if (!o) return; o.p.sp = o.p.sp.map(reverseSub); this.sel = new Set(); this.done('Balik arah'); },
  closeAll() { const o = this.target(); if (!o) return; o.p.sp.forEach(s => { if (s.n.length > 2) s.c = true; }); this.done('Tutup kurva'); },
  ends() { // selected end-nodes of open subpaths
    const o = this.target(); if (!o) return [];
    const r = [];
    for (const k of this.sel) { const [si, ni] = k.split(':').map(Number), s = o.p.sp[si]; if (s && !s.c && (ni === 0 || ni === s.n.length - 1)) r.push({ si, ni, s, end: ni !== 0 }); }
    return r;
  },
  join(withLine = false) {
    const o = this.target(), e = this.ends();
    if (!o || e.length !== 2) return toast('Pilih dua node ujung untuk digabung');
    const [A, B] = e;
    if (A.si === B.si) {
      const s = A.s;
      if (!withLine) { const f = s.n[0], l = s.n[s.n.length - 1], x = (f.x + l.x) / 2, y = (f.y + l.y) / 2; f.ix = l.ix + x - l.x; f.iy = l.iy + y - l.y; f.ox += x - f.x; f.oy += y - f.y; f.x = x; f.y = y; s.n.pop(); }
      s.c = true;
    } else {
      let a = A.s, b = B.s;
      if (!A.end) a = reverseSub(a);
      if (B.end) b = reverseSub(b);
      const la = a.n[a.n.length - 1], fb = b.n[0];
      let nodes;
      if (withLine) nodes = [...a.n, ...b.n];
      else { const x = (la.x + fb.x) / 2, y = (la.y + fb.y) / 2; const m = N(x, y, la.ix + x - la.x, la.iy + y - la.y, fb.ox + x - fb.x, fb.oy + y - fb.y, 0); nodes = [...a.n.slice(0, -1), m, ...b.n.slice(1)]; }
      const keep = o.p.sp.filter((_, i) => i !== A.si && i !== B.si);
      o.p.sp = [...keep, { c: false, n: nodes }];
    }
    this.sel = new Set(); this.done(withLine ? 'Perpanjang untuk menutup' : 'Gabungkan node');
  },
  breakAt() {
    const o = this.target(); if (!o || !this.sel.size) return toast('Pilih node untuk dipecah');
    const keys = [...this.sel].map(k => k.split(':').map(Number)).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
    for (const [si, ni] of keys) {
      const s = o.p.sp[si]; if (!s) continue;
      const n = s.n[ni];
      if (s.c) { const rot = [...s.n.slice(ni), ...s.n.slice(0, ni)], end = { ...n }; rot[0] = { ...n, ix: n.x, iy: n.y }; end.ox = end.x; end.oy = end.y; o.p.sp[si] = { c: false, n: [...rot, end] }; }
      else if (ni > 0 && ni < s.n.length - 1) {
        const a = { c: false, n: s.n.slice(0, ni + 1).map(q => ({ ...q })) }, b = { c: false, n: s.n.slice(ni).map(q => ({ ...q })) };
        a.n[a.n.length - 1].ox = n.x; a.n[a.n.length - 1].oy = n.y; b.n[0].ix = n.x; b.n[0].iy = n.y;
        o.p.sp.splice(si, 1, a, b);
      }
    }
    this.sel = new Set(); this.done('Pecah kurva');
  },
  extract() {
    const o = this.target(); if (!o || !this.sel.size) return toast('Pilih node pada subjalur yang akan diekstrak');
    const si = +[...this.sel][0].split(':')[0];
    if (o.p.sp.length < 2) return toast('Kurva hanya memiliki satu subjalur');
    const sub = o.p.sp.splice(si, 1)[0];
    const n = mk('curve', { p: { sp: [sub] }, tf: deep(o.tf), fill: deep(o.fill), ol: deep(o.ol) });
    const w = App.where(o); w.list.splice(w.list.indexOf(o) + 1, 0, n); App.dirtyIndex();
    this.sel = new Set(); App.sel = [n]; App.commit('Ekstrak subjalur');
  },
  reduce(tol = .2) { const o = this.target(); if (!o) return; const before = o.p.sp.reduce((a, s) => a + s.n.length, 0); o.p = simplifyPath(o.p, tol); const after = o.p.sp.reduce((a, s) => a + s.n.length, 0); this.sel = new Set(); this.done('Kurangi node'); toast(`Node berkurang ${before} → ${after}`); },
  alignNodes(axis) {
    const pts = []; this.each((s, ni) => pts.push(s.n[ni]));
    if (pts.length < 2) return toast('Pilih minimal dua node');
    const v = pts.reduce((a, n) => a + (axis === 'h' ? n.y : n.x), 0) / pts.length;
    for (const n of pts) { if (axis === 'h') { const d = v - n.y; n.y += d; n.iy += d; n.oy += d; } else { const d = v - n.x; n.x += d; n.ix += d; n.ox += d; } }
    this.done('Ratakan node');
  },
};

// ---------- Shape tool ----------
export const Shape = {
  id: 'shape', name: 'Alat Bentuk',
  activate() {
    setCursor('default'); NodeOps.sel = new Set();
    const o = App.sel[0];
    hint(!o ? 'Klik objek untuk mengedit node-nya' : o.type === 'curve' ? 'Seret node / pegangan / segmen · Dobel klik segmen menambah node · Dobel klik node menghapus' : this.typeHint(o));
  },
  typeHint(o) {
    return { rect: 'Seret node sudut untuk membulatkan sudut', ell: 'Seret node: ke dalam = pai, ke luar = busur', poly: 'Seret node untuk mengubah ketajaman/putaran', ps: 'Seret ◆ untuk mengubah bentuk', text: 'Gunakan Alat Teks untuk mengedit teks' }[o.type] || 'Konversi ke kurva (⌘/Ctrl+Q) untuk mengedit node bebas';
  },
  get o() { return App.sel.length === 1 ? App.sel[0] : null; },
  worldNodes(o) { return xformPath(o.p, o.tf); },
  local(ev, o, snap = true) { const p = snap ? snapped(ev, new Set([o])) : [ev.x, ev.y]; return ap(inv(o.tf), p[0], p[1]); },
  down(ev) {
    const o = this.o;
    this.d = null;
    if (o?.fx?.persp) { const q = o.fx.persp.q.map(p => S(...ap(o.tf, ...p))); const i = q.findIndex(p => near(ev, p, 8)); if (i >= 0) { this.d = { k: 'persp', i, o }; return; } }
    if (o?.type === 'curve') {
      const w = this.worldNodes(o);
      // handles of selected nodes first
      for (const k of NodeOps.sel) {
        const [si, ni] = k.split(':').map(Number), n = w.sp[si]?.n[ni]; if (!n) continue;
        if (near(ev, S(n.ix, n.iy), 6) && (n.ix !== n.x || n.iy !== n.y)) { this.d = { k: 'hdl', si, ni, h: 'i', orig: deep(o.p) }; return; }
        if (near(ev, S(n.ox, n.oy), 6) && (n.ox !== n.x || n.oy !== n.y)) { this.d = { k: 'hdl', si, ni, h: 'o', orig: deep(o.p) }; return; }
      }
      for (let si = 0; si < w.sp.length; si++) for (let ni = 0; ni < w.sp[si].n.length; ni++) {
        const n = w.sp[si].n[ni];
        if (near(ev, S(n.x, n.y), 6)) {
          const k = K(si, ni);
          if (ev.shift) { NodeOps.sel.has(k) ? NodeOps.sel.delete(k) : NodeOps.sel.add(k); }
          else if (!NodeOps.sel.has(k)) NodeOps.sel = new Set([k]);
          this.d = { k: 'nodes', orig: deep(o.p), p0: this.local(ev, o, false) };
          App.emit('nodes'); App.overlay(); return;
        }
      }
      const r = nearestOnPath(w, ev.x, ev.y);
      if (r.d * V.z < 6) {
        const s = o.p.sp[r.si], a = s.n[r.seg], b = s.n[(r.seg + 1) % s.n.length];
        if (lineSeg(a, b)) { a.ox = a.x + (b.x - a.x) / 3; a.oy = a.y + (b.y - a.y) / 3; b.ix = a.x + (b.x - a.x) * 2 / 3; b.iy = a.y + (b.y - a.y) * 2 / 3; }
        this.d = { k: 'seg', si: r.si, seg: r.seg, t: clamp(r.t, .08, .92), orig: deep(o.p), p0: this.local(ev, o, false) };
        NodeOps.sel = new Set([K(r.si, r.seg)]); App.emit('nodes');
        return;
      }
    } else if (o?.type === 'rect') {
      const r = o.r || [0, 0, 0, 0], pts = [[r[0], 0], [o.w - r[1], 0], [o.w, o.h - r[2]], [r[3], o.h]].map(p => S(...ap(o.tf, ...p)));
      const i = pts.findIndex(p => near(ev, p, 7));
      if (i >= 0) { this.d = { k: 'corner', i }; return; }
    } else if (o?.type === 'ell') {
      const i = this.ellNodes(o).findIndex(p => near(ev, S(...p), 7));
      if (i >= 0) { this.d = { k: 'ell', i, inside: true }; return; }
    } else if (o?.type === 'poly' && !o.cs) {
      const pn = polyNodes(o), pts = [pn.inner, pn.outer].map(p => S(...ap(o.tf, ...p)));
      const i = pts.findIndex(p => near(ev, p, 7));
      if (i >= 0) { this.d = { k: 'poly', i }; return; }
    } else if (o?.type === 'ps') {
      const gh = psHandles(o).find(h => near(ev, S(...h.w), 7));
      if (gh) { this.d = { k: 'glyph', i: gh.i, orig: deep(o.p || PS[o.sh].p) }; return; }
    }
    const hit = V.hit(ev, { deep: ev.mod });
    if (hit && hit !== o) { App.select(hit); NodeOps.sel = new Set(); this.activate(); return; }
    this.d = { k: 'marq', x0: ev.x, y0: ev.y, x1: ev.x, y1: ev.y, add: ev.shift, cx: ev.cx, cy: ev.cy };
  },
  ellNodes(o) {
    const rx = o.w / 2, ry = o.h / 2, a0 = -(o.a0 ?? 0) * Math.PI / 180, a1 = -(o.a1 ?? 0) * Math.PI / 180;
    const p = a => ap(o.tf, rx + rx * Math.cos(a), ry + ry * Math.sin(a));
    return !o.k || o.k === 'e' ? [p(0)] : [p(a0), p(a1)];
  },
  move(ev) {
    const d = this.d, o = this.o;
    if (!ev.down) { this.hover(ev); return; }
    if (!d) return;
    if (d.k === 'marq') { d.x1 = ev.x; d.y1 = ev.y; App.overlay(); return; }
    if (!o) return;
    if (d.k === 'nodes') {
      const [lx, ly] = this.local(ev, o);
      let dx = lx - d.p0[0], dy = ly - d.p0[1];
      if (ev.mod) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      o.p = deep(d.orig);
      for (const k of NodeOps.sel) { const [si, ni] = k.split(':').map(Number), n = o.p.sp[si]?.n[ni]; if (!n) continue; n.x += dx; n.y += dy; n.ix += dx; n.iy += dy; n.ox += dx; n.oy += dy; }
    } else if (d.k === 'hdl') {
      const [lx, ly] = this.local(ev, o);
      o.p = deep(d.orig);
      const n = o.p.sp[d.si].n[d.ni];
      if (d.h === 'i') { n.ix = lx; n.iy = ly; } else { n.ox = lx; n.oy = ly; }
      if (n.t && !ev.alt) {
        const [hx, hy] = d.h === 'i' ? [n.ix, n.iy] : [n.ox, n.oy], vx = n.x - hx, vy = n.y - hy, L = Math.hypot(vx, vy) || 1;
        const other = d.h === 'i' ? ['ox', 'oy'] : ['ix', 'iy'], ol = n.t === 2 ? L : Math.hypot(n[other[0]] - n.x, n[other[1]] - n.y);
        n[other[0]] = n.x + vx / L * ol; n[other[1]] = n.y + vy / L * ol;
      }
      if (ev.alt) n.t = 0;
    } else if (d.k === 'seg') {
      const [lx, ly] = this.local(ev, o, false), dx = lx - d.p0[0], dy = ly - d.p0[1], t = d.t;
      o.p = deep(d.orig);
      const s = o.p.sp[d.si], a = s.n[d.seg], b = s.n[(d.seg + 1) % s.n.length];
      const k = 1 / (3 * t * (1 - t) * ((1 - t) ** 2 + t * t));
      a.ox += dx * (1 - t) * k; a.oy += dy * (1 - t) * k; b.ix += dx * t * k; b.iy += dy * t * k;
      if (a.t) { const L = Math.hypot(a.x - a.ix, a.y - a.iy), vx = a.ox - a.x, vy = a.oy - a.y, l = Math.hypot(vx, vy) || 1; if (L) { a.ix = a.x - vx / l * L; a.iy = a.y - vy / l * L; } }
      if (b.t) { const L = Math.hypot(b.ox - b.x, b.oy - b.y), vx = b.ix - b.x, vy = b.iy - b.y, l = Math.hypot(vx, vy) || 1; if (L) { b.ox = b.x - vx / l * L; b.oy = b.y - vy / l * L; } }
    } else if (d.k === 'corner') {
      const [lx, ly] = this.local(ev, o, false), i = d.i;
      const v = clamp(i === 0 ? lx : i === 1 ? o.w - lx : i === 2 ? o.h - ly : lx, 0, Math.min(o.w, o.h) / 2);
      o.r = o.r || [0, 0, 0, 0];
      if (o.rlock === false) o.r[[0, 1, 2, 3][i]] = v; else o.r = [v, v, v, v];
    } else if (d.k === 'ell') {
      const [lx, ly] = this.local(ev, o, false), rx = o.w / 2, ry = o.h / 2;
      const ang = -Math.atan2((ly - ry) / ry, (lx - rx) / rx) * 180 / Math.PI;
      const inside = Math.hypot((lx - rx) / rx, (ly - ry) / ry) < 1;
      if (!o.k || o.k === 'e') { o.k = inside ? 'pie' : 'arc'; o.a0 = 0; o.a1 = (ang + 360) % 360; d.i = 1; }
      else { o.k = inside ? 'pie' : 'arc'; if (d.i === 0) o.a0 = (ang + 360) % 360; else o.a1 = (ang + 360) % 360; }
    } else if (d.k === 'poly') {
      const [lx, ly] = this.local(ev, o, false), rx = o.w / 2, ry = o.h / 2, u = (lx - rx) / rx, v = (ly - ry) / ry;
      const n = Math.max(3, o.n | 0), base = -Math.PI / 2 + Math.PI / n;
      if (d.i === 0) { o.ir = clamp(Math.hypot(u, v), 0.02, 3); o.tw = ((Math.atan2(v, u) - base) * 180 / Math.PI); o.star = true; }
      else { const r = Math.hypot(u, v) || 1; o.ir = clamp((o.ir ?? Math.cos(Math.PI / n)) / r, .02, 3); }
    } else if (d.k === 'glyph') {
      const [lx, ly] = this.local(ev, o, false), p = deep(d.orig); PS[o.sh].hd[d.i].set(o.w, o.h, p, lx, ly); o.p = p;
    } else if (d.k === 'persp') {
      const [lx, ly] = this.local(ev, o); o.fx.persp.q[d.i] = [lx, ly];
    }
    App.render();
  },
  up() {
    const d = this.d; this.d = null; clearSnap();
    if (!d) return;
    if (d.k === 'marq') {
      const o = this.o; if (o?.type !== 'curve') { App.overlay(); return; }
      const x0 = Math.min(d.x0, d.x1), x1 = Math.max(d.x0, d.x1), y0 = Math.min(d.y0, d.y1), y1 = Math.max(d.y0, d.y1);
      if (!d.add) NodeOps.sel = new Set();
      const w = this.worldNodes(o);
      w.sp.forEach((s, si) => s.n.forEach((n, ni) => { if (n.x >= x0 && n.x <= x1 && n.y >= y0 && n.y <= y1) NodeOps.sel.add(K(si, ni)); }));
      if ((x1 - x0) * V.z < 3 && (y1 - y0) * V.z < 3 && !d.add) { const hit = V.hit({ cx: d.cx, cy: d.cy, x: d.x0, y: d.y0 }); if (!hit) App.clearSel(); }
      App.emit('nodes'); App.overlay(); return;
    }
    App.commit({ nodes: 'Pindahkan node', hdl: 'Ubah pegangan', seg: 'Bentuk segmen', corner: 'Sudut membulat', ell: 'Ubah elips', poly: 'Ubah poligon', glyph: 'Ubah bentuk', persp: 'Ubah perspektif' }[d.k] || 'Edit');
  },
  dbl(ev) {
    const o = this.o; if (o?.type !== 'curve') { if (o && o.type !== 'text' && canCurve(o) && !['rect', 'ell', 'poly', 'ps'].includes(o.type)) App.run?.('toCurves'); return; }
    const w = this.worldNodes(o);
    for (let si = 0; si < w.sp.length; si++) for (let ni = 0; ni < w.sp[si].n.length; ni++) if (near(ev, S(w.sp[si].n[ni].x, w.sp[si].n[ni].y), 6)) { NodeOps.sel = new Set([K(si, ni)]); NodeOps.del(); return; }
    const r = nearestOnPath(w, ev.x, ev.y);
    if (r.d * V.z < 6) {
      const s = o.p.sp[r.si], a = s.n[r.seg], b = s.n[(r.seg + 1) % s.n.length], sp = splitSeg(a, b, r.t);
      a.ox = sp.aout[0]; a.oy = sp.aout[1]; b.ix = sp.bin[0]; b.iy = sp.bin[1];
      s.n.splice(r.seg + 1, 0, sp.mid); NodeOps.sel = new Set([K(r.si, r.seg + 1)]);
      App.commit('Tambah node');
    }
  },
  key(e) {
    const o = this.o; if (o?.type !== 'curve') return false;
    if ((e.key === 'Delete' || e.key === 'Backspace') && NodeOps.sel.size) { NodeOps.del(); return true; }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') { NodeOps.selectAll(); return true; }
    if (e.key.startsWith('Arrow') && NodeOps.sel.size) {
      const st = (e.shiftKey ? App.settings.superNudge : App.settings.nudge) / Math.sqrt(Math.abs(o.tf[0] * o.tf[3] - o.tf[1] * o.tf[2]) || 1);
      const [dx, dy] = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st] }[e.key];
      const [ldx, ldy] = [inv(o.tf)[0] * dx + inv(o.tf)[2] * dy, inv(o.tf)[1] * dx + inv(o.tf)[3] * dy];
      NodeOps.each((s, ni) => { const n = s.n[ni]; n.x += ldx; n.y += ldy; n.ix += ldx; n.iy += ldy; n.ox += ldx; n.oy += ldy; });
      App.commit('Geser node'); return true;
    }
    if (e.key === 'Escape') { if (NodeOps.sel.size) { NodeOps.sel = new Set(); App.overlay(); } else App.setTool('pick'); return true; }
    return false;
  },
  hover(ev) {
    const o = this.o;
    if (o?.type === 'curve') {
      const w = this.worldNodes(o);
      if (w.sp.some(s => s.n.some(n => near(ev, S(n.x, n.y), 6)))) return setCursor('move');
      if (nearestOnPath(w, ev.x, ev.y).d * V.z < 6) return setCursor('copy');
    }
    setCursor('default');
  },
  overlay() {
    const o = this.o, d = this.d;
    let s = '';
    if (d?.k === 'marq') { const a = S(d.x0, d.y0), b = S(d.x1, d.y1); s += rectSVG({ x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1]) }, 'mq'); }
    if (!o) return s;
    if (o.fx?.persp) { const q = o.fx.persp.q.map(p => S(...ap(o.tf, ...p))); s += `<path class="pv" d="M${q.map(p => p.join(' ')).join('L')}Z"/>`; q.forEach(p => { s += sq(p[0], p[1], 'n', 4); }); }
    if (o.type === 'curve') {
      const w = this.worldNodes(o);
      s += wpath(w, 'np');
      w.sp.forEach((sub, si) => sub.n.forEach((n, ni) => {
        const k = K(si, ni), on = NodeOps.sel.has(k), p = S(n.x, n.y);
        if (on) {
          if (n.ix !== n.x || n.iy !== n.y) s += line(p, S(n.ix, n.iy), 'hl') + dot(...S(n.ix, n.iy), 'hd', 3);
          if (n.ox !== n.x || n.oy !== n.y) s += line(p, S(n.ox, n.oy), 'hl') + dot(...S(n.ox, n.oy), 'hd', 3);
        }
        s += sq(p[0], p[1], 'n' + (on ? ' on' : '') + (ni === 0 ? ' first' : '') + (n.t ? ' sm' : ''), ni === 0 ? 4 : 3.2);
      }));
      return s;
    }
    s += selOverlay();
    if (o.type === 'rect') { const r = o.r || [0, 0, 0, 0]; [[r[0], 0], [o.w - r[1], 0], [o.w, o.h - r[2]], [r[3], o.h]].forEach(p => { const q = S(...ap(o.tf, ...p)); s += sq(q[0], q[1], 'n', 3.5); }); }
    if (o.type === 'ell') this.ellNodes(o).forEach(p => { const q = S(...p); s += sq(q[0], q[1], 'n', 3.5); });
    if (o.type === 'poly' && !o.cs) { const pn = polyNodes(o); [pn.inner, pn.outer].forEach((p, i) => { const q = S(...ap(o.tf, ...p)); s += sq(q[0], q[1], i ? 'n' : 'n on', 3.5); }); }
    if (o.type === 'ps') for (const h of psHandles(o)) { const p = S(...h.w); s += dia(p[0], p[1]); }
    return s;
  },
};

// ---------- Brush deformation tools ----------
function densify(polys, step) {
  return polys.map(p => {
    const out = [], q = p.pts, L = q.length;
    for (let i = 0; i < L - (p.c ? 0 : 1); i++) {
      const a = q[i], b = q[(i + 1) % L], dd = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(dd / step));
      for (let k = 0; k < n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
    }
    if (!p.c) out.push(q[L - 1]);
    return { c: p.c, pts: out };
  });
}
export const BT = { r: 8, s: 50, ang: 30 };
function brushTool(id, name, help, apply, keepPoly = false) {
  return {
    id, name,
    activate() { setCursor('crosshair'); hint(App.sel.length ? help : 'Pilih objek kurva terlebih dahulu, lalu sapukan kuas di tepinya'); },
    async down(ev) {
      if (!App.sel.length) { const o = V.hit(ev); if (o) App.select(o); return; }
      await ensureFonts(App.sel);
      this.work = [];
      for (const o of App.sel) {
        if (!canCurve(o)) continue;
        const p = curveOf(o); if (!p) continue;
        const polys = densify(flatten(p, .05), Math.max(.15, BT.r / 10));
        const n = mk('curve', { ...deep({ fill: o.fill, ol: o.ol, tr: o.tr, fx: o.fx }), p: polysToPath(polys), name: o.name });
        if (n.fx) { delete n.fx.env; delete n.fx.persp; delete n.fx.dist; }
        App.replace(o, n);
        this.work.push({ o: n, polys });
      }
      this.last = [ev.x, ev.y]; this.cur = [ev.x, ev.y];
    },
    move(ev) {
      this.cur = [ev.x, ev.y];
      if (ev.down && this.work) {
        const dx = ev.x - this.last[0], dy = ev.y - this.last[1];
        for (const w of this.work) { apply(w.polys, ev.x, ev.y, BT.r, BT.s / 100, dx, dy, ev); w.o.p = polysToPath(w.polys); }
        this.last = [ev.x, ev.y];
        App.render();
      }
      App.overlay();
    },
    up() {
      if (!this.work) return;
      for (const w of this.work) w.o.p = keepPoly ? polysToPath(w.polys) : simplifyPath(polysToPath(w.polys), .08);
      this.work = null;
      App.commit(name.replace('Alat ', ''));
    },
    overlay() {
      let s = selOverlay();
      if (this.cur) { const p = S(...this.cur); s += `<circle class="brush" cx="${p[0]}" cy="${p[1]}" r="${BT.r * V.z}"/>`; }
      return s;
    },
  };
}
const fall = (d, r) => d >= r ? 0 : (1 - d / r) ** 2 * (3 - 2 * (1 - d / r)) / 1;
export const Smooth = brushTool('smooth', 'Alat Penghalus', 'Sapukan kuas di sepanjang tepi kurva untuk menghaluskan', (polys, x, y, r, s) => {
  for (const p of polys) { const q = p.pts, L = q.length; const nq = q.map(a => [...a]); for (let i = 0; i < L; i++) { if (!p.c && (i === 0 || i === L - 1)) continue; const d = Math.hypot(q[i][0] - x, q[i][1] - y); const f = fall(d, r) * s * .6; if (!f) continue; const a = q[(i - 1 + L) % L], b = q[(i + 1) % L]; nq[i] = [q[i][0] + ((a[0] + b[0]) / 2 - q[i][0]) * f, q[i][1] + ((a[1] + b[1]) / 2 - q[i][1]) * f]; } p.pts = nq; }
});
export const Smear = brushTool('smear', 'Alat Oles', 'Seret dari tepi objek untuk menarik/mendorong kerangka', (polys, x, y, r, s, dx, dy) => {
  for (const p of polys) for (const q of p.pts) { const f = fall(Math.hypot(q[0] - x + dx, q[1] - y + dy), r) * (0.4 + s); q[0] += dx * f; q[1] += dy * f; }
});
export const Twirl = brushTool('twirl', 'Alat Pusar', 'Tekan dan tahan di tepi objek untuk memusarkan (Alt: berlawanan)', (polys, x, y, r, s, dx, dy, ev) => {
  const a = (ev.alt ? -1 : 1) * s * .12;
  for (const p of polys) for (const q of p.pts) { const ddx = q[0] - x, ddy = q[1] - y, f = fall(Math.hypot(ddx, ddy), r) * a; if (!f) continue; const c = Math.cos(f), sn = Math.sin(f); q[0] = x + ddx * c - ddy * sn; q[1] = y + ddx * sn + ddy * c; }
});
export const Attract = brushTool('attract', 'Alat Tarik', 'Sapukan kuas untuk menarik node ke pusat kuas', (polys, x, y, r, s) => {
  for (const p of polys) for (const q of p.pts) { const f = fall(Math.hypot(q[0] - x, q[1] - y), r) * s * .12; q[0] += (x - q[0]) * f; q[1] += (y - q[1]) * f; }
});
export const Repel = brushTool('repel', 'Alat Tolak', 'Sapukan kuas untuk mendorong node menjauhi pusat kuas', (polys, x, y, r, s) => {
  for (const p of polys) for (const q of p.pts) { const ddx = q[0] - x, ddy = q[1] - y, d = Math.hypot(ddx, ddy) || 1e-6, f = fall(d, r) * s * .12 * r; q[0] += ddx / d * f; q[1] += ddy / d * f; }
});
export const Roughen = brushTool('roughen', 'Alat Kasar', 'Sapukan kuas di tepi untuk membuat tepi bergerigi', (polys, x, y, r, s) => {
  for (const p of polys) {
    const q = p.pts, L = q.length;
    p.done ||= new Set();
    for (let i = 0; i < L; i++) {
      if (p.done.has(i)) continue;
      const d = Math.hypot(q[i][0] - x, q[i][1] - y); if (d > r) continue;
      const a = q[(i - 1 + L) % L], b = q[(i + 1) % L]; let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1;
      const amp = (i % 2 ? 1 : -1) * r * .12 * (.3 + s) * (.6 + Math.random() * .4);
      q[i] = [q[i][0] - ty / l * amp, q[i][1] + tx / l * amp]; p.done.add(i);
    }
  }
}, true);

// ---------- Crop ----------
export const Crop = {
  id: 'crop', name: 'Alat Potong',
  activate() { setCursor('crosshair'); this.r = null; hint('Seret area pemotongan · Dobel klik di dalam / Enter untuk menerapkan · Esc batal'); },
  down(ev) { if (this.r && this.inside(ev)) return; this.d = { p0: snapped(ev) }; this.r = null; },
  inside(ev) { const r = this.r; return r && ev.x >= r.x && ev.x <= r.x + r.w && ev.y >= r.y && ev.y <= r.y + r.h; },
  move(ev) { if (ev.down && this.d) { const p = snapped(ev), a = this.d.p0; this.r = { x: Math.min(a[0], p[0]), y: Math.min(a[1], p[1]), w: Math.abs(p[0] - a[0]), h: Math.abs(p[1] - a[1]) }; App.overlay(); } },
  up() { this.d = null; clearSnap(); if (this.r && this.r.w * V.z < 3) this.r = null; App.overlay(); },
  dbl(ev) { if (this.inside(ev)) this.apply(); },
  key(e) { if (!this.r) return false; if (e.key === 'Enter') { this.apply(); return true; } if (e.key === 'Escape') { this.r = null; App.overlay(); return true; } },
  async apply() {
    const r = this.r; this.r = null; if (!r) return;
    await loadGeoLibs();
    const targets = App.sel.length ? [...App.sel] : [...App.allObjects()];
    await ensureFonts(targets);
    const clip = { sp: [{ c: true, n: [N(r.x, r.y), N(r.x + r.w, r.y), N(r.x + r.w, r.y + r.h), N(r.x, r.y + r.h)] }] };
    const out = [];
    for (const o of targets) {
      const b = objBox(o); if (!b) continue;
      if (b.x >= r.x && b.y >= r.y && b.x + b.w <= r.x + r.w && b.y + b.h <= r.y + r.h) { out.push(o); continue; }
      if (b.x > r.x + r.w || b.x + b.w < r.x || b.y > r.y + r.h || b.y + b.h < r.y) { App.remove([o]); continue; }
      const p = canCurve(o) && !o.pc && !o.fx ? curveOf(o) : null;
      if (p && p.sp.some(s => s.c)) {
        const res = boolOp('int', p, clip);
        if (isEmptyPath(res)) { App.remove([o]); continue; }
        const n = mk('curve', { fill: deep(o.fill), ol: deep(o.ol), tr: deep(o.tr), p: res, name: o.name });
        if (o.type === 'text') n.fr = 'nonzero';
        App.replace(o, n); out.push(n);
      } else { // bitmaps, groups, effects: clip in a PowerClip frame
        const f = mk('rect', { w: r.w, h: r.h, tf: [1, 0, 0, 1, r.x, r.y], fill: null, ol: null, name: 'Bingkai potong' });
        const w = App.where(o), i = w.list.indexOf(o);
        w.list.splice(i, 1, f); f.pc = [o]; App.dirtyIndex(); out.push(f);
      }
    }
    App.sel = out; App.commit('Potong');
  },
  overlay() {
    let s = selOverlay();
    if (this.r) {
      const a = S(this.r.x, this.r.y), w = this.r.w * V.z, h = this.r.h * V.z;
      s += `<path class="cropdim" fill-rule="evenodd" d="M0 0H${V.w}V${V.h}H0ZM${a[0]} ${a[1]}h${w}v${h}h${-w}Z"/>` + rectSVG({ x: a[0], y: a[1], w, h }, 'cropbox');
      s += `<text class="snaplbl" x="${a[0] + 6}" y="${a[1] + 14}">Dobel klik / Enter untuk memotong</text>`;
    }
    return s;
  },
};

// ---------- Knife ----------
export const KT = { mode: '2p', gap: 0 };
function islands(p) { // splits a compound path into outer contours with their holes
  const polys = flatten(p, .2), outs = [];
  const depth = p.sp.map((s, i) => { const pt = polys[i]?.pts[0]; if (!pt) return 0; let d = 0; polys.forEach((q, j) => { if (j !== i && q.c && inPolys([q], pt[0], pt[1])) d++; }); return d; });
  p.sp.forEach((s, i) => { if (depth[i] % 2 === 0) outs.push({ sp: [s], i }); });
  p.sp.forEach((s, i) => {
    if (depth[i] % 2 === 0) return;
    const pt = polys[i]?.pts[0]; if (!pt) return;
    let best = null;
    for (const o of outs) if (inPolys([polys[o.i]], pt[0], pt[1])) { if (!best || Math.abs(polyArea(polys[o.i].pts)) < Math.abs(polyArea(polys[best.i].pts))) best = o; }
    (best || outs[0])?.sp.push(s);
  });
  return outs.map(o => ({ sp: o.sp }));
}
export const Knife = {
  id: 'knife', name: 'Alat Pisau',
  activate() { setCursor('crosshair'); hint(KT.mode === '2p' ? 'Seret garis lurus melintasi objek untuk memotongnya' : 'Seret jalur bebas melintasi objek untuk memotongnya'); },
  down(ev) { this.pts = [snapped(ev)]; },
  move(ev) { if (ev.down && this.pts) { const p = snapped(ev); if (KT.mode === '2p') this.pts[1] = ev.mod ? p : p; else this.pts.push([ev.x, ev.y]); App.overlay(); } },
  async up() {
    const pts = this.pts; this.pts = null; clearSnap();
    if (!pts || pts.length < 2) return App.overlay();
    await loadGeoLibs();
    const a = pts[0], b = pts[pts.length - 1];
    let targets = App.sel.length ? [...App.sel] : App.ctxList.filter(o => !o.lock && !o.hid);
    await ensureFonts(targets);
    const out = [];
    for (const o of targets) {
      if (!canCurve(o)) continue;
      const p = curveOf(o); if (!p) continue;
      let pieces = [];
      const closed = p.sp.every(s => s.c);
      if (KT.mode === '2p' && closed) {
        const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, BIG = 1e5;
        const half = sgn => ({ sp: [{ c: true, n: [N(a[0] - ux * BIG, a[1] - uy * BIG), N(b[0] + ux * BIG, b[1] + uy * BIG), N(b[0] + ux * BIG - uy * BIG * sgn, b[1] + uy * BIG + ux * BIG * sgn), N(a[0] - ux * BIG - uy * BIG * sgn, a[1] - uy * BIG + ux * BIG * sgn)] }] });
        for (const sg of [1, -1]) { const r = boolOp('int', p, half(sg)); if (!isEmptyPath(r)) pieces.push(...islands(r)); }
      } else if (closed) {
        const cut = polysToPath(strokePolys([{ c: false, pts }], Math.max(KT.gap, .02), 'butt', 'round'));
        const r = boolOp('sub', p, cut); if (!isEmptyPath(r)) pieces = islands(r);
      } else pieces = splitOpen(p, pts);
      if (pieces.length < 2) continue;
      const objs = pieces.map(sp => { const n = mk('curve', { fill: deep(o.fill), ol: deep(o.ol), tr: deep(o.tr), p: sp }); if (o.type === 'text') n.fr = 'nonzero'; return n; });
      const w = App.where(o); w.list.splice(w.list.indexOf(o), 1, ...objs); App.dirtyIndex(); out.push(...objs);
    }
    if (!out.length) { toast('Garis pisau tidak memotong objek tertutup'); return App.overlay(); }
    App.sel = out; App.commit('Potong dengan pisau');
  },
  overlay() { let s = selOverlay(); if (this.pts?.length > 1) s += `<path class="knife" d="M${this.pts.map(p => S(...p).join(' ')).join('L')}"/>`; return s; },
};
function splitOpen(p, pts) {
  const P = window.paper, item = new P.Path({ pathData: pathD(p), insert: false }), knife = new P.Path({ segments: pts, insert: false });
  const locs = item.getIntersections(knife).map(l => l.offset).sort((a, b) => b - a);
  if (!locs.length) return [];
  const pieces = [];
  let cur = item;
  for (const off of locs) { const rest = cur.splitAt(off); if (rest) pieces.push(parseD(rest.pathData)); }
  pieces.push(parseD(cur.pathData));
  return pieces.filter(q => !isEmptyPath(q));
}

// ---------- Eraser ----------
export const ET = { d: 4 };
export const Eraser = {
  id: 'eraser', name: 'Alat Penghapus',
  activate() { setCursor('none'); hint('Sapukan untuk menghapus bagian objek terpilih · Ukuran ujung di bilah properti'); },
  deactivate() { setCursor('default'); },
  down(ev) { this.pts = [[ev.x, ev.y]]; this.t = App.sel.length ? [...App.sel] : [V.hit(ev)].filter(Boolean); },
  move(ev) { this.cur = [ev.x, ev.y]; if (ev.down && this.pts) this.pts.push([ev.x, ev.y]); App.overlay(); },
  async up() {
    const pts = this.pts, targets = this.t; this.pts = null;
    if (!pts || !targets?.length) return App.overlay();
    await loadGeoLibs(); await ensureFonts(targets);
    if (pts.length === 1) pts.push([pts[0][0] + .01, pts[0][1]]);
    const cut = polysToPath(strokePolys([{ c: false, pts }], ET.d, 'round', 'round'));
    const out = [];
    for (const o of targets) {
      if (!canCurve(o)) { out.push(o); continue; }
      const p = curveOf(o); if (!p || !p.sp.some(s => s.c)) { out.push(o); continue; }
      const r = boolOp('sub', p, cut);
      if (isEmptyPath(r)) { App.remove([o]); continue; }
      const n = mk('curve', { fill: deep(o.fill), ol: deep(o.ol), tr: deep(o.tr), p: r, name: o.name });
      if (o.type === 'text') n.fr = 'nonzero';
      App.replace(o, n); out.push(n);
    }
    App.sel = out; App.commit('Hapus dengan penghapus');
  },
  overlay() {
    let s = selOverlay();
    if (this.pts?.length > 1) s += `<path class="erasetrail" stroke-width="${ET.d * V.z}" d="M${this.pts.map(p => S(...p).join(' ')).join('L')}"/>`;
    if (this.cur) { const p = S(...this.cur); s += `<circle class="brush" cx="${p[0]}" cy="${p[1]}" r="${ET.d / 2 * V.z}"/>`; }
    return s;
  },
};

// ---------- Virtual segment delete ----------
export const VSDel = {
  id: 'vsdel', name: 'Hapus Segmen Virtual',
  activate() { setCursor('crosshair'); hint('Klik segmen di antara perpotongan untuk menghapusnya'); },
  async down(ev) {
    await loadGeoLibs();
    const P = window.paper, tol = 6 / V.z;
    let target = null, best = tol;
    for (const o of [...App.ctxList].reverse()) {
      if (!canCurve(o) || o.lock) continue;
      const p = curveOf(o); if (!p) continue;
      const r = nearestOnPath(p, ev.x, ev.y); if (r.d < best) { best = r.d; target = { o, p, r }; }
    }
    if (!target) return;
    const { o, p, r } = target;
    const sub = p.sp[r.si];
    let path = new P.Path({ pathData: pathD({ sp: [sub] }), insert: false });
    const others = [];
    for (const q of App.ctxList) { if (q === o || !canCurve(q)) continue; const qp = curveOf(q); if (qp) others.push(new P.CompoundPath({ pathData: pathD(qp), insert: false })); }
    p.sp.forEach((s, i) => { if (i !== r.si) others.push(new P.Path({ pathData: pathD({ sp: [s] }), insert: false })); });
    const offsOf = pp => { const set = []; for (const q of others) for (const l of pp.getIntersections(q)) set.push(l.offset); for (const l of pp.getIntersections()) set.push(l.offset); return [...new Set(set.map(v => +v.toFixed(4)))].sort((a, b) => a - b); };
    let offs = offsOf(path);
    const click = new P.Point(ev.x, ev.y);
    let rest = [];
    if (!offs.length) { // no crossings: remove the clicked segment between nodes
      const s2 = cpath({ sp: [sub] }).sp[0];
      if (s2.c) { const n = [...s2.n.slice(r.seg + 1), ...s2.n.slice(0, r.seg + 1)]; n[0] = { ...n[0], ix: n[0].x, iy: n[0].y }; const l = n.length - 1; n[l] = { ...n[l], ox: n[l].x, oy: n[l].y }; rest = [{ c: false, n }]; }
      else { const a = { c: false, n: s2.n.slice(0, r.seg + 1) }, b = { c: false, n: s2.n.slice(r.seg + 1) }; rest = [a, b].filter(x => x.n.length > 1); }
    } else {
      if (path.closed) { path.splitAt(offs[0]); offs = offsOf(path); }
      const pieces = [];
      let cur = path;
      for (const off of [...offs].reverse()) { if (off <= 1e-6 || off >= cur.length - 1e-6) continue; const tail = cur.splitAt(off); if (tail) pieces.push(tail); }
      pieces.push(cur);
      let kill = null, kd = Infinity;
      for (const pc of pieces) { const d = pc.getNearestPoint(click).getDistance(click); if (d < kd) { kd = d; kill = pc; } }
      rest = pieces.filter(pc => pc !== kill).flatMap(pc => parseD(pc.pathData).sp);
    }
    const sp = [...p.sp.filter((_, i) => i !== r.si), ...rest];
    if (!sp.length) { App.remove([o]); App.commit('Hapus segmen'); return; }
    const n = mk('curve', { fill: deep(o.fill), ol: deep(o.ol), p: { sp } });
    App.replace(o, n); App.sel = [n]; App.commit('Hapus segmen virtual');
  },
  overlay() { return selOverlay(); },
};
export { envInit, perspInit, bbox, I, toCurveObj };
