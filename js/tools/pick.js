// Pick tool (select / move / scale / rotate / skew), Freehand Pick, Free Transform, Zoom and Pan.
import { App } from '../app.js';
import { V } from '../view.js';
import { setFrom, walk, cloneObj, applyM } from '../model.js';
import { objBox, selBox, geom } from '../objgeom.js';
import { T, S as Sc, R, K, inv, ap, inPolys, mul } from '../geom.js';
import { deep } from '../util.js';
import { PS } from '../shapes.js';
import { S, sq, dot, dia, boxS, rectSVG, near, hint, setCursor, psHandles, line, clearSnap } from './common.js';

const CUR = ['nwse-resize', 'ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize', 'ew-resize'];
function handlePts(b) { // screen coords of the 8 handles + centre
  const r = boxS(b, 6), x0 = r.x, y0 = r.y, x1 = r.x + r.w, y1 = r.y + r.h, xm = (x0 + x1) / 2, ym = (y0 + y1) / 2;
  return [[x0, y0], [xm, y0], [x1, y0], [x1, ym], [x1, y1], [xm, y1], [x0, y1], [x0, ym]];
}
const selKey = () => App.sel.map(o => o.id).join();
function topDeep(list) { const s = new Set(); list.forEach(o => walk([o], c => { s.add(c); })); return s; }

export const Pick = {
  id: 'pick', name: 'Alat Pilih', mode: 'scale', rc: null, _sk: '',
  activate() { this.drag = null; this.mode = 'scale'; setCursor('default'); hint('Klik untuk memilih · Seret untuk memindah · Klik lagi untuk memutar/memiringkan · Shift tambah · ⌘/Ctrl pilih di dalam grup'); },
  deactivate() { this.drag = null; },
  syncMode() { const k = selKey(); if (k !== this._sk) { this._sk = k; this.mode = 'scale'; this.rc = null; } },
  handleAt(ev, b) {
    const hp = handlePts(b);
    for (let i = 0; i < 8; i++) if (near(ev, hp[i], 7)) return { i };
    if (this.mode === 'rotate') { const c = this.center(b), cs = S(...c); if (near(ev, cs, 8)) return { center: true }; }
    return null;
  },
  center(b) { return this.rc || [b.x + b.w / 2, b.y + b.h / 2]; },
  down(ev) {
    this.syncMode();
    const b = App.selBox();
    this.start = [ev.x, ev.y]; this.moved = false; this.copy = false;
    if (b && App.sel.length && !App.sel.every(o => o.lock)) {
      // perfect-shape glyphs
      if (App.sel.length === 1 && App.sel[0].type === 'ps') {
        const gh = psHandles(App.sel[0]).find(h => near(ev, S(...h.w), 7));
        if (gh) { this.drag = { k: 'glyph', o: App.sel[0], i: gh.i, orig: deep(App.sel[0].p || PS[App.sel[0].sh].p) }; return; }
      }
      const h = this.handleAt(ev, b);
      if (h) { this.beginXform(h, b, ev); return; }
    }
    const o = V.hit(ev, { deep: ev.mod });
    if (o) {
      if (ev.shift) { App.select(o, 'toggle'); this.drag = { k: 'none' }; return; }
      const was = App.sel.includes(o);
      if (!was) App.select(o);
      this.syncMode();
      if (App.sel.some(s => s.lock)) { this.drag = { k: 'none', was }; return; }
      this.drag = { k: 'move', was, orig: App.sel.map(s => deep(s)), b0: App.selBox(), ex: topDeep(App.sel) };
      V.prepSnap(new Set(App.sel));
      return;
    }
    const g = V.guideAt(ev);
    if (g && !g.lock) { V.selGuide = g; this.drag = { k: 'guide', g, v0: g.v }; App.overlay(); return; }
    V.selGuide = null;
    this.drag = { k: 'marq', x0: ev.x, y0: ev.y, x1: ev.x, y1: ev.y, add: ev.shift, touch: ev.alt };
  },
  beginXform(h, b, ev) {
    if (h.center) { this.drag = { k: 'center' }; return; }
    const orig = App.sel.map(s => deep(s));
    V.prepSnap(new Set(App.sel));
    if (this.mode === 'rotate') {
      const corner = h.i % 2 === 0;
      this.drag = corner ? { k: 'rot', orig, b0: b, c: this.center(b) } : { k: 'skew', orig, b0: b, i: h.i };
    } else this.drag = { k: 'scale', orig, b0: b, i: h.i };
  },
  move(ev) {
    if (!ev.down) return this.hover(ev);
    const d = this.drag; if (!d) return;
    if (ev.e.buttons & 2) this.copy = true;
    const dx = ev.x - this.start[0], dy = ev.y - this.start[1];
    if (!this.moved && Math.hypot(ev.sx - (this.start[0] * V.z + V.tx), ev.sy - (this.start[1] * V.z + V.ty)) < 3) return;
    this.moved = true;
    if (d.k === 'move') {
      let mx = dx, my = dy;
      if (ev.mod) { if (Math.abs(dx) > Math.abs(dy)) my = 0; else mx = 0; }
      if (!ev.alt) { const r = V.snapBox(d.b0, mx, my, new Set(App.sel)); if (!ev.mod || my === 0) mx = r.dx; if (!ev.mod || mx === 0) my = r.dy; V.snapLines = r.lines; }
      d.m = T(mx, my);
      App.sel.forEach((o, i) => setFrom(o, d.orig[i], d.m));
      App.emit('status', { dx: mx, dy: my });
      App.render();
    } else if (d.k === 'scale') {
      const b = d.b0, i = d.i, corner = i % 2 === 0;
      const hx = [b.x, b.x + b.w / 2, b.x + b.w, b.x + b.w, b.x + b.w, b.x + b.w / 2, b.x, b.x][i];
      const hy = [b.y, b.y, b.y, b.y + b.h / 2, b.y + b.h, b.y + b.h, b.y + b.h, b.y + b.h / 2][i];
      const ax = ev.shift ? b.x + b.w / 2 : 2 * (b.x + b.w / 2) - hx, ay = ev.shift ? b.y + b.h / 2 : 2 * (b.y + b.h / 2) - hy;
      let p = [ev.x, ev.y];
      if (!ev.alt) { const r = V.snapPoint(p, { exclude: new Set(App.sel) }); p = r.p; V.snapHint = r.hint; }
      let sx = hx !== ax ? (p[0] - ax) / (hx - ax) : 1, sy = hy !== ay ? (p[1] - ay) / (hy - ay) : 1;
      if (i === 1 || i === 5) sx = 1; if (i === 3 || i === 7) sy = 1;
      if (corner) { // proportional by default (CorelDRAW behaviour)
        const vx = hx - ax, vy = hy - ay, L2 = vx * vx + vy * vy || 1;
        const s = ((p[0] - ax) * vx + (p[1] - ay) * vy) / L2;
        sx = sy = s;
      }
      if (ev.mod) { sx = Math.round(sx) || (sx < 0 ? -1 : 1); sy = Math.round(sy) || (sy < 0 ? -1 : 1); }
      if (Math.abs(sx) < 1e-4) sx = 1e-4; if (Math.abs(sy) < 1e-4) sy = 1e-4;
      d.m = Sc(sx, sy, ax, ay);
      App.sel.forEach((o, k) => setFrom(o, d.orig[k], d.m));
      App.emit('status', { sx, sy });
      App.render();
    } else if (d.k === 'rot') {
      const c = d.c;
      let a = (Math.atan2(ev.y - c[1], ev.x - c[0]) - Math.atan2(this.start[1] - c[1], this.start[0] - c[0])) * 180 / Math.PI;
      if (ev.mod) a = Math.round(a / 15) * 15;
      d.m = R(a, c[0], c[1]);
      App.sel.forEach((o, k) => setFrom(o, d.orig[k], d.m));
      App.emit('status', { rot: -a });
      App.render();
    } else if (d.k === 'skew') {
      const b = d.b0, i = d.i;
      let m;
      if (i === 1 || i === 5) { const ya = i === 1 ? b.y + b.h : b.y, hy = i === 1 ? b.y : b.y + b.h; let t = dx / (hy - ya); if (ev.mod) t = Math.tan(Math.round(Math.atan(t) * 12 / Math.PI) * Math.PI / 12); m = [1, 0, t, 1, -t * ya, 0]; }
      else { const xa = i === 7 ? b.x + b.w : b.x, hx = i === 7 ? b.x : b.x + b.w; let t = dy / (hx - xa); if (ev.mod) t = Math.tan(Math.round(Math.atan(t) * 12 / Math.PI) * Math.PI / 12); m = [1, t, 0, 1, 0, -t * xa]; }
      d.m = m;
      App.sel.forEach((o, k) => setFrom(o, d.orig[k], m));
      App.render();
    } else if (d.k === 'center') {
      this.rc = [ev.x, ev.y];
      const r = V.snapPoint(this.rc, {}); this.rc = r.p; V.snapHint = r.hint;
      App.overlay();
    } else if (d.k === 'glyph') {
      const o = d.o, def = PS[o.sh], [lx, ly] = ap(inv(o.tf), ev.x, ev.y);
      const p = deep(d.orig); def.hd[d.i].set(o.w, o.h, p, lx, ly); o.p = p;
      App.render();
    } else if (d.k === 'guide') {
      const g = d.g; g.v = g.o === 'h' ? ev.y : ev.x;
      const r = V.snapPoint([ev.x, ev.y], { guides: false }); g.v = g.o === 'h' ? r.p[1] : r.p[0];
      App.overlay();
    } else if (d.k === 'marq') { d.x1 = ev.x; d.y1 = ev.y; App.overlay(); }
  },
  up(ev) {
    const d = this.drag; this.drag = null;
    clearSnap();
    if (!d) return;
    if (d.k === 'marq') {
      const x0 = Math.min(d.x0, d.x1), x1 = Math.max(d.x0, d.x1), y0 = Math.min(d.y0, d.y1), y1 = Math.max(d.y0, d.y1);
      if ((x1 - x0) * V.z < 3 && (y1 - y0) * V.z < 3) { if (!d.add) App.clearSel(); App.overlay(); return; }
      const hits = [];
      for (const o of App.isolate ? App.ctxList : App.allObjects()) {
        if (o.hid || o.lock) continue;
        const b = objBox(o); if (!b) continue;
        const inside = b.x >= x0 && b.x + b.w <= x1 && b.y >= y0 && b.y + b.h <= y1;
        const touch = b.x <= x1 && b.x + b.w >= x0 && b.y <= y1 && b.y + b.h >= y0;
        if (d.touch ? touch : inside) hits.push(o);
      }
      App.select(hits, d.add ? 'add' : 'set');
      return;
    }
    if (d.k === 'guide') {
      const r = V.el.getBoundingClientRect();
      if (ev.cx < r.left || ev.cy < r.top) { App.page.guides.splice(App.page.guides.indexOf(d.g), 1); V.selGuide = null; }
      App.commit('Pindahkan garis bantu'); return;
    }
    if (d.k === 'center') return;
    if (d.k === 'glyph') { App.commit('Ubah bentuk'); return; }
    if (d.k === 'move' && !this.moved) {
      if (d.was) { this.mode = this.mode === 'scale' ? 'rotate' : 'scale'; this.rc = null; App.overlay(); }
      return;
    }
    if (!this.moved || !d.m) return;
    if (this.copy) { // leave original
      const copies = App.sel.map((o, i) => { const c = cloneObj(deep(o)); setFrom(o, d.orig[i], [1, 0, 0, 1, 0, 0]); return c; });
      for (let i = 0; i < copies.length; i++) { const w = App.where(App.sel[i]); w.list.splice(w.list.indexOf(App.sel[i]) + 1, 0, copies[i]); }
      App.dirtyIndex(); App.sel = copies;
      App.commit('Salin saat menyeret');
      return;
    }
    App.commit({ move: 'Pindahkan', scale: 'Skala', rot: 'Putar', skew: 'Miringkan' }[d.k] || 'Ubah');
  },
  key(e) {
    if (e.key === '+' && this.drag && this.moved) { this.copy = true; return true; }
    if (e.key === 'Escape') {
      if (this.drag) { const d = this.drag; if (d.orig) App.sel.forEach((o, i) => setFrom(o, d.orig[i], [1, 0, 0, 1, 0, 0])); this.drag = null; App.render(); return true; }
      if (App.isolate) { App.run?.('isoEnd'); return true; }
      App.clearSel(); return true;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && V.selGuide) { App.page.guides.splice(App.page.guides.indexOf(V.selGuide), 1); V.selGuide = null; App.commit('Hapus garis bantu'); return true; }
    if (e.key === 'Tab') {
      const list = App.ctxList.filter(o => !o.hid && !o.lock);
      if (!list.length) return true;
      const i = App.sel.length ? list.indexOf(App.sel[App.sel.length - 1]) : -1;
      App.select(list[(i + (e.shiftKey ? -1 : 1) + list.length) % list.length]);
      return true;
    }
    return false;
  },
  dbl(ev) {
    const o = V.hit(ev, { deep: ev.mod });
    if (!o) { if (App.isolate) App.run?.('isoEnd'); return; }
    if (o.type === 'text') { App.select(o); App.setTool('text', { edit: o, at: [ev.x, ev.y] }); return; }
    if (o.type === 'table') { App.select(o); App.ui.editTable?.(o, ev); return; }
    if (o.type === 'g' || o.pc?.length) { App.run?.('isolate', o); return; }
    if (o.type === 'dim' && (o.k === 'lead')) { App.ui.editLabel?.(o); return; }
    if (o.type === 'img') return App.ui.openDialog?.('bitmapfx');
    App.select(o); App.setTool('shape');
  },
  hover(ev) {
    this.syncMode();
    const b = App.selBox();
    if (b && App.sel.length) {
      if (App.sel.length === 1 && App.sel[0].type === 'ps' && psHandles(App.sel[0]).some(h => near(ev, S(...h.w), 7))) return setCursor('pointer');
      const h = this.handleAt(ev, b);
      if (h) return setCursor(h.center ? 'move' : this.mode === 'rotate' ? (h.i % 2 ? (h.i === 1 || h.i === 5 ? 'ew-resize' : 'ns-resize') : 'alias') : CUR[h.i]);
    }
    if (V.guideAt(ev)) return setCursor(V.guideAt(ev).o === 'h' ? 'row-resize' : 'col-resize');
    setCursor('default');
  },
  overlay() {
    let s = '';
    const d = this.drag;
    if (d?.k === 'marq') {
      const [a, b] = [S(d.x0, d.y0), S(d.x1, d.y1)];
      s += rectSVG({ x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1]) }, d.touch ? 'mq touch' : 'mq');
    }
    this.syncMode();
    const bx = App.selBox();
    if (!bx || !App.sel.length) return s;
    const r = boxS(bx, 6), hp = handlePts(bx);
    const locked = App.sel.every(o => o.lock);
    if (App.sel.length > 1 || d?.k === 'move') for (const o of App.sel) { const b = objBox(o); if (b) s += rectSVG(boxS(b), 'obox'); }
    s += rectSVG(r, 'sbox');
    if (locked) { for (const p of hp) s += `<path class="lk" d="M${p[0] - 3} ${p[1] - 3}l6 6m0-6l-6 6"/>`; return s; }
    if (this.mode === 'rotate') {
      hp.forEach((p, i) => { s += i % 2 === 0 ? rotGlyph(p, i) : skewGlyph(p, i); });
      const c = S(...this.center(bx));
      s += `<circle class="rc" cx="${c[0]}" cy="${c[1]}" r="6"/><circle class="rcd" cx="${c[0]}" cy="${c[1]}" r="1.6"/>`;
    } else {
      hp.forEach(p => { s += sq(p[0], p[1], 'h', 3.5); });
      const c = [r.x + r.w / 2, r.y + r.h / 2];
      s += `<path class="cx" d="M${c[0] - 3.5} ${c[1] - 3.5}l7 7m0-7l-7 7"/>`;
    }
    if (App.sel.length === 1 && App.sel[0].type === 'ps') for (const h of psHandles(App.sel[0])) { const p = S(...h.w); s += dia(p[0], p[1]); }
    if (App.sel.length === 1 && App.sel[0].type === 'text' && App.sel[0].mode === 'para') {
      const o = App.sel[0], g = geom(o);
      if (g.lay?.overflow) { const p = S(...ap(o.tf, o.w / 2, o.h)); s += `<rect class="ovf" x="${p[0] - 6}" y="${p[1] + 2}" width="12" height="8" rx="1.5"/>`; }
    }
    return s;
  },
};
function rotGlyph(p, i) {
  const sx = i === 0 || i === 6 ? -1 : 1, sy = i < 3 ? -1 : 1, x = p[0] + sx * 2, y = p[1] + sy * 2;
  return `<g class="rg" transform="translate(${x} ${y}) scale(${sx} ${sy})"><path d="M-4 6A10 10 0 0 1 6 -4"/><path d="M-6.5 3.5L-4 6.5L-1.5 3.5M3.5 -6.5L6.5 -4L3.5 -1.5"/></g>`;
}
function skewGlyph(p, i) {
  const h = i === 1 || i === 5;
  return `<g class="rg" transform="translate(${p[0]} ${p[1]})${h ? '' : ' rotate(90)'}"><path d="M-7 0H7M-4.5 -2.5L-7 0L-4.5 2.5M4.5 -2.5L7 0L4.5 2.5"/></g>`;
}

// ---------- Freehand pick (lasso) ----------
export const FreePick = {
  id: 'freepick', name: 'Alat Pilih Bebas',
  activate() { hint('Seret laso mengelilingi objek untuk memilih · Shift menambah'); setCursor('crosshair'); },
  down(ev) { this.pts = [[ev.x, ev.y]]; this.add = ev.shift; },
  move(ev) { if (!ev.down || !this.pts) return; this.pts.push([ev.x, ev.y]); App.overlay(); },
  up() {
    if (!this.pts) return;
    const poly = [{ c: true, pts: this.pts }], hits = [];
    for (const o of App.allObjects()) {
      const b = objBox(o); if (!b || o.lock) continue;
      if ([[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]].every(([x, y]) => inPolys(poly, x, y))) hits.push(o);
    }
    this.pts = null;
    App.select(hits, this.add ? 'add' : 'set');
  },
  overlay() {
    let s = Pick.overlay.call({ ...Pick, drag: null, mode: 'scale', syncMode() { } });
    if (this.pts) s += `<path class="mq" d="M${this.pts.map(p => S(...p).map(v => v.toFixed(1)).join(' ')).join('L')}Z"/>`;
    return s;
  },
};

// ---------- Free transform (free rotate around the press point) ----------
export const XForm = {
  id: 'xform', name: 'Alat Transformasi Bebas', sub: 'rot',
  activate() { hint(App.sel.length ? 'Seret untuk memutar bebas di sekitar titik klik · Pilih mode di bilah properti' : 'Pilih objek terlebih dahulu'); setCursor('crosshair'); },
  down(ev) {
    if (!App.sel.length) { const o = V.hit(ev); if (o) App.select(o); return; }
    this.d = { c: [ev.x, ev.y], orig: App.sel.map(o => deep(o)), p: [ev.x, ev.y] };
  },
  move(ev) {
    const d = this.d; if (!ev.down || !d) return;
    d.p = [ev.x, ev.y];
    const dx = ev.x - d.c[0], dy = ev.y - d.c[1], L = Math.hypot(dx, dy);
    if (L * V.z < 4) return;
    const b = selBox(d.orig) || { x: d.c[0], y: d.c[1], w: 1, h: 1 };
    let m;
    if (this.sub === 'rot') { let a = Math.atan2(dy, dx) * 180 / Math.PI; if (ev.mod) a = Math.round(a / 15) * 15; m = R(a, d.c[0], d.c[1]); }
    else if (this.sub === 'mirror') { const a = Math.atan2(dy, dx); m = mul(R(a * 180 / Math.PI, d.c[0], d.c[1]), mul(Sc(1, -1, d.c[0], d.c[1]), R(-a * 180 / Math.PI, d.c[0], d.c[1]))); }
    else if (this.sub === 'scale') { const s = Math.max(.02, L / Math.max(b.w, b.h) * 2); m = Sc(s, s, d.c[0], d.c[1]); }
    else { m = K(Math.atan2(dx, Math.max(1, b.h)) * 180 / Math.PI, Math.atan2(dy, Math.max(1, b.w)) * 180 / Math.PI, d.c[0], d.c[1]); }
    d.m = m;
    App.sel.forEach((o, i) => setFrom(o, d.orig[i], m));
    App.render();
  },
  up() { if (this.d?.m) App.commit('Transformasi bebas'); this.d = null; },
  overlay() {
    let s = Pick.overlay.call({ ...Pick, drag: null, mode: 'scale', syncMode() { } });
    if (this.d) { const a = S(...this.d.c), b = S(...this.d.p); s += line(a, b, 'ln acc') + dot(a[0], a[1], 'hd', 3.5); }
    return s;
  },
};

// ---------- Zoom & Pan ----------
export const Zoom = {
  id: 'zoom', name: 'Alat Zoom',
  activate() { setCursor('zoom-in'); hint('Klik memperbesar · Shift+klik / klik kanan memperkecil · Seret untuk memperbesar area'); },
  down(ev) { this.d = { x0: ev.x, y0: ev.y, x1: ev.x, y1: ev.y, out: ev.shift }; },
  move(ev) { if (ev.down && this.d) { this.d.x1 = ev.x; this.d.y1 = ev.y; App.overlay(); } setCursor(ev.shift ? 'zoom-out' : 'zoom-in'); },
  up(ev) {
    const d = this.d; this.d = null; if (!d) return;
    const w = Math.abs(d.x1 - d.x0) * V.z, h = Math.abs(d.y1 - d.y0) * V.z;
    if (w > 6 && h > 6) V.fit({ x: Math.min(d.x0, d.x1), y: Math.min(d.y0, d.y1), w: Math.abs(d.x1 - d.x0), h: Math.abs(d.y1 - d.y0) }, 10);
    else V.zoomAt(d.out ? 0.5 : 2, ev.sx, ev.sy);
  },
  rightDown(ev) { V.zoomAt(0.5, ev.sx, ev.sy); },
  context() { return true; },
  overlay() { if (!this.d) return ''; const a = S(this.d.x0, this.d.y0), b = S(this.d.x1, this.d.y1); return rectSVG({ x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1]) }, 'mq'); },
};
export const Pan = {
  id: 'pan', name: 'Alat Geser Tampilan',
  activate() { setCursor('grab'); hint('Seret untuk menggeser tampilan · Dobel klik untuk memperbesar'); },
  dbl(ev) { V.zoomAt(2, ev.sx, ev.sy); },
};
export { applyM };
