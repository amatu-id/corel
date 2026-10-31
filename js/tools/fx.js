// Interactive effect tools: drop shadow, contour, blend, distort, envelope, extrude, block shadow,
// transparency, interactive fill, eyedroppers, paint bucket and smart fill.
import { App } from '../app.js';
import { V } from '../view.js';
import { mk } from '../model.js';
import { geom, objBox, envInit, perspInit } from '../objgeom.js';
import { ap, inv, bbox, inPolys, flatten } from '../geom.js';
import { boolOp, isEmptyPath, loadGeoLibs } from '../bool.js';
import { curveOf, canCurve } from '../ops.js';
import { fillColor } from '../fills.js';
import { ensureFonts } from '../fonts.js';
import { deep, clamp, toast, rgb2hex } from '../util.js';
import { S, sq, dot, line, hint, setCursor, near, wpath } from './common.js';
import { Pick } from './pick.js';

export const FX = App.fxopt = {
  sh: { o: .5, b: 2.5, c: '#000000', k: 'flat', ang: 40, st: .5 },
  ct: { dir: 'out', n: 4, off: 2, fc: '#ffffff', oc: '#000000', join: 'round', cd: 'direct' },
  blend: { n: 12, rot: 0, cd: 'direct', acc: 0, oacc: 0, loop: false },
  dist: { k: 'push', amp: 40, freq: 12, rot: 1, smooth: false, rand: false },
  ext: { d: .28, sh: 'shade', c1: '#4f6ef7', c2: '#0b1440', light: 225, flat: false },
  bs: { c: '#1f2937' },
  tr: { t: 'lin', v: .5, m: 'normal' },
  ifill: { g: 'lin', c1: null, c2: '#ffffff' },
  smart: { c: '#ffd166', ol: true },
  env: { mode: 'curve' },
};
const selOverlay = () => Pick.overlay.call({ ...Pick, drag: null, mode: 'scale', syncMode() { } });
const center = b => [b.x + b.w / 2, b.y + b.h / 2];
function target(ev, pickNew = true) {
  const hit = V.hit(ev);
  if (hit && pickNew && !App.sel.includes(hit)) App.select(hit);
  return hit && App.sel.includes(hit) ? hit : App.sel.length === 1 ? App.sel[0] : null;
}
const setFx = (o, k, v) => { o.fx = o.fx || {}; o.fx[k] = v; };
const localBox = o => { const g = geom(o); return bbox(g.local || g.p); };
const toLocal = (o, p) => ap(inv(o.tf || [1, 0, 0, 1, 0, 0]), p[0], p[1]);

// ---------- Drop shadow ----------
export const Shadow = {
  id: 'shadow', name: 'Alat Bayangan',
  activate() { setCursor('crosshair'); hint('Seret dari tengah objek untuk bayangan datar · dari tepi bawah untuk bayangan perspektif'); },
  down(ev) {
    const o = target(ev); if (!o) return;
    const b = objBox(o); if (!b) return;
    const sh = o.fx?.sh;
    if (sh) { const c = center(b), e = S(c[0] + (sh.x || 0), c[1] + (sh.y || 0)); if (near(ev, e, 8)) { this.d = { o, edit: true, b }; return; } }
    const nearBottom = Math.abs(ev.y - (b.y + b.h)) < b.h * .15;
    this.d = { o, p0: [ev.x, ev.y], b, persp: nearBottom, orig: deep(o.fx?.sh) };
  },
  move(ev) {
    const d = this.d; if (!ev.down || !d) return;
    const o = d.o, base = { ...FX.sh, ...(d.orig || o.fx?.sh || {}) };
    if (d.edit) { const c = center(d.b); setFx(o, 'sh', { ...o.fx.sh, x: ev.x - c[0], y: ev.y - c[1] }); }
    else if (d.persp) {
      const dx = ev.x - d.p0[0], dy = d.p0[1] - ev.y;
      setFx(o, 'sh', { ...base, k: 'persp', ang: clamp(Math.atan2(dx, Math.max(1, d.b.h * .5 + dy)) * 180 / Math.PI, -80, 80), st: clamp(.5 + dy / d.b.h, .05, 1.5), x: 0, y: 0 });
    } else setFx(o, 'sh', { ...base, k: 'flat', x: ev.x - d.p0[0], y: ev.y - d.p0[1] });
    App.render();
  },
  up() { if (this.d?.o?.fx?.sh) App.commit('Bayangan'); this.d = null; },
  overlay() {
    let s = selOverlay();
    const o = App.sel[0]; if (App.sel.length !== 1 || !o.fx?.sh) return s;
    const b = objBox(o), c = center(b), sh = o.fx.sh;
    if (sh.k !== 'persp') { const a = S(...c), e = S(c[0] + (sh.x || 0), c[1] + (sh.y || 0)); s += line(a, e, 'ln acc') + sq(a[0], a[1], 'hw', 4) + sq(e[0], e[1], 'hb', 4); }
    return s;
  },
};

// ---------- Contour ----------
export const Contour = {
  id: 'contour', name: 'Alat Kontur',
  activate() { setCursor('crosshair'); hint('Seret dari tepi objek ke luar atau ke dalam untuk membuat kontur'); },
  down(ev) { const o = target(ev); if (!o) return; const b = objBox(o); this.d = { o, p0: [ev.x, ev.y], c: center(b), r0: Math.hypot(ev.x - center(b)[0], ev.y - center(b)[1]) }; },
  move(ev) {
    const d = this.d; if (!ev.down || !d) return;
    const dist = Math.hypot(ev.x - d.p0[0], ev.y - d.p0[1]); if (dist * V.z < 3) return;
    const r = Math.hypot(ev.x - d.c[0], ev.y - d.c[1]), inward = r < d.r0;
    const cur = { ...FX.ct, ...(d.o.fx?.ct || {}) };
    setFx(d.o, 'ct', { ...cur, dir: inward ? (cur.dir === 'center' ? 'center' : 'in') : 'out', off: Math.max(.1, dist / Math.max(1, cur.n)) });
    App.render();
  },
  up() { if (this.d?.o?.fx?.ct) App.commit('Kontur'); this.d = null; },
  overlay() { let s = selOverlay(); if (this.d?.p0) { const a = S(...this.d.p0); s += dot(a[0], a[1], 'hd', 3.5); } return s; },
};

// ---------- Blend ----------
export const Blend = {
  id: 'blend', name: 'Alat Campuran',
  activate() { setCursor('crosshair'); hint('Seret dari satu objek ke objek lain untuk mencampur bentuk dan warna'); },
  down(ev) { const a = V.hit(ev); if (!a) return; if (a.type === 'blend') { App.select(a); return; } this.d = { a, p0: [ev.x, ev.y], p1: [ev.x, ev.y] }; },
  move(ev) { if (ev.down && this.d) { this.d.p1 = [ev.x, ev.y]; this.d.b = V.hit(ev); App.overlay(); } },
  up(ev) {
    const d = this.d; this.d = null; App.overlay();
    if (!d) return;
    const b = V.hit(ev);
    if (!b || b === d.a || b.type === 'blend') return;
    const wa = App.where(d.a), wb = App.where(b);
    if (wa.list !== wb.list) return toast('Kedua objek harus berada di lapisan yang sama');
    const L = wa.list, ia = L.indexOf(d.a), ib = L.indexOf(b);
    const [lo, hi] = ia < ib ? [d.a, b] : [b, d.a];
    const bl = mk('blend', { a: lo, b: hi, ...deep(FX.blend) });
    L.splice(L.indexOf(hi), 1); L.splice(L.indexOf(lo), 1, bl);
    App.dirtyIndex(); App.sel = [bl];
    App.commit('Campuran');
  },
  overlay() {
    let s = selOverlay();
    if (this.d) s += line(S(...this.d.p0), S(...this.d.p1), 'ln acc') + (this.d.b && this.d.b !== this.d.a ? (() => { const b = objBox(this.d.b); const a = S(b.x, b.y); return `<rect class="obox hot" x="${a[0]}" y="${a[1]}" width="${b.w * V.z}" height="${b.h * V.z}"/>`; })() : '');
    return s;
  },
};

// ---------- Distort ----------
export const Distort = {
  id: 'distort', name: 'Alat Distorsi',
  activate() { setCursor('crosshair'); hint('Pilih mode Tarik/Dorong, Ritsleting atau Pusaran di bilah properti, lalu seret pada objek'); },
  down(ev) {
    const o = target(ev); if (!o) return;
    const lb = localBox(o), [lx, ly] = toLocal(o, [ev.x, ev.y]);
    this.d = { o, p0: [ev.x, ev.y], cx: clamp((lx - lb.x) / (lb.w || 1), -1, 2), cy: clamp((ly - lb.y) / (lb.h || 1), -1, 2), a0: 0 };
  },
  move(ev) {
    const d = this.d; if (!ev.down || !d) return;
    const dx = (ev.x - d.p0[0]) * V.z, dy = (ev.y - d.p0[1]) * V.z;
    const base = { ...FX.dist };
    if (base.k === 'push') setFx(d.o, 'dist', { ...base, cx: d.cx, cy: d.cy, amp: clamp(-dx / 2, -200, 200) });
    else if (base.k === 'zip') setFx(d.o, 'dist', { ...base, cx: d.cx, cy: d.cy, amp: clamp(Math.hypot(dx, dy) / 3, 0, 100) });
    else { const a = Math.atan2(dy, dx) / (2 * Math.PI); setFx(d.o, 'dist', { ...base, cx: d.cx, cy: d.cy, rot: Math.round(a * 100) / 100 + Math.sign(a || 1) * (Math.hypot(dx, dy) > 120 ? 1 : 0) }); }
    FX.dist.amp = d.o.fx.dist.amp ?? FX.dist.amp;
    App.render(); App.emit('sel');
  },
  up() { if (this.d?.o?.fx?.dist) App.commit('Distorsi'); this.d = null; },
  overlay() { let s = selOverlay(); if (this.d) s += line(S(...this.d.p0), S(...this.d.p0), 'ln'); return s; },
};

// ---------- Envelope ----------
export const ENV_PRESETS = {
  arch: (b) => ({ T: [0, -.25], B: [0, -.25] }), bulge: () => ({ T: [0, -.2], B: [0, .2], L: [-.2, 0], R: [.2, 0] }), pinch: () => ({ T: [0, .2], B: [0, -.2], L: [.2, 0], R: [-.2, 0] }),
  flag: () => ({ T: [0, .18], B: [0, .18] }), wedge: () => ({ TL: [0, .3], BL: [0, -.3] }), bridge: () => ({ T: [0, .25] }), valley: () => ({ B: [0, -.25], T: [0, -.0] }), trap: () => ({ TL: [.25, 0], TR: [-.25, 0] }),
};
export function applyEnvPreset(o, name) {
  const lb = localBox(o), env = envInit(lb), d = ENV_PRESETS[name](lb), idx = { TL: 0, TR: 1, BR: 2, BL: 3, T: 4, R: 5, B: 6, L: 7 };
  for (const k in d) { const i = idx[k]; env.pts[i] = [env.pts[i][0] + d[k][0] * lb.w, env.pts[i][1] + d[k][1] * lb.h]; }
  env.mode = FX.env.mode;
  setFx(o, 'env', env);
  App.commit('Amplop: preset');
}
export const Envelope = {
  id: 'envelope', name: 'Alat Amplop',
  activate() { setCursor('default'); hint('Seret node amplop untuk membentuk objek · Pilih mode & preset di bilah properti'); this.init(); },
  init() { const o = App.sel[0]; if (App.sel.length === 1 && o && o.type !== 'g' && !o.fx?.env && o.type !== 'img') { setFx(o, 'env', { ...envInit(localBox(o)), mode: FX.env.mode }); App.render(); } },
  down(ev) {
    const o = App.sel.length === 1 ? App.sel[0] : null;
    if (o?.fx?.env) { const i = o.fx.env.pts.findIndex(p => near(ev, S(...ap(o.tf, ...p)), 7)); if (i >= 0) { this.d = { o, i }; return; } }
    const hit = V.hit(ev); if (hit) { App.select(hit); this.init(); }
  },
  move(ev) {
    const d = this.d; if (!ev.down || !d) return;
    const [lx, ly] = toLocal(d.o, [ev.x, ev.y]), env = d.o.fx.env;
    if (env.mode === 'line' && d.i >= 4) return;
    env.pts[d.i] = [lx, ly];
    if (d.i < 4 && env.mode !== 'free') { // keep mid handles on the straightened edges for line mode
      const P = env.pts, mids = [[0, 1], [1, 2], [3, 2], [0, 3]];
      if (env.mode === 'line') mids.forEach(([a, b], k) => { P[4 + k] = [(P[a][0] + P[b][0]) / 2, (P[a][1] + P[b][1]) / 2]; });
    }
    App.render();
  },
  up() { if (this.d) App.commit('Ubah amplop'); this.d = null; },
  overlay() {
    let s = selOverlay();
    const o = App.sel[0]; if (App.sel.length !== 1 || !o?.fx?.env) return s;
    const P = o.fx.env.pts.map(p => S(...ap(o.tf, ...p)));
    const ctl = (a, m, c) => [2 * m[0] - (a[0] + c[0]) / 2, 2 * m[1] - (a[1] + c[1]) / 2];
    const ed = (a, m, b) => o.fx.env.mode === 'line' ? `L${b[0]} ${b[1]}` : `Q${ctl(a, m, b).join(' ')} ${b[0]} ${b[1]}`;
    s += `<path class="env" d="M${P[0].join(' ')}${ed(P[0], P[4], P[1])}${ed(P[1], P[5], P[2])}${ed(P[2], P[6], P[3])}${ed(P[3], P[7], P[0])}"/>`;
    P.forEach((p, i) => { s += sq(p[0], p[1], i < 4 ? 'n' : 'n sm', 3.5); });
    return s;
  },
};

// ---------- Extrude ----------
export const Extrude = {
  id: 'extrude', name: 'Alat Ekstrusi',
  activate() { setCursor('crosshair'); hint('Seret dari objek ke arah titik hilang untuk mengekstrusi · Seret ✕ untuk mengubah titik hilang'); },
  down(ev) {
    const o = target(ev); if (!o) return;
    const c = center(objBox(o)), e = o.fx?.ext;
    if (e) { const vp = S(c[0] + e.vp[0], c[1] + e.vp[1]); if (near(ev, vp, 9)) { this.d = { o, c }; return; } }
    this.d = { o, c };
  },
  move(ev) {
    const d = this.d; if (!ev.down || !d) return;
    const cur = { ...FX.ext, ...(d.o.fx?.ext || {}) };
    setFx(d.o, 'ext', { ...cur, vp: [(ev.x - d.c[0]) / cur.d, (ev.y - d.c[1]) / cur.d].map(v => +v.toFixed(3)) });
    App.render();
  },
  up() { if (this.d?.o?.fx?.ext) App.commit('Ekstrusi'); this.d = null; },
  overlay() {
    let s = selOverlay();
    const o = App.sel[0]; if (App.sel.length !== 1 || !o?.fx?.ext) return s;
    const c = center(objBox(o)), e = o.fx.ext, vp = S(c[0] + e.vp[0], c[1] + e.vp[1]), cs = S(...c);
    s += line(cs, vp, 'ln dim') + `<path class="vpx" d="M${vp[0] - 5} ${vp[1] - 5}l10 10m0-10l-10 10"/>`;
    return s;
  },
};
export const Block = {
  id: 'block', name: 'Alat Bayangan Blok',
  activate() { setCursor('crosshair'); hint('Seret dari objek untuk membuat bayangan blok padat'); },
  down(ev) { const o = target(ev); if (o) this.d = { o, p0: [ev.x, ev.y] }; },
  move(ev) { const d = this.d; if (!ev.down || !d) return; setFx(d.o, 'bs', { ...FX.bs, ...(d.o.fx?.bs || {}), x: ev.x - d.p0[0], y: ev.y - d.p0[1] }); App.render(); },
  up() { if (this.d?.o?.fx?.bs) App.commit('Bayangan blok'); this.d = null; },
  overlay: () => selOverlay(),
};

// ---------- Transparency ----------
export const Transp = {
  id: 'transp', name: 'Alat Transparansi',
  activate() { setCursor('crosshair'); hint('Klik objek untuk transparansi seragam · Seret untuk transparansi bergradasi'); },
  down(ev) {
    const o = target(ev); if (!o) return;
    if (o.tr?.p1) { const p1 = S(...ap(o.tf, ...o.tr.p1)), p2 = S(...ap(o.tf, ...o.tr.p2)); if (near(ev, p1, 7)) { this.d = { o, h: 'p1' }; return; } if (near(ev, p2, 7)) { this.d = { o, h: 'p2' }; return; } }
    this.d = { o, p0: [ev.x, ev.y], moved: false };
  },
  move(ev) {
    const d = this.d; if (!ev.down || !d) return;
    if (d.h) { d.o.tr[d.h] = toLocal(d.o, [ev.x, ev.y]); App.render(); return; }
    if (Math.hypot(ev.x - d.p0[0], ev.y - d.p0[1]) * V.z < 4) return;
    d.moved = true;
    const t = FX.tr.t === 'rad' ? 'rad' : 'lin';
    d.o.tr = { t, p1: toLocal(d.o, d.p0), p2: toLocal(d.o, [ev.x, ev.y]), v1: 0, v2: 1, m: FX.tr.m };
    App.render();
  },
  up() {
    const d = this.d; this.d = null; if (!d) return;
    if (!d.h && !d.moved) d.o.tr = { t: 'uni', v: FX.tr.v, m: FX.tr.m };
    App.commit('Transparansi');
  },
  overlay() {
    let s = selOverlay();
    const o = App.sel[0]; if (App.sel.length !== 1 || !o?.tr?.p1) return s;
    const a = S(...ap(o.tf, ...o.tr.p1)), b = S(...ap(o.tf, ...o.tr.p2));
    return s + line(a, b, 'ln acc') + sq(a[0], a[1], 'hw', 4) + sq(b[0], b[1], 'hb', 4);
  },
};

// ---------- Interactive fill ----------
export const IFill = {
  id: 'ifill', name: 'Alat Isian Interaktif',
  activate() { setCursor('crosshair'); hint('Seret pada objek untuk isian gradasi · Seret pegangan untuk mengatur arah · Pilih jenis isian di bilah properti'); },
  down(ev) {
    const o = target(ev); if (!o) return;
    const f = o.fill;
    if (f?.t === 'grad') { const p1 = S(...ap(o.tf, ...f.p1)), p2 = S(...ap(o.tf, ...f.p2)); if (near(ev, p1, 7)) { this.d = { o, h: 'p1' }; return; } if (near(ev, p2, 7)) { this.d = { o, h: 'p2' }; return; } }
    this.d = { o, p0: [ev.x, ev.y] };
  },
  move(ev) {
    const d = this.d; if (!ev.down || !d) return;
    if (d.h) { d.o.fill[d.h] = toLocal(d.o, [ev.x, ev.y]); App.render(); return; }
    if (Math.hypot(ev.x - d.p0[0], ev.y - d.p0[1]) * V.z < 4) return;
    const prev = d.o.fill, c1 = FX.ifill.c1 || (prev?.t === 'grad' ? prev.st[0].c : fillColor(prev)) || '#000000';
    const st = prev?.t === 'grad' ? prev.st : [{ o: 0, c: c1, a: 1 }, { o: 1, c: FX.ifill.c2 || '#ffffff', a: 1 }];
    d.o.fill = { t: 'grad', g: FX.ifill.g === 'solid' ? 'lin' : FX.ifill.g, st, p1: toLocal(d.o, d.p0), p2: toLocal(d.o, [ev.x, ev.y]) };
    App.render();
  },
  up() { if (this.d) App.commit('Isian interaktif'); this.d = null; App.emit('sel'); },
  overlay() {
    let s = selOverlay();
    const o = App.sel[0]; if (App.sel.length !== 1 || o?.fill?.t !== 'grad') return s;
    const a = S(...ap(o.tf, ...o.fill.p1)), b = S(...ap(o.tf, ...o.fill.p2));
    s += line(a, b, 'ln acc');
    for (const st of o.fill.st) { const p = [a[0] + (b[0] - a[0]) * st.o, a[1] + (b[1] - a[1]) * st.o]; s += `<rect class="stop" x="${p[0] - 4}" y="${p[1] - 4}" width="8" height="8" fill="${st.c}"/>`; }
    if (o.fill.g === 'rad' || o.fill.g === 'con' || o.fill.g === 'sq') { const r = Math.hypot(b[0] - a[0], b[1] - a[1]); s += `<circle class="ln dim" cx="${a[0]}" cy="${a[1]}" r="${r}" fill="none"/>`; }
    return s;
  },
};

// ---------- Eyedroppers & paint bucket ----------
async function sampleAt(ev) {
  const o = V.hit(ev, { deep: true });
  if (!o) return { fill: { t: 'solid', c: App.page.bg || '#ffffff' }, color: App.page.bg || '#ffffff' };
  if (o.type === 'img') {
    const im = new Image(); im.src = App.assetURL(o.asset); await im.decode().catch(() => { });
    const [lx, ly] = toLocal(o, [ev.x, ev.y]), c = document.createElement('canvas'); c.width = c.height = 1;
    const x = c.getContext('2d'); x.drawImage(im, -lx / o.w * im.naturalWidth, -ly / o.h * im.naturalHeight, im.naturalWidth, im.naturalHeight);
    const d = x.getImageData(0, 0, 1, 1).data, hex = rgb2hex(d[0], d[1], d[2]);
    return { fill: { t: 'solid', c: hex }, color: hex, o };
  }
  return { fill: deep(o.fill), ol: deep(o.ol), tr: deep(o.tr), fx: deep(o.fx), color: fillColor(o.fill) || o.ol?.c || '#000000', o };
}
function dropper(id, name, attrs) {
  return {
    id, name,
    activate() { this.mode = 'sample'; setCursor('crosshair'); hint(attrs ? 'Klik objek untuk mengambil atributnya, lalu klik objek lain untuk menerapkan' : 'Klik untuk mengambil warna · Lalu klik objek (isian) atau Shift+klik (kerangka)'); },
    async down(ev) {
      const sampling = this.mode === 'sample' ? !ev.alt : ev.alt;
      if (sampling) {
        App.sampled = await sampleAt(ev); App.sampled.attrs = attrs;
        this.mode = 'apply'; setCursor('cell'); App.emit('sampled', App.sampled);
        hint(`Diambil: ${App.sampled.color} · Klik objek untuk menerapkan · Alt+klik untuk mengambil lagi`);
        return;
      }
      const o = V.hit(ev, { deep: ev.mod }); if (!o || !App.sampled) return;
      const sm = App.sampled;
      if (attrs) { o.fill = deep(sm.fill); if (sm.ol !== undefined) o.ol = deep(sm.ol); o.tr = deep(sm.tr); if (sm.fx) o.fx = deep(sm.fx); }
      else if (ev.shift) o.ol = { ...(o.ol || { w: .2 }), c: sm.color };
      else o.fill = { t: 'solid', c: sm.color };
      App.commit(attrs ? 'Terapkan atribut' : 'Terapkan warna');
    },
    overlay: () => selOverlay(),
  };
}
export const Eyedrop = dropper('eyedrop', 'Alat Pipet Warna', false);
export const AttrDrop = dropper('attrdrop', 'Alat Pipet Atribut', true);
export const Bucket = {
  id: 'bucket', name: 'Ember Cat',
  activate() { setCursor('cell'); hint('Klik objek untuk mengisi dengan warna isian aktif · Shift+klik untuk kerangka'); },
  down(ev) {
    const o = V.hit(ev, { deep: ev.mod }); if (!o) return;
    const c = App.sampled?.color || App.ui.activeColor || '#000000';
    if (ev.shift) o.ol = { ...(o.ol || { w: .2 }), c }; else o.fill = { t: 'solid', c };
    App.commit('Ember cat');
  },
  overlay: () => selOverlay(),
};

// ---------- Smart fill ----------
export const SmartFill = {
  id: 'smartfill', name: 'Alat Isian Cerdas',
  activate() { setCursor('cell'); hint('Klik di dalam area tertutup (perpotongan objek) untuk membuat objek baru yang terisi'); },
  async down(ev) {
    await loadGeoLibs();
    const objs = App.ctxList.filter(o => !o.hid && canCurve(o));
    await ensureFonts(objs);
    const inside = [], outside = [];
    for (const o of objs) { const p = curveOf(o); if (!p || !p.sp.some(s => s.c)) continue; (inPolys(flatten(p, .1), ev.x, ev.y) ? inside : outside).push(p); }
    if (!inside.length) return toast('Klik di dalam area yang dibatasi objek tertutup');
    let r = inside[0];
    for (const p of inside.slice(1)) r = boolOp('int', r, p);
    for (const p of outside) { const b1 = bbox(r), b2 = bbox(p); if (b2.x > b1.x + b1.w || b2.x + b2.w < b1.x || b2.y > b1.y + b1.h || b2.y + b2.h < b1.y) continue; r = boolOp('sub', r, p); }
    if (isEmptyPath(r)) return toast('Area tidak ditemukan');
    const o = mk('curve', { p: r, fill: { t: 'solid', c: FX.smart.c }, ol: FX.smart.ol ? { w: .2, c: '#000000' } : null, name: 'Isian cerdas' });
    App.add(o, 'Isian cerdas');
  },
  overlay: () => selOverlay(),
};
export { perspInit, wpath };
