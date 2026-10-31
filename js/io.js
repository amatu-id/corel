// File I/O: native .adraw documents, SVG/image import, SVG/PNG/JPG/WebP/PDF export, printing, autosave, bitmap tracing.
import { App } from './app.js';
import { mk, newPage, walkDoc, curPage } from './model.js';
import { renderPage, renderObjects } from './render.js';
import { selBox, objBox } from './objgeom.js';
import { parseD, xformPath, mul, inv, ap, I, T, S, R, K, rectSub, bbox, msvg } from './geom.js';
import { ensureFonts, fontInfo, FONTS } from './fonts.js';
import { svgToPNG } from './ops.js';
import { h, download, readFile, pickFile, toast, loadScript, normHex, rgb2hex, PT, uid, esc } from './util.js';

// ---------- IndexedDB store (autosave + recent) ----------
const DB = 'amatudraw', ST = 'docs';
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(ST, { keyPath: 'id' });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function tx(mode, fn) { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction(ST, mode), s = t.objectStore(ST); const r = fn(s); t.oncomplete = () => res(r?.result); t.onerror = () => rej(t.error); }); }
export const Store = {
  async put(rec) { try { await tx('readwrite', s => s.put(rec)); } catch (e) { console.warn('store', e); } },
  async list() { try { const db = await idb(); return await new Promise(res => { const out = []; const c = db.transaction(ST).objectStore(ST).openCursor(); c.onsuccess = () => { const cur = c.result; if (cur) { const { id, name, modified, thumb, pages, size } = cur.value; out.push({ id, name, modified, thumb, pages, size }); cur.continue(); } else res(out.sort((a, b) => b.modified - a.modified)); }; c.onerror = () => res([]); }); } catch { return []; } },
  async get(id) { try { const db = await idb(); return await new Promise(res => { const r = db.transaction(ST).objectStore(ST).get(id); r.onsuccess = () => res(r.result); r.onerror = () => res(null); }); } catch { return null; } },
  async del(id) { try { await tx('readwrite', s => s.delete(id)); } catch { } },
};

// ---------- Native format ----------
export function serialize(doc) {
  const used = new Set();
  walkDoc(doc, o => { if (o.asset) used.add(o.asset); if (o.fill?.asset) used.add(o.fill.asset); });
  const assets = {}; for (const k of used) if (doc.assets[k]) assets[k] = doc.assets[k];
  const { _hist, _dirty, _file, _thumb, ...rest } = doc;
  return JSON.stringify({ app: 'Amatu Draw', format: 1, saved: Date.now(), doc: { ...rest, assets } });
}
export function deserialize(txt) {
  const j = JSON.parse(txt);
  const d = j.doc || j;
  if (!d.pages) throw new Error('Bukan dokumen Amatu Draw');
  d.assets ||= {}; d.grid ||= { x: 5, y: 5, show: false, snap: false }; d.snap ||= { objects: true, guides: true, page: true, dyn: true };
  d.pages.forEach(p => { p.guides ||= []; p.layers ||= []; if (!p.cur && p.layers[0]) p.cur = p.layers[0].id; });
  return d;
}
export async function thumbOf(doc, size = 220) {
  const p = curPage(doc) || doc.pages[0];
  const r = renderPage(p, { mode: 'export', asset: id => doc.assets[id] });
  const sc = size / Math.max(p.w, p.h);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${p.w * sc}" height="${p.h * sc}" viewBox="0 0 ${p.w} ${p.h}"><defs>${r.defs}</defs><rect width="${p.w}" height="${p.h}" fill="${p.bg || '#fff'}"/>${r.body}</svg>`;
  try { return await svgToPNG(svg, Math.round(p.w * sc), Math.round(p.h * sc), 'image/webp', .8); } catch { return ''; }
}
export async function autosave(doc = App.doc) {
  if (!doc || !App.settings.autosave) return;
  const data = serialize(doc);
  const thumb = await thumbOf(doc);
  doc._thumb = thumb;
  await Store.put({ id: doc.id, name: doc.name, modified: Date.now(), data, thumb, pages: doc.pages.length, size: data.length });
}
export async function saveDoc(doc = App.doc, as = false) {
  if (!doc) return;
  await ensureFonts(doc.pages.flatMap(p => p.layers.flatMap(l => l.objs)));
  const data = serialize(doc);
  const name = (doc.name || 'Dokumen').replace(/\.adraw$/i, '') + '.adraw';
  if (window.showSaveFilePicker) {
    try {
      let handle = !as && doc._file;
      if (!handle) handle = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'Dokumen Amatu Draw', accept: { 'application/json': ['.adraw'] } }] });
      const w = await handle.createWritable(); await w.write(data); await w.close();
      doc._file = handle; doc.name = handle.name.replace(/\.adraw$/i, '');
    } catch (e) { if (e.name === 'AbortError') return; download(new Blob([data], { type: 'application/json' }), name); }
  } else download(new Blob([data], { type: 'application/json' }), name);
  doc._dirty = false;
  await autosave(doc);
  App.emit('doc'); toast('Dokumen disimpan: ' + name);
}
export async function openFiles(files) {
  if (!files) files = await pickFile('.adraw,.json,.svg,image/*,.cdr,.ai,.eps,.pdf', true);
  for (const f of files) {
    const n = f.name.toLowerCase();
    try {
      if (n.endsWith('.adraw') || n.endsWith('.json')) {
        const d = deserialize(await readFile(f));
        d.name = f.name.replace(/\.(adraw|json)$/i, '');
        App.openDoc(d);
      } else if (n.endsWith('.svg')) {
        const objs = importSVG(await readFile(f));
        const b = selBoxSafe(objs);
        App.newDocument({ name: f.name.replace(/\.svg$/i, ''), w: Math.max(10, +(b.x + b.w).toFixed(2)), h: Math.max(10, +(b.y + b.h).toFixed(2)) });
        App.ctxList.push(...objs); App.dirtyIndex(); App.commit('Buka SVG');
      } else if (f.type.startsWith('image/')) {
        const url = await readFile(f, 'url'), im = await loadImg(url);
        const w = im.naturalWidth * 25.4 / 96, hh = im.naturalHeight * 25.4 / 96;
        App.newDocument({ name: f.name.replace(/\.[^.]+$/, ''), w: +w.toFixed(2), h: +hh.toFixed(2) });
        const id = App.addAsset(url);
        App.add(mk('img', { asset: id, w, h: hh, px: [im.naturalWidth, im.naturalHeight], name: f.name }), 'Buka gambar');
      } else if (/\.(cdr|ai|eps|pdf)$/.test(n)) {
        toast('Format ' + n.split('.').pop().toUpperCase() + ' (biner) tidak dapat dibuka langsung di peramban. Ekspor sebagai SVG dari aplikasi asalnya lalu impor ke sini.', 'warn', 6000);
      } else toast('Format berkas tidak didukung: ' + f.name, 'warn');
    } catch (e) { console.error(e); toast('Gagal membuka ' + f.name + ': ' + e.message, 'err'); }
  }
}
const selBoxSafe = objs => selBox(objs) || { x: 0, y: 0, w: 210, h: 297 };
const loadImg = url => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; });

// ---------- Import ----------
export async function importFiles(files, at) {
  if (!App.doc) App.newDocument();
  if (!files) files = await pickFile('.svg,image/*,.adraw', true);
  const added = [];
  for (const f of files) {
    const n = f.name.toLowerCase();
    try {
      if (n.endsWith('.svg')) { const objs = importSVG(await readFile(f)); const g = objs.length > 1 ? mk('g', { ch: objs, name: f.name }) : objs[0]; if (g) added.push(g); }
      else if (n.endsWith('.adraw')) { const d = deserialize(await readFile(f)); Object.assign(App.doc.assets, d.assets); for (const p of d.pages) for (const l of p.layers) added.push(...l.objs); }
      else if (f.type.startsWith('image/')) added.push(await imageObj(await readFile(f, 'url'), f.name));
    } catch (e) { console.error(e); toast('Gagal mengimpor ' + f.name, 'err'); }
  }
  if (!added.length) return;
  const p = App.page, b = selBox(added) || { x: 0, y: 0, w: 1, h: 1 };
  let s = 1;
  if (b.w > p.w * 1.2 || b.h > p.h * 1.2) s = Math.min(p.w / b.w, p.h / b.h) * .9;
  const cx = at ? at[0] : p.w / 2, cy = at ? at[1] : p.h / 2;
  const m = mul(T(cx - b.w * s / 2, cy - b.h * s / 2), mul(S(s, s), T(-b.x, -b.y)));
  const { applyM } = await import('./model.js');
  added.forEach(o => applyM(o, m));
  App.add(added, 'Impor');
}
export async function imageObj(url, name = '') {
  const im = await loadImg(url);
  const id = App.addAsset(url), w = im.naturalWidth * 25.4 / 96, hh = im.naturalHeight * 25.4 / 96;
  return mk('img', { asset: id, w, h: hh, px: [im.naturalWidth, im.naturalHeight], name });
}
function parseTransform(s) {
  let m = I();
  if (!s) return m;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g; let k;
  while ((k = re.exec(s))) {
    const a = k[2].split(/[\s,]+/).filter(Boolean).map(Number);
    let t = I();
    if (k[1] === 'matrix') t = a.slice(0, 6);
    else if (k[1] === 'translate') t = T(a[0] || 0, a[1] || 0);
    else if (k[1] === 'scale') t = S(a[0], a[1] ?? a[0]);
    else if (k[1] === 'rotate') t = R(a[0] || 0, a[1] || 0, a[2] || 0);
    else if (k[1] === 'skewX') t = K(a[0], 0);
    else if (k[1] === 'skewY') t = K(0, a[0]);
    m = mul(m, t);
  }
  return m;
}
const UNIT_MM = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6, px: 25.4 / 96, '': 25.4 / 96 };
function lenMM(v) { const m = String(v || '').match(/([-\d.e]+)\s*([a-z%]*)/i); if (!m) return null; if (m[2] === '%') return null; return parseFloat(m[1]) * (UNIT_MM[m[2]] ?? UNIT_MM.px); }
function colorOf(v) {
  if (!v || v === 'none' || v === 'transparent') return null;
  const m = v.match(/rgba?\(([^)]+)\)/);
  if (m) { const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); if (p.length > 3 && p[3] === 0) return null; return rgb2hex(p[0], p[1], p[2]); }
  return normHex(v) || null;
}
// SVG → objects (world mm). opts.matrix maps SVG user units to the document; opts.keepUnits treats units as mm.
export function importSVG(svgText, opts = {}) {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.nodeName !== 'svg') throw new Error('SVG tidak valid');
  const host = h('div', { style: 'position:absolute;left:-99999px;top:0;width:10px;height:10px;overflow:hidden;visibility:hidden' });
  const svg = document.importNode(root, true);
  host.append(svg); document.body.append(host);
  let base = opts.matrix || I();
  if (!opts.matrix && !opts.keepUnits) {
    const vb = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
    const W = lenMM(svg.getAttribute('width')), H = lenMM(svg.getAttribute('height'));
    if (vb.length === 4 && vb[2] > 0) { const sx = W ? W / vb[2] : 25.4 / 96, sy = H ? H / vb[3] : sx; base = mul(S(sx, sy), T(-vb[0], -vb[1])); }
    else base = S(25.4 / 96, 25.4 / 96);
  }
  const out = [];
  const byId = id => svg.querySelector('#' + CSS.escape(id));
  const paintOf = (val, el, M, geomBox) => {
    if (!val || val === 'none') return null;
    const u = val.match(/url\(["']?#([^"')]+)["']?\)/);
    if (u) {
      const g = byId(u[1]);
      if (!g) return null;
      return gradFrom(g, M, geomBox) || null;
    }
    const c = colorOf(val); return c ? { t: 'solid', c } : null;
  };
  const gradFrom = (g, M, box) => {
    const chain = [g]; let x = g; while (x?.getAttribute('href') || x?.getAttribute('xlink:href')) { x = byId((x.getAttribute('href') || x.getAttribute('xlink:href')).slice(1)); if (!x || chain.includes(x)) break; chain.push(x); }
    const attr = k => { for (const c of chain) if (c.hasAttribute(k)) return c.getAttribute(k); return null; };
    const stopsEl = chain.find(c => c.querySelector('stop'));
    if (!stopsEl) return null;
    const st = [...stopsEl.querySelectorAll('stop')].map(s => { const cs = getComputedStyle(s); let off = s.getAttribute('offset') || '0'; off = off.endsWith('%') ? parseFloat(off) / 100 : parseFloat(off); return { o: Math.max(0, Math.min(1, off || 0)), c: colorOf(cs.stopColor) || '#000000', a: parseFloat(cs.stopOpacity || 1) }; });
    if (!st.length) return null;
    if (st.length === 1) return { t: 'solid', c: st[0].c };
    const obb = attr('gradientUnits') !== 'userSpaceOnUse';
    let G = parseTransform(attr('gradientTransform'));
    if (obb) G = mul([box.w, 0, 0, box.h, box.x, box.y], G);
    const W = mul(M, G);
    const num = (k, d) => { const v = attr(k); if (v == null) return d; return v.endsWith('%') ? parseFloat(v) / 100 * (obb ? 1 : 100) : parseFloat(v); };
    if (chain.some(c => c.nodeName === 'radialGradient') && g.nodeName === 'radialGradient') {
      const cx = num('cx', obb ? .5 : 50), cy = num('cy', obb ? .5 : 50), r = num('r', obb ? .5 : 50);
      const fx = num('fx', cx), fy = num('fy', cy);
      return { t: 'grad', g: 'rad', st, p1: ap(W, cx, cy), p2: ap(W, cx + r, cy), fc: ap(W, fx, fy), sp: attr('spreadMethod') || undefined };
    }
    const x1 = num('x1', 0), y1 = num('y1', 0), x2 = num('x2', obb ? 1 : 100), y2 = num('y2', 0);
    return { t: 'grad', g: 'lin', st, p1: ap(W, x1, y1), p2: ap(W, x2, y2), sp: attr('spreadMethod') || undefined };
  };
  const styleOf = (el, M, box) => {
    const cs = getComputedStyle(el);
    const fill = paintOf(cs.fill, el, M, box);
    if (fill?.t === 'solid' && parseFloat(cs.fillOpacity) < 1) fill.a = parseFloat(cs.fillOpacity);
    const sc = Math.sqrt(Math.abs(M[0] * M[3] - M[1] * M[2])) || 1;
    const sw = parseFloat(cs.strokeWidth) || 0, sp = paintOf(cs.stroke, el, M, box);
    const ol = sp && sw > 0 ? { w: sw * sc, c: sp.t === 'solid' ? sp.c : (sp.st?.[0]?.c || '#000'), cap: cs.strokeLinecap === 'butt' ? undefined : cs.strokeLinecap, join: cs.strokeLinejoin === 'miter' ? undefined : cs.strokeLinejoin } : null;
    if (ol && cs.strokeDasharray && cs.strokeDasharray !== 'none') ol.d = cs.strokeDasharray.split(/[\s,]+/).map(v => parseFloat(v) / (sw || 1)).filter(isFinite);
    if (ol && parseFloat(cs.strokeOpacity) < 1) ol.a = parseFloat(cs.strokeOpacity);
    const op = parseFloat(el.getAttribute('opacity') ?? 1);
    return { fill, ol, tr: op < 1 ? { t: 'uni', v: +(1 - op).toFixed(3) } : null, fr: cs.fillRule === 'nonzero' ? 'nonzero' : undefined };
  };
  const walk = (el, M, list) => {
    for (const c of el.children) {
      const tag = c.nodeName.replace(/^svg:/, '');
      if (['defs', 'style', 'title', 'desc', 'metadata', 'clipPath', 'mask', 'linearGradient', 'radialGradient', 'pattern', 'filter', 'symbol', 'marker'].includes(tag)) continue;
      const cs = getComputedStyle(c);
      if (cs.display === 'none' || c.getAttribute('visibility') === 'hidden') continue;
      const Mc = mul(M, parseTransform(c.getAttribute('transform')));
      if (tag === 'g' || tag === 'a' || tag === 'switch') {
        const sub = []; walk(c, Mc, sub);
        const op = parseFloat(c.getAttribute('opacity') ?? 1);
        if (op < 1) sub.forEach(o => { o.tr = o.tr || { t: 'uni', v: +(1 - op).toFixed(3) }; });
        if (sub.length > 1 && !opts.flat) list.push(mk('g', { ch: sub, name: c.getAttribute('id') || c.getAttribute('inkscape:label') || '' }));
        else list.push(...sub);
        continue;
      }
      if (tag === 'use') {
        const ref = byId((c.getAttribute('href') || c.getAttribute('xlink:href') || '').slice(1));
        if (!ref) continue;
        const wrap = document.createElementNS('http://www.w3.org/2000/svg', 'g'); wrap.append(ref.cloneNode(true)); c.parentNode.insertBefore(wrap, c);
        const sub = []; walk(wrap, mul(Mc, T(+c.getAttribute('x') || 0, +c.getAttribute('y') || 0)), sub); wrap.remove();
        list.push(...sub); continue;
      }
      const num = k => parseFloat(c.getAttribute(k) || 0);
      let d = null;
      if (tag === 'path') d = c.getAttribute('d');
      else if (tag === 'rect') {
        const x = num('x'), y = num('y'), w = num('width'), hh = num('height');
        if (!(w > 0 && hh > 0)) continue;
        let rx = c.hasAttribute('rx') ? num('rx') : c.hasAttribute('ry') ? num('ry') : 0;
        const box = { x, y, w, h: hh };
        const st = styleOf(c, Mc, box);
        const o = mk('rect', { w, h: hh, r: Array(4).fill(Math.min(rx, w / 2, hh / 2)), tf: mul(Mc, T(x, y)), ...st });
        if (o.fill?.t === 'grad') { o.fill.p1 = ap(inv(o.tf), ...o.fill.p1); o.fill.p2 = ap(inv(o.tf), ...o.fill.p2); if (o.fill.fc) o.fill.fc = ap(inv(o.tf), ...o.fill.fc); }
        list.push(o); continue;
      } else if (tag === 'circle' || tag === 'ellipse') {
        const cx = num('cx'), cy = num('cy'), rx = tag === 'circle' ? num('r') : num('rx'), ry = tag === 'circle' ? num('r') : num('ry');
        if (!(rx > 0 && ry > 0)) continue;
        const st = styleOf(c, Mc, { x: cx - rx, y: cy - ry, w: rx * 2, h: ry * 2 });
        const o = mk('ell', { w: rx * 2, h: ry * 2, tf: mul(Mc, T(cx - rx, cy - ry)), ...st });
        if (o.fill?.t === 'grad') { o.fill.p1 = ap(inv(o.tf), ...o.fill.p1); o.fill.p2 = ap(inv(o.tf), ...o.fill.p2); if (o.fill.fc) o.fill.fc = ap(inv(o.tf), ...o.fill.fc); }
        list.push(o); continue;
      } else if (tag === 'line') d = `M${num('x1')} ${num('y1')}L${num('x2')} ${num('y2')}`;
      else if (tag === 'polyline' || tag === 'polygon') { const p = (c.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number); if (p.length < 4) continue; d = 'M' + p.reduce((a, v, i) => a + (i % 2 ? ' ' + v : (i ? 'L' : '') + v), '') + (tag === 'polygon' ? 'Z' : ''); }
      else if (tag === 'text') { const t = textFrom(c, Mc); if (t) list.push(t); continue; }
      else if (tag === 'image') {
        const href = c.getAttribute('href') || c.getAttribute('xlink:href'); if (!href) continue;
        const x = num('x'), y = num('y'), w = num('width'), hh = num('height');
        const id = href.startsWith('data:') ? App.addAsset(href) : null;
        if (!id) continue;
        list.push(mk('img', { asset: id, w, h: hh, tf: mul(Mc, T(x, y)) })); continue;
      }
      if (!d) continue;
      const lp = parseD(d); if (!lp.sp.length) continue;
      const st = styleOf(c, Mc, bbox(lp));
      list.push(mk('curve', { p: xformPath(lp, Mc), ...st }));
    }
  };
  const textFrom = (el, M) => {
    const cs = getComputedStyle(el);
    const fam = (cs.fontFamily || 'Arial').split(',')[0].replace(/["']/g, '').trim();
    const f = FONTS.find(x => x.name.toLowerCase() === fam.toLowerCase()) || fontInfo(/serif/i.test(fam) && !/sans/i.test(fam) ? 'Times New Roman' : 'Arial');
    const size = parseFloat(cs.fontSize) || 16, sc = Math.sqrt(Math.abs(M[0] * M[3] - M[1] * M[2])) || 1;
    const lines = el.querySelectorAll('tspan').length ? [...el.querySelectorAll('tspan')].map(t => t.textContent) : [el.textContent];
    const s = lines.join('\n').trim(); if (!s) return null;
    const x = parseFloat(el.getAttribute('x') || 0), y = parseFloat(el.getAttribute('y') || 0);
    const sz = size * sc / PT, asc = size * .9;
    const fill = paintOf(cs.fill, el, M, { x, y, w: 1, h: 1 });
    const anchor = cs.textAnchor;
    const o = mk('text', { s, font: f.name, sz: +sz.toFixed(2), wt: parseInt(cs.fontWeight) >= 600 ? 700 : 400, it: cs.fontStyle === 'italic', al: anchor === 'middle' ? 'c' : anchor === 'end' ? 'r' : 'l', fill: fill || null, tf: mul(M, mul(T(x, y - asc), S(1 / sc, 1 / sc))) });
    return o;
  };
  try { walk(svg, base, out); } finally { host.remove(); }
  return out;
}

// ---------- Export ----------
export async function exportSVGString({ page = App.page, objs = null, bg = true, bleed = 0 } = {}) {
  const all = objs || page.layers.flatMap(l => l.objs);
  await ensureFonts(all);
  const asset = id => App.doc.assets[id];
  const r = objs ? renderObjects(objs, { mode: 'export', asset, units: App.doc.units }) : renderPage(page, { mode: 'export', asset, units: App.doc.units });
  let x = -bleed, y = -bleed, w = page.w + bleed * 2, hh = page.h + bleed * 2;
  if (objs) { const b = selBox(objs); if (b) { const pad = .5; x = b.x - pad; y = b.y - pad; w = b.w + pad * 2; hh = b.h + pad * 2; } }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="${+w.toFixed(3)}mm" height="${+hh.toFixed(3)}mm" viewBox="${+x.toFixed(3)} ${+y.toFixed(3)} ${+w.toFixed(3)} ${+hh.toFixed(3)}">\n<title>${esc(App.doc.name)}</title>\n<desc>Dibuat dengan Amatu Draw</desc>\n<defs>${r.defs}</defs>\n${bg && !objs && page.bg && page.bg !== 'none' ? `<rect x="${x}" y="${y}" width="${w}" height="${hh}" fill="${page.bg}"/>` : ''}${r.body}\n</svg>`;
}
export async function exportRaster({ type = 'image/png', dpi = 150, scope = 'page', bg = 'page', q = .92, pxW = 0 } = {}) {
  const objs = scope === 'sel' ? App.sel : null;
  const svg = await exportSVGString({ objs, bg: bg === 'page' && type === 'image/png' });
  const vb = svg.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
  let s = pxW ? pxW / vb[2] : dpi / 25.4;
  let W = Math.round(vb[2] * s), H = Math.round(vb[3] * s);
  const MAX = 12000; if (Math.max(W, H) > MAX) { const k = MAX / Math.max(W, H); W = Math.round(W * k); H = Math.round(H * k); toast('Ukuran diperkecil ke ' + W + '×' + H + ' px (batas peramban)', 'warn'); }
  const fill = type !== 'image/png' ? (bg === 'transparent' ? '#ffffff' : (App.page.bg || '#ffffff')) : (bg === 'white' ? '#ffffff' : null);
  return { url: await svgToPNG(svg, W, H, type, q, fill), W, H };
}
export async function exportPDF({ pages = 'all', mode = 'vector', dpi = 300, bleed = 0 } = {}) {
  await loadScript('https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js');
  if (mode === 'vector') await loadScript('https://cdn.jsdelivr.net/npm/svg2pdf.js@2.2.4/dist/svg2pdf.umd.min.js');
  const { jsPDF } = window.jspdf;
  const list = pages === 'all' ? App.doc.pages : [App.page];
  let pdf;
  for (let i = 0; i < list.length; i++) {
    const p = list[i], w = p.w + bleed * 2, hh = p.h + bleed * 2, orient = w > hh ? 'l' : 'p';
    if (!pdf) pdf = new jsPDF({ unit: 'mm', format: [w, hh], orientation: orient, compress: true });
    else pdf.addPage([w, hh], orient);
    if (mode === 'vector') {
      await ensureFonts(p.layers.flatMap(l => l.objs));
      const r = renderPage(p, { mode: 'pdf', asset: id => App.doc.assets[id], units: App.doc.units });
      const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${hh}" viewBox="${-bleed} ${-bleed} ${w} ${hh}"><defs>${r.defs}</defs>${p.bg && p.bg !== 'none' ? `<rect x="${-bleed}" y="${-bleed}" width="${w}" height="${hh}" fill="${p.bg}"/>` : ''}${r.body}</svg>`;
      const el = new DOMParser().parseFromString(svgStr, 'image/svg+xml').documentElement;
      const host = h('div', { style: 'position:absolute;left:-99999px;top:0' }); host.append(el); document.body.append(host);
      try { await pdf.svg(el, { x: 0, y: 0, width: w, height: hh }); } finally { host.remove(); }
    } else {
      const prev = App.doc.pi; App.doc.pi = App.doc.pages.indexOf(p);
      const svg = await exportSVGString({ page: p, bleed });
      App.doc.pi = prev;
      const url = await svgToPNG(svg, Math.round(w * dpi / 25.4), Math.round(hh * dpi / 25.4), 'image/jpeg', .94, p.bg || '#ffffff');
      pdf.addImage(url, 'JPEG', 0, 0, w, hh, undefined, 'FAST');
    }
  }
  pdf.setProperties({ title: App.doc.name, creator: 'Amatu Draw', author: App.doc.meta?.author || '' });
  return pdf.output('blob');
}
export async function printDoc(pages = 'all') {
  const list = pages === 'all' ? App.doc.pages : [App.page];
  const parts = [];
  for (const p of list) { const prev = App.doc.pi; App.doc.pi = App.doc.pages.indexOf(p); parts.push(await exportSVGString({ page: p })); App.doc.pi = prev; }
  const p0 = list[0];
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(App.doc.name)}</title><style>@page{size:${p0.w}mm ${p0.h}mm;margin:0}html,body{margin:0;padding:0}svg{display:block;width:${p0.w}mm;height:${p0.h}mm;page-break-after:always;break-after:page}</style></head><body>${parts.map(s => s.replace(/^<\?xml[^>]*>/, '')).join('')}</body></html>`;
  const fr = h('iframe', { style: 'position:fixed;right:0;bottom:0;width:0;height:0;border:0' });
  document.body.append(fr);
  fr.contentDocument.open(); fr.contentDocument.write(html); fr.contentDocument.close();
  setTimeout(() => { fr.contentWindow.focus(); fr.contentWindow.print(); setTimeout(() => fr.remove(), 2000); }, 400);
}

// ---------- Trace bitmap (PowerTRACE-style) ----------
export const TRACE = {
  line: { n: 'Seni garis', o: { colorsampling: 0, numberofcolors: 2, pal: [{ r: 0, g: 0, b: 0, a: 255 }, { r: 255, g: 255, b: 255, a: 255 }], ltres: 1, qtres: 1, pathomit: 12, blurradius: 1 } },
  logo: { n: 'Logo', o: { numberofcolors: 4, pathomit: 10, ltres: .6, qtres: .6, blurradius: 2, colorquantcycles: 3 } },
  dlogo: { n: 'Logo detail', o: { numberofcolors: 10, pathomit: 4, ltres: .5, qtres: .5, blurradius: 1 } },
  clip: { n: 'Clipart', o: { numberofcolors: 16, pathomit: 8, ltres: 1, qtres: 1, blurradius: 1 } },
  lq: { n: 'Gambar kualitas rendah', o: { numberofcolors: 24, pathomit: 14, blurradius: 3, ltres: 2, qtres: 2 } },
  hq: { n: 'Gambar kualitas tinggi', o: { numberofcolors: 48, pathomit: 2, ltres: .5, qtres: .5, blurradius: 0 } },
};
export async function traceBitmap(o, preset = 'logo', { colors, smooth = 0, removeBg = true, keep = false, maxPx = 900 } = {}) {
  await loadScript('https://cdn.jsdelivr.net/npm/imagetracerjs@1.2.6/imagetracer_v1.2.6.js');
  const im = await loadImg(App.assetURL(o.asset));
  const sc = Math.min(1, maxPx / Math.max(im.naturalWidth, im.naturalHeight));
  const W = Math.max(1, Math.round(im.naturalWidth * sc)), H = Math.max(1, Math.round(im.naturalHeight * sc));
  const c = h('canvas', { width: W, height: H }), x = c.getContext('2d');
  x.drawImage(im, 0, 0, W, H);
  const data = x.getImageData(0, 0, W, H);
  const opt = { ...TRACE[preset].o, viewbox: true, desc: false, strokewidth: 0, linefilter: true, roundcoords: 2 };
  if (colors) opt.numberofcolors = colors;
  if (smooth) { opt.blurradius = Math.round(smooth / 25); opt.ltres = opt.qtres = 0.5 + smooth / 40; }
  const svg = window.ImageTracer.imagedataToSVG(data, opt);
  const m = mul(o.tf, S(o.w / W, o.h / H));
  let objs = importSVG(svg, { matrix: m, flat: true });
  objs.forEach(q => { q.ol = null; });
  if (removeBg && objs.length > 1) {
    // drop the largest near-white region (paper background)
    let bi = -1, ba = 0;
    objs.forEach((q, i) => { const c2 = q.fill?.c; if (!c2) return; const [r, g, b] = [1, 3, 5].map(k => parseInt(c2.slice(k, k + 2), 16)); if (r > 235 && g > 235 && b > 235) { const bb = objBox(q); const a = bb ? bb.w * bb.h : 0; if (a > ba) { ba = a; bi = i; } } });
    if (bi >= 0) objs.splice(bi, 1);
  }
  objs = objs.filter(q => { const b = objBox(q); return b && b.w * b.h > 1e-4; });
  const g = mk('g', { ch: objs, name: 'Hasil trace (' + TRACE[preset].n + ')' });
  const w = App.where(o), i = w.list.indexOf(o);
  w.list.splice(i + 1, 0, g);
  if (!keep) w.list.splice(i, 1);
  App.dirtyIndex(); App.sel = [g];
  App.commit('Trace bitmap');
  return objs.length;
}

// ---------- Drag & drop / paste ----------
export function bindDrop(el) {
  el.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); el.classList.add('drop'); } });
  el.addEventListener('dragleave', () => el.classList.remove('drop'));
  el.addEventListener('drop', e => {
    e.preventDefault(); el.classList.remove('drop');
    const files = [...e.dataTransfer.files]; if (!files.length) return;
    if (!App.doc || App.startOn) return openFiles(files);
    const r = el.getBoundingClientRect();
    const at = App.view ? App.view.toW(e.clientX, e.clientY) : null;
    importFiles(files, at && e.clientX > r.left ? at : null);
  });
}
export { uid, rectSub, msvg, newPage };
