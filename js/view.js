// Viewport: zoom/pan, rulers, grid, guidelines, overlay layer, pointer dispatch, hit-testing and snapping.
import { App } from './app.js';
import { objBox, polysOf, geom } from './objgeom.js';
import { distPolys, msvg } from './geom.js';
import { UNITS, clamp, isMod, uid } from './util.js';
import { walk } from './model.js';

export const PX = 96 / 25.4; // CSS px per mm at 100 %
const $ = id => document.getElementById(id);

export const V = {
  z: PX, tx: 40, ty: 40, w: 800, h: 600,
  init() {
    this.el = $('viewport'); this.cv = $('cv'); this.ov = $('ov'); this.rh = $('rulerH'); this.rv = $('rulerV');
    this.cv.innerHTML = `<defs><filter id="pgsh" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy="1.2" stdDeviation="2.4" flood-color="#000" flood-opacity=".35"/></filter></defs>
      <g id="world"><g id="pageG"></g><g id="gridG"></g><g id="content"><defs id="cdefs"></defs><g id="cbody"></g></g><g id="pageTop"></g></g>`;
    this.world = $('world'); this.pageG = $('pageG'); this.gridG = $('gridG'); this.cdefs = $('cdefs'); this.cbody = $('cbody'); this.pageTop = $('pageTop');
    new ResizeObserver(() => this.resize()).observe(this.el);
    this.resize();
    this.bindPointer();
    this.bindRulers();
  },
  resize() {
    const r = this.el.getBoundingClientRect();
    this.w = r.width; this.h = r.height;
    this.cv.setAttribute('width', this.w); this.cv.setAttribute('height', this.h);
    this.ov.setAttribute('width', this.w); this.ov.setAttribute('height', this.h);
    this.apply();
  },
  get() { return { z: this.z, tx: this.tx, ty: this.ty }; },
  set(v) { this.z = v.z; this.tx = v.tx; this.ty = v.ty; this.apply(); },
  apply() {
    this.world?.setAttribute('transform', `matrix(${this.z} 0 0 ${this.z} ${this.tx} ${this.ty})`);
    this.drawGrid(); this.drawRulers(); App.overlay(); App.emit('view');
  },
  toW(cx, cy) { const r = this.el.getBoundingClientRect(); return [(cx - r.left - this.tx) / this.z, (cy - r.top - this.ty) / this.z]; },
  toS(x, y) { return [x * this.z + this.tx, y * this.z + this.ty]; },
  get pct() { return this.z / PX * 100; },
  zoomAt(f, sx = this.w / 2, sy = this.h / 2) {
    const z = clamp(this.z * f, PX * 0.01, PX * 640);
    const k = z / this.z;
    this.tx = sx - (sx - this.tx) * k; this.ty = sy - (sy - this.ty) * k; this.z = z;
    this.apply();
  },
  zoomTo(pct) { this.zoomAt(pct / 100 * PX / this.z); },
  fit(b, pad = 36) {
    if (!b || !(b.w || b.h)) return;
    const r = this.el.getBoundingClientRect(); if (r.width) { this.w = r.width; this.h = r.height; }
    const w = Math.max(b.w, 1e-3), h = Math.max(b.h, 1e-3);
    this.z = clamp(Math.min((this.w - pad * 2) / w, (this.h - pad * 2) / h), PX * 0.01, PX * 640);
    this.tx = (this.w - w * this.z) / 2 - b.x * this.z; this.ty = (this.h - h * this.z) / 2 - b.y * this.z;
    this.apply();
  },
  fitPage() { const p = App.page; if (p) this.fit({ x: 0, y: 0, w: p.w, h: p.h }); },
  fitWidth() { const p = App.page; if (!p) return; this.w = this.el.getBoundingClientRect().width || this.w; this.z = (this.w - 60) / p.w; this.tx = 30; this.ty = 30; this.apply(); },
  fitAll() {
    let b = null;
    for (const o of App.allObjects()) { const ob = objBox(o); if (ob) b = b ? { x: Math.min(b.x, ob.x), y: Math.min(b.y, ob.y), w: Math.max(b.x + b.w, ob.x + ob.w) - Math.min(b.x, ob.x), h: Math.max(b.y + b.h, ob.y + ob.h) - Math.min(b.y, ob.y) } : ob; }
    b ? this.fit(b) : this.fitPage();
  },
  fitSel() { const b = App.selBox(); b ? this.fit(b, 60) : this.fitPage(); },
  pan(dx, dy) { this.tx += dx; this.ty += dy; this.apply(); },

  // ---------- content ----------
  setContent(defs, body, page) {
    this.cdefs.innerHTML = defs;
    this.cbody.innerHTML = body;
    if (this._pg !== page.w + 'x' + page.h + page.bg + App.doc.bleed + App.settings.showBleed) {
      this._pg = page.w + 'x' + page.h + page.bg + App.doc.bleed + App.settings.showBleed;
      const bl = App.doc.bleed || 0;
      this.pageG.innerHTML = `<rect x="0" y="0" width="${page.w}" height="${page.h}" fill="${page.bg || '#fff'}" filter="url(#pgsh)"/>`;
      this.pageTop.innerHTML = `<rect x="0" y="0" width="${page.w}" height="${page.h}" fill="none" stroke="var(--page-edge)" stroke-width="1" vector-effect="non-scaling-stroke"/>` +
        (bl && App.settings.showBleed ? `<rect x="${-bl}" y="${-bl}" width="${page.w + 2 * bl}" height="${page.h + 2 * bl}" fill="none" stroke="#e5484d" stroke-width="1" stroke-dasharray="4 3" vector-effect="non-scaling-stroke"/>` : '');
    }
  },

  // ---------- grid ----------
  drawGrid() {
    if (!this.gridG) return;
    const d = App.doc;
    if (!d || !d.grid.show) { this.gridG.innerHTML = ''; return; }
    let gx = d.grid.x, gy = d.grid.y;
    while (gx * this.z < 6) gx *= 2; while (gy * this.z < 6) gy *= 2;
    const [x0, y0] = [(-this.tx) / this.z, (-this.ty) / this.z], x1 = x0 + this.w / this.z, y1 = y0 + this.h / this.z;
    let p = '';
    if (d.grid.dots) {
      for (let x = Math.floor(x0 / gx) * gx; x <= x1; x += gx) for (let y = Math.floor(y0 / gy) * gy; y <= y1; y += gy) p += `M${x} ${y}h0`;
      this.gridG.innerHTML = `<path d="${p}" stroke="var(--grid)" stroke-width="2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`;
      return;
    }
    for (let x = Math.floor(x0 / gx) * gx; x <= x1; x += gx) p += `M${x} ${y0}V${y1}`;
    for (let y = Math.floor(y0 / gy) * gy; y <= y1; y += gy) p += `M${x0} ${y}H${x1}`;
    this.gridG.innerHTML = `<path d="${p}" stroke="var(--grid)" stroke-width="1" vector-effect="non-scaling-stroke" fill="none"/>`;
  },

  // ---------- rulers ----------
  drawRulers() {
    if (!this.rh || !App.doc) return;
    const show = App.settings.rulers;
    document.getElementById('stage').classList.toggle('norulers', !show);
    if (!show) return;
    const css = getComputedStyle(document.documentElement);
    const fg = css.getPropertyValue('--ruler-tx').trim() || '#888', bg = css.getPropertyValue('--ruler-bg').trim() || '#222', ac = css.getPropertyValue('--accent').trim();
    const u = App.doc.units, ppu = this.z * UNITS[u], dpr = window.devicePixelRatio || 1;
    let step = 1;
    const nice = [1, 2, 5];
    for (let e = -4; e < 8; e++) { let f = false; for (const n of nice) { const s = n * 10 ** e; if (s * ppu >= 64) { step = s; f = true; break; } } if (f) break; }
    const minor = step * ppu / 10 >= 5 ? step / 10 : step * ppu / 5 >= 5 ? step / 5 : step / 2;
    const page = App.page, yUp = App.settings.yUp;
    const draw = (cv, horiz) => {
      const W = horiz ? cv.clientWidth : cv.clientHeight, H = horiz ? cv.clientHeight : cv.clientWidth;
      if (!W || !H) return;
      cv.width = (horiz ? W : H) * dpr; cv.height = (horiz ? H : W) * dpr;
      const c = cv.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.fillStyle = bg; c.fillRect(0, 0, horiz ? W : H, horiz ? H : W);
      if (!horiz) { c.translate(H, 0); c.rotate(Math.PI / 2); }
      c.strokeStyle = fg; c.fillStyle = fg; c.lineWidth = 1; c.font = '9.5px -apple-system, "Segoe UI", sans-serif'; c.textBaseline = 'top';
      const off = horiz ? this.tx : this.ty;
      const toVal = s => (s - off) / this.z / UNITS[u];
      const v0 = toVal(0), v1 = toVal(W);
      const ostart = Math.floor(v0 / minor) * minor;
      c.beginPath();
      for (let v = ostart; v <= v1; v += minor) {
        const s = Math.round(v * UNITS[u] * this.z + off) + .5, isMaj = Math.abs(v / step - Math.round(v / step)) < 1e-6;
        const len = isMaj ? H : Math.abs(v / (step / 2) - Math.round(v / (step / 2))) < 1e-6 ? H * .45 : H * .25;
        c.moveTo(s, H); c.lineTo(s, H - len);
        if (isMaj) {
          let lab = v; if (!horiz && yUp) lab = page.h / UNITS[u] - v;
          const t = +lab.toFixed(4);
          if (horiz) c.fillText(String(t), s + 3, 2);
          else { c.save(); c.translate(s + 3, 2); c.scale(1, 1); c.fillText(String(t), 0, 0); c.restore(); }
        }
      }
      c.stroke();
      c.strokeStyle = 'rgba(127,127,127,.35)'; c.beginPath(); c.moveTo(0, H - .5); c.lineTo(W, H - .5); c.stroke();
      // cursor marker
      if (this._cur) {
        const s = horiz ? this._cur[0] * this.z + this.tx : this._cur[1] * this.z + this.ty;
        c.strokeStyle = ac; c.beginPath(); c.moveTo(Math.round(s) + .5, 0); c.lineTo(Math.round(s) + .5, H); c.stroke();
      }
    };
    draw(this.rh, true); draw(this.rv, false);
  },
  bindRulers() {
    const start = (e, o) => {
      if (!App.doc) return;
      e.preventDefault();
      const g = { id: uid('G'), o, v: 0, tmp: true };
      this._dragGuide = g;
      const mv = ev => { const [x, y] = this.toW(ev.clientX, ev.clientY); const s = this.snapPoint([x, y], { guides: false }); g.v = o === 'h' ? s.p[1] : s.p[0]; this._cur = [x, y]; App.overlay(); };
      const up = ev => {
        removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
        this._dragGuide = null;
        const r = this.el.getBoundingClientRect();
        if (ev.clientX > r.left && ev.clientY > r.top) { delete g.tmp; App.page.guides.push(g); App.commit('Tambah garis bantu'); }
        App.overlay();
      };
      addEventListener('pointermove', mv); addEventListener('pointerup', up);
    };
    this.rh.addEventListener('pointerdown', e => start(e, 'h'));
    this.rv.addEventListener('pointerdown', e => start(e, 'v'));
    this.rh.addEventListener('dblclick', () => App.ui.openDialog?.('options', 'rulers'));
    this.rv.addEventListener('dblclick', () => App.ui.openDialog?.('options', 'rulers'));
    $('rcorner')?.addEventListener('dblclick', () => App.ui.openDialog?.('options', 'rulers'));
  },

  // ---------- overlay ----------
  drawOverlay() {
    if (!this.ov) return;
    if (!App.doc || App.startOn) { this.ov.innerHTML = ''; return; }
    let s = '';
    const p = App.page;
    const gl = [...(p.guides || []), ...(this._dragGuide ? [this._dragGuide] : [])];
    if (App.settings.guides !== false) for (const g of gl) {
      const sel = g === this.selGuide;
      const col = sel ? '#e5484d' : 'var(--guide)';
      if (g.o === 'h') { const y = Math.round(g.v * this.z + this.ty) + .5; s += `<line x1="0" y1="${y}" x2="${this.w}" y2="${y}" stroke="${col}" stroke-dasharray="${g.lock ? '1 3' : '6 4'}"/>`; }
      else { const x = Math.round(g.v * this.z + this.tx) + .5; s += `<line x1="${x}" y1="0" x2="${x}" y2="${this.h}" stroke="${col}" stroke-dasharray="${g.lock ? '1 3' : '6 4'}"/>`; }
    }
    if (App.isolate) {
      const b = objBox(App.isolate);
      if (b) { const [x, y] = this.toS(b.x, b.y); s += `<rect x="${x}" y="${y}" width="${b.w * this.z}" height="${b.h * this.z}" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="5 3"/>`; }
    }
    try { s += App.tool?.overlay?.() || ''; } catch (e) { console.error(e); }
    if (this.snapHint) {
      const [x, y] = this.toS(...this.snapHint.p);
      s += `<g class="snapmark"><rect x="${x - 4}" y="${y - 4}" width="8" height="8" fill="none" stroke="var(--snap)" stroke-width="1.5"/>${this.snapHint.label ? `<text x="${x + 8}" y="${y - 7}" class="snaplbl">${this.snapHint.label}</text>` : ''}</g>`;
    }
    for (const ln of this.snapLines || []) {
      if (ln.o === 'v') { const x = Math.round(ln.v * this.z + this.tx) + .5; s += `<line x1="${x}" y1="${ln.a * this.z + this.ty}" x2="${x}" y2="${ln.b * this.z + this.ty}" stroke="var(--snap)" stroke-dasharray="3 2"/>`; }
      else { const y = Math.round(ln.v * this.z + this.ty) + .5; s += `<line x1="${ln.a * this.z + this.tx}" y1="${y}" x2="${ln.b * this.z + this.tx}" y2="${y}" stroke="var(--snap)" stroke-dasharray="3 2"/>`; }
    }
    this.ov.innerHTML = s;
  },

  // ---------- pointer ----------
  ev(e) {
    const r = this.el.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
    return { x: (sx - this.tx) / this.z, y: (sy - this.ty) / this.z, sx, sy, cx: e.clientX, cy: e.clientY, shift: e.shiftKey, alt: e.altKey, mod: isMod(e), ctrl: e.ctrlKey, btn: e.button, e, pressure: e.pressure };
  },
  bindPointer() {
    const el = this.el;
    let panning = null;
    el.addEventListener('pointerdown', e => {
      if (!App.doc || App.startOn) return;
      if (document.activeElement && document.activeElement !== document.body && !el.contains(document.activeElement)) document.activeElement.blur();
      if (e.button === 1 || (this.spaceDown && e.button === 0) || (App.toolId === 'pan' && e.button === 0)) {
        e.preventDefault(); panning = { x: e.clientX, y: e.clientY }; el.setPointerCapture(e.pointerId); el.classList.add('panning'); return;
      }
      if (e.button === 2 && App.tool?.rightDown) { App.tool.rightDown(this.ev(e)); return; }
      if (e.button !== 0) return;
      el.setPointerCapture(e.pointerId);
      this.down = true;
      App.tool?.down?.(this.ev(e));
    });
    el.addEventListener('pointermove', e => {
      if (!App.doc || App.startOn) return;
      if (panning) { this.pan(e.clientX - panning.x, e.clientY - panning.y); panning = { x: e.clientX, y: e.clientY }; return; }
      const ev = this.ev(e);
      ev.down = this.down;
      this._cur = [ev.x, ev.y];
      App.emit('cursor', ev);
      if (App.settings.rulers) this.drawRulersCursor();
      App.tool?.move?.(ev);
    });
    const up = e => {
      if (panning) { panning = null; el.classList.remove('panning'); return; }
      if (!this.down) return;
      this.down = false;
      this.snapHint = null; this.snapLines = null;
      App.tool?.up?.(this.ev(e));
      App.overlay();
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('dblclick', e => { if (App.doc && !App.startOn) App.tool?.dbl?.(this.ev(e)); });
    el.addEventListener('contextmenu', e => {
      e.preventDefault();
      if (!App.doc || App.startOn) return;
      if (App.tool?.context?.(this.ev(e))) return;
      App.ui.contextMenu?.(e);
    });
    el.addEventListener('wheel', e => {
      if (!App.doc || App.startOn) return;
      e.preventDefault();
      const r = el.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
      const mode = App.settings.wheel;
      const mouseWheel = e.deltaMode !== 0 || (Math.abs(e.deltaY) >= 40 && e.deltaX === 0 && Number.isInteger(e.deltaY));
      const zoom = e.ctrlKey || e.metaKey || mode === 'zoom' || (mode === 'auto' && mouseWheel && !e.shiftKey);
      if (zoom) {
        const k = e.ctrlKey && !mouseWheel ? Math.exp(-e.deltaY * 0.012) : Math.exp(-Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 120) * 0.0022 * (e.deltaMode === 1 ? 33 : 1));
        this.zoomAt(k, sx, sy);
      } else this.pan(-(e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX), e.shiftKey && !e.deltaX ? 0 : -e.deltaY);
    }, { passive: false });
    // Safari trackpad pinch
    let gs = 1;
    el.addEventListener('gesturestart', e => { e.preventDefault(); gs = 1; });
    el.addEventListener('gesturechange', e => { e.preventDefault(); const r = el.getBoundingClientRect(); this.zoomAt(e.scale / gs, e.clientX - r.left, e.clientY - r.top); gs = e.scale; });
  },
  drawRulersCursor() { cancelAnimationFrame(this._rcq); this._rcq = requestAnimationFrame(() => this.drawRulers()); },

  // ---------- hit testing ----------
  hit(ev, { deep = false, all = false } = {}) {
    const els = document.elementsFromPoint(ev.cx, ev.cy);
    const idx = App.index();
    const seen = new Set();
    const res = [];
    for (const el of els) {
      if (!this.cbody.contains(el)) continue;
      const g = el.closest('[data-oid]');
      if (!g || seen.has(g.dataset.oid)) continue;
      seen.add(g.dataset.oid);
      const w = idx.get(g.dataset.oid);
      if (!w || w.layer.lock || !w.layer.vis) continue;
      if (w.o.lock && !all) { res.push(App.topOf(w.o)); continue; }
      res.push(deep ? w.o : App.topOf(w.o));
      if (!all) break;
    }
    if (res.length) return all ? res : res[0];
    // thin outlines / open curves: geometric fallback
    const tol = 5 / this.z, list = App.ctxList;
    for (let i = list.length - 1; i >= 0; i--) {
      const o = list[i];
      if (o.hid) continue;
      try {
        const leafs = [];
        walk([o], c => { if (!c.ch && c.type !== 'blend') leafs.push(c); });
        for (const c of leafs) {
          if (['dim', 'conn', 'img', 'table', 'qr'].includes(c.type)) { const b = objBox(c); if (b && ev.x >= b.x - tol && ev.x <= b.x + b.w + tol && ev.y >= b.y - tol && ev.y <= b.y + b.h + tol) return deep ? c : o; continue; }
          if (distPolys(polysOf(c, .2), ev.x, ev.y) < tol + (c.ol?.w || 0) / 2) return deep ? c : o;
        }
      } catch { }
    }
    return all ? [] : null;
  },

  // ---------- snapping ----------
  prepSnap(exclude = new Set()) {
    const d = App.doc, p = App.page, xs = [], ys = [], pts = [];
    if (d.snap.page) { [0, p.w / 2, p.w].forEach(v => xs.push({ v, k: 'Halaman' })); [0, p.h / 2, p.h].forEach(v => ys.push({ v, k: 'Halaman' })); pts.push([p.w / 2, p.h / 2, 'Tengah halaman']); }
    if (d.snap.guides) for (const g of p.guides) (g.o === 'h' ? ys : xs).push({ v: g.v, k: 'Garis bantu' });
    if (d.snap.objects || d.snap.dyn) {
      let n = 0;
      for (const o of App.allObjects()) {
        if (exclude.has(o) || n > 400) continue;
        const b = objBox(o); if (!b) continue;
        n++;
        if (d.snap.dyn) {
          xs.push({ v: b.x, k: 'Tepi', a: b.y, b: b.y + b.h }, { v: b.x + b.w / 2, k: 'Tengah', a: b.y, b: b.y + b.h }, { v: b.x + b.w, k: 'Tepi', a: b.y, b: b.y + b.h });
          ys.push({ v: b.y, k: 'Tepi', a: b.x, b: b.x + b.w }, { v: b.y + b.h / 2, k: 'Tengah', a: b.x, b: b.x + b.w }, { v: b.y + b.h, k: 'Tepi', a: b.x, b: b.x + b.w });
        }
        if (d.snap.objects) {
          pts.push([b.x + b.w / 2, b.y + b.h / 2, 'Pusat'], [b.x, b.y, 'Sudut'], [b.x + b.w, b.y, 'Sudut'], [b.x, b.y + b.h, 'Sudut'], [b.x + b.w, b.y + b.h, 'Sudut'],
            [b.x + b.w / 2, b.y, 'Titik tengah'], [b.x + b.w / 2, b.y + b.h, 'Titik tengah'], [b.x, b.y + b.h / 2, 'Titik tengah'], [b.x + b.w, b.y + b.h / 2, 'Titik tengah']);
          if (['curve', 'rect', 'poly', 'ps', 'ell', 'spiral'].includes(o.type)) {
            const gp = geom(o).p; let k = 0;
            for (const s of gp.sp) for (const q of s.n) { if (k++ > 120) break; pts.push([q.x, q.y, 'Node']); }
          }
        }
      }
    }
    return this._snap = { xs, ys, pts };
  },
  snapPoint(pt, { exclude, guides = true, prep } = {}) {
    const d = App.doc;
    if (!d) return { p: pt };
    const S = prep || this._snapPrepFor(exclude);
    const tol = 7 / this.z;
    let [x, y] = pt, hint = null, lines = [];
    // points first
    let best = tol;
    for (const q of S.pts) { const dd = Math.hypot(q[0] - pt[0], q[1] - pt[1]); if (dd < best) { best = dd; x = q[0]; y = q[1]; hint = { p: [x, y], label: q[2] }; } }
    if (!hint) {
      let bx = tol, by = tol;
      for (const c of S.xs) { if (!guides && c.k === 'Garis bantu') continue; const dd = Math.abs(c.v - pt[0]); if (dd < bx) { bx = dd; x = c.v; hint = { p: [x, y], label: c.k }; } }
      for (const c of S.ys) { if (!guides && c.k === 'Garis bantu') continue; const dd = Math.abs(c.v - pt[1]); if (dd < by) { by = dd; y = c.v; hint = { p: [x, y], label: c.k }; } }
      if (d.grid.snap) {
        const gx = Math.round(pt[0] / d.grid.x) * d.grid.x, gy = Math.round(pt[1] / d.grid.y) * d.grid.y;
        if (bx >= tol && Math.abs(gx - pt[0]) < tol * 1.6) x = gx;
        if (by >= tol && Math.abs(gy - pt[1]) < tol * 1.6) y = gy;
        if (!hint && (x === gx || y === gy)) hint = { p: [x, y], label: 'Kisi' };
      }
      if (hint) hint.p = [x, y];
    }
    if (hint && d.snap.dyn) {
      for (const c of S.xs) if (Math.abs(c.v - x) < 1e-6 && c.a != null) lines.push({ o: 'v', v: x, a: Math.min(c.a, y), b: Math.max(c.b, y) });
      for (const c of S.ys) if (Math.abs(c.v - y) < 1e-6 && c.a != null) lines.push({ o: 'h', v: y, a: Math.min(c.a, x), b: Math.max(c.b, x) });
    }
    return { p: [x, y], hint, lines };
  },
  _snapPrepFor(exclude) {
    const key = App.doc.ver + ':' + (exclude ? [...exclude].map(o => o.id).join(',') : '');
    if (this._snapKey !== key || !this._snap || this._snapStale) { this._snapKey = key; this._snapStale = false; this.prepSnap(exclude || new Set()); }
    return this._snap;
  },
  invalidateSnap() { this._snapStale = true; },
  // Snap a moving box (dx,dy proposal) to alignment targets
  snapBox(b0, dx, dy, exclude) {
    const d = App.doc, S = this._snapPrepFor(exclude), tol = 7 / this.z;
    const bx = [b0.x + dx, b0.x + b0.w / 2 + dx, b0.x + b0.w + dx], by = [b0.y + dy, b0.y + b0.h / 2 + dy, b0.y + b0.h + dy];
    let best = [tol, tol], adj = [0, 0], lines = [], lab = null;
    for (const c of S.xs) for (const v of bx) { const dd = Math.abs(c.v - v); if (dd < best[0]) { best[0] = dd; adj[0] = c.v - v; lab = c.k; } }
    for (const c of S.ys) for (const v of by) { const dd = Math.abs(c.v - v); if (dd < best[1]) { best[1] = dd; adj[1] = c.v - v; lab = c.k; } }
    if (d.grid.snap) {
      if (best[0] >= tol) { const g = Math.round(bx[0] / d.grid.x) * d.grid.x; if (Math.abs(g - bx[0]) < tol * 1.6) adj[0] = g - bx[0]; }
      if (best[1] >= tol) { const g = Math.round(by[0] / d.grid.y) * d.grid.y; if (Math.abs(g - by[0]) < tol * 1.6) adj[1] = g - by[0]; }
    }
    const ndx = dx + adj[0], ndy = dy + adj[1];
    if (d.snap.dyn) {
      const nbx = [b0.x + ndx, b0.x + b0.w / 2 + ndx, b0.x + b0.w + ndx], nby = [b0.y + ndy, b0.y + b0.h / 2 + ndy, b0.y + b0.h + ndy];
      for (const c of S.xs) if (nbx.some(v => Math.abs(v - c.v) < 1e-6)) lines.push({ o: 'v', v: c.v, a: Math.min(c.a ?? nby[0], nby[0]), b: Math.max(c.b ?? nby[2], nby[2]) });
      for (const c of S.ys) if (nby.some(v => Math.abs(v - c.v) < 1e-6)) lines.push({ o: 'h', v: c.v, a: Math.min(c.a ?? nbx[0], nbx[0]), b: Math.max(c.b ?? nbx[2], nbx[2]) });
    }
    return { dx: ndx, dy: ndy, lines: lines.slice(0, 8), label: lab };
  },
  guideAt(ev) {
    const tol = 4;
    for (const g of App.page.guides || []) {
      if (g.o === 'h' && Math.abs(g.v * this.z + this.ty - ev.sy) < tol) return g;
      if (g.o === 'v' && Math.abs(g.v * this.z + this.tx - ev.sx) < tol) return g;
    }
    return null;
  },
};
export { msvg };
