// Document model: pages → layers → objects, factories, traversal, world transforms, undo history.
import { uid, deep } from './util.js';
import { I, mul, ap } from './geom.js';

export const PAGE_SIZES = [
  ['A0', 841, 1189], ['A1', 594, 841], ['A2', 420, 594], ['A3', 297, 420], ['A4', 210, 297], ['A5', 148, 210], ['A6', 105, 148],
  ['B4', 250, 353], ['B5', 176, 250], ['F4 / Folio', 215, 330], ['Letter', 215.9, 279.4], ['Legal', 215.9, 355.6], ['Tabloid', 279.4, 431.8],
  ['Kartu nama', 90, 55], ['Kartu nama (US)', 88.9, 50.8], ['Kartu ID / CR80', 85.6, 54], ['Amplop DL', 220, 110], ['Kartu pos', 148, 100],
  ['Undangan 5×7 in', 127, 177.8], ['Brosur lipat 3 (A4 lanskap)', 297, 210], ['Spanduk 3×1 m', 3000, 1000], ['X-Banner 60×160 cm', 600, 1600],
  ['Poster 50×70 cm', 500, 700], ['Stiker bulat 5 cm', 50, 50], ['Label 10×5 cm', 100, 50],
  ['Postingan Instagram 1080²', 285.75, 285.75], ['Story / Reels 1080×1920', 285.75, 508], ['Sampul Facebook 1640×624', 433.92, 165.1],
  ['Thumbnail YouTube 1280×720', 338.67, 190.5], ['Presentasi 16:9 1920×1080', 508, 285.75], ['Web 1440×900', 381, 238.125],
];

export const DEFAULTS = {
  fill: null,
  ol: { w: 0.2, c: '#000000', cap: 'butt', join: 'miter' },
  text: { font: 'Arial', wt: 400, it: false, sz: 24, al: 'l', ls: 1, cs: 0, ws: 0 },
};

export function newLayer(name = 'Lapisan 1', color = '#2f80ed') {
  return { id: uid('L'), name, vis: true, lock: false, print: true, color, objs: [] };
}
export function newPage(w = 210, h = 297, name = '') {
  const l = newLayer();
  return { id: uid('P'), name, w, h, bg: '#ffffff', layers: [l], cur: l.id, guides: [] };
}
export function newDoc(o = {}) {
  const pages = [];
  for (let i = 0; i < (o.pages || 1); i++) pages.push(newPage(o.w || 210, o.h || 297, ''));
  return {
    id: uid('D'), name: o.name || 'Tanpa judul-1', units: o.units || 'mm', pages, pi: 0, assets: {},
    grid: { x: 5, y: 5, show: false, snap: false, dots: false }, snap: { objects: true, guides: true, page: true, dyn: true },
    view: null, palette: [], bleed: o.bleed || 0, dpi: 300, created: Date.now(), modified: Date.now(),
    meta: { title: '', author: '', keywords: '' }, nudge: o.units === 'in' ? 2.54 : 1, ver: 1,
  };
}
export const curPage = doc => doc.pages[doc.pi] || doc.pages[0];
export function curLayer(doc) {
  const p = curPage(doc);
  return p.layers.find(l => l.id === p.cur) || p.layers[p.layers.length - 1];
}

const NAMES = { rect: 'Persegi Panjang', ell: 'Elips', poly: 'Poligon', spiral: 'Spiral', ps: 'Bentuk', curve: 'Kurva', text: 'Teks', img: 'Bitmap', g: 'Grup', blend: 'Campuran', dim: 'Dimensi', conn: 'Penghubung', table: 'Tabel', qr: 'Kode QR' };
export function mk(type, props = {}) {
  const o = { id: uid(), type, name: '', tf: I(), fill: deep(DEFAULTS.fill), ol: deep(DEFAULTS.ol), ...props };
  if (type === 'text') {
    Object.assign(o, { ...DEFAULTS.text, ...props });
    if (!('fill' in props)) o.fill = { t: 'solid', c: '#000000' };
    if (!('ol' in props)) o.ol = null;
  }
  if (type === 'img' && !('ol' in props)) o.ol = null;
  if (type === 'g' || type === 'blend') { o.fill = null; o.ol = null; }
  if (type === 'qr' && !('fill' in props)) o.fill = { t: 'solid', c: '#000000' };
  if (!o.name) o.name = '';
  return o;
}
export const objName = o => o.name || NAMES[o.type] || 'Objek';

// Child arrays of an object (for traversal). Blend control objects are exposed as a pseudo list.
export function kids(o) {
  const r = [];
  if (o.ch) r.push(o.ch);
  if (o.pc) r.push(o.pc);
  return r;
}
// Visits every object depth-first. fn(o, list, owner, layer) — return false to skip children.
export function walk(list, fn, owner = null, layer = null) {
  for (const o of list) {
    if (fn(o, list, owner, layer) === false) continue;
    if (o.ch) walk(o.ch, fn, o, layer);
    if (o.pc) walk(o.pc, fn, o, layer);
    if (o.type === 'blend') walk([o.a, o.b], fn, o, layer);
  }
}
export function walkPage(page, fn) { for (const l of page.layers) walk(l.objs, fn, null, l); }
export function walkDoc(doc, fn) { for (const p of doc.pages) walkPage(p, fn); }

export function reid(o) {
  o.id = uid();
  if (o.ch) o.ch.forEach(reid);
  if (o.pc) o.pc.forEach(reid);
  if (o.type === 'blend') { reid(o.a); reid(o.b); }
  return o;
}
export const cloneObj = o => reid(deep(o));

// Applies a world-space affine transform to an object (recursively, everything is stored in world space).
export function applyM(o, m) {
  if (o.type === 'g') { o.ch.forEach(c => applyM(c, m)); return o; }
  if (o.type === 'blend') { applyM(o.a, m); applyM(o.b, m); return o; }
  if (o.type === 'dim' || o.type === 'conn') {
    if (o.pts) o.pts = o.pts.map(p => ap(m, p[0], p[1]));
    if (o.type === 'conn') for (const e of ['a', 'b']) if (o[e]?.pt) o[e].pt = ap(m, o[e].pt[0], o[e].pt[1]);
    return o;
  }
  o.tf = mul(m, o.tf || I());
  if (o.pc) o.pc.forEach(c => applyM(c, m));
  return o;
}
// Restores geometry from a snapshot and applies m on top (used while dragging).
export function setFrom(o, src, m) {
  if (o.type === 'g') { o.ch.forEach((c, i) => setFrom(c, src.ch[i], m)); return; }
  if (o.type === 'blend') { setFrom(o.a, src.a, m); setFrom(o.b, src.b, m); return; }
  if (o.type === 'dim' || o.type === 'conn') {
    if (src.pts) o.pts = src.pts.map(p => ap(m, p[0], p[1]));
    if (o.type === 'conn') for (const e of ['a', 'b']) if (src[e]?.pt) o[e].pt = ap(m, src[e].pt[0], src[e].pt[1]);
    return;
  }
  o.tf = mul(m, src.tf || I());
  if (o.pc) o.pc.forEach((c, i) => setFrom(c, src.pc[i], m));
}

// ---------- Undo history (JSON snapshots of the page set) ----------
export class History {
  constructor(doc) { this.doc = doc; this.stack = []; this.i = -1; this.max = 120; }
  snap() { return JSON.stringify({ pages: this.doc.pages, pi: this.doc.pi }); }
  reset(label = 'Dokumen dibuka') { this.stack = [{ s: this.snap(), label, t: Date.now() }]; this.i = 0; }
  push(label, sel = []) {
    const s = this.snap();
    if (this.stack[this.i]?.s === s) return false;
    this.stack.length = this.i + 1;
    this.stack.push({ s, label, sel, t: Date.now() });
    if (this.stack.length > this.max) this.stack.shift();
    this.i = this.stack.length - 1;
    return true;
  }
  canUndo() { return this.i > 0; }
  canRedo() { return this.i < this.stack.length - 1; }
  go(i) {
    if (i < 0 || i >= this.stack.length) return null;
    this.i = i;
    const st = JSON.parse(this.stack[i].s);
    this.doc.pages = st.pages; this.doc.pi = Math.min(st.pi, st.pages.length - 1);
    return { sel: this.stack[i].sel || [] };
  }
  undo() { return this.canUndo() ? this.go(this.i - 1) : null; }
  redo() { return this.canRedo() ? this.go(this.i + 1) : null; }
  get label() { return this.stack[this.i]?.label; }
}
