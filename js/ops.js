// Object operations shared by menus, the property bar and tools.
import { App } from './app.js';
import { mk, applyM, cloneObj, walk } from './model.js';
import { geom, objBox, selBox, polysOf, applyLocalFx, baseLocal } from './objgeom.js';
import { I, inv, mul, T, S, R, xformPath, polysToPath, flatten, cpath, bbox, rectSub } from './geom.js';
import { boolOp, isEmptyPath, strokePolys, geoReady, loadGeoLibs } from './bool.js';
import { ensureFonts } from './fonts.js';
import { renderObjects } from './render.js';
import { strokeW } from './render.js';
import { toast, deep } from './util.js';

const sel = () => App.sel;
const need = (n, msg) => { if (sel().length < n) { toast(msg || (n === 1 ? 'Pilih objek terlebih dahulu' : `Pilih minimal ${n} objek`)); return false; } return true; };
const style = o => ({ fill: deep(o.fill), ol: deep(o.ol), tr: deep(o.tr), name: '' });
export const canCurve = o => ['rect', 'ell', 'poly', 'spiral', 'ps', 'curve', 'text'].includes(o.type);

// ---------- Curves ----------
export function curveOf(o) { // world-space curve path for any vector object (null if impossible)
  if (o.type === 'g') { const sp = []; for (const c of o.ch) { const p = curveOf(c); if (p) sp.push(...p.sp); } return sp.length ? { sp } : null; }
  if (['img', 'qr', 'table', 'dim', 'conn', 'blend'].includes(o.type)) { if (o.type === 'img' || o.type === 'qr' || o.type === 'table') return { sp: [xformPath({ sp: [rectSub(0, 0, o.w, o.h)] }, o.tf).sp[0]] }; return null; }
  const g = geom(o);
  if (o.type === 'text' && !g.ready) return null;
  const p = cpath(g.p);
  if (g.lines) p.sp.push(...cpath(g.lines).sp);
  return p;
}
export function toCurveObj(o) {
  if (o.type === 'curve' && !o.fx?.env && !o.fx?.persp && !o.fx?.dist) return o;
  const p = curveOf(o);
  if (!p) return o;
  const n = mk('curve', { ...style(o), p, fx: o.fx ? deep(o.fx) : undefined, pc: o.pc });
  if (n.fx) { delete n.fx.env; delete n.fx.persp; delete n.fx.dist; if (!Object.keys(n.fx).length) delete n.fx; }
  if (o.type === 'text') n.fr = 'nonzero';
  n.name = o.name;
  // keep local fills attached: bake gradient transform into world space
  if (n.fill?.t && n.fill.t !== 'solid') n.fill = bakePaint(n.fill, o.tf);
  if (n.tr?.p1) n.tr = { ...n.tr, p1: apP(o.tf, n.tr.p1), p2: apP(o.tf, n.tr.p2) };
  return n;
}
const apP = (m, p) => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
function bakePaint(f, tf) {
  if (!tf) return f;
  if (f.t === 'grad') return { ...f, p1: apP(tf, f.p1), p2: apP(tf, f.p2), fc: f.fc ? apP(tf, f.fc) : undefined };
  return f;
}
export async function convertToCurves(list = sel()) {
  if (!list.length) return need(1);
  await ensureFonts(list);
  let n = 0;
  const out = [];
  for (const o of list) {
    if (o.type === 'g') { walk(o.ch, (c, l) => { if (canCurve(c) && c.type !== 'curve') { l[l.indexOf(c)] = toCurveObj(c); n++; } }); out.push(o); continue; }
    if (['blend', 'dim', 'conn', 'table', 'qr'].includes(o.type)) { const g = await explodeToGroup(o); App.replace(o, g); out.push(g); n++; continue; }
    if (!canCurve(o)) { out.push(o); continue; }
    const c = toCurveObj(o);
    if (c !== o) { App.replace(o, c); n++; }
    out.push(c);
  }
  App.sel = out;
  App.commit('Konversi ke kurva');
  if (!n) toast('Objek sudah berupa kurva');
  return out;
}
// Renders an object and re-imports it as plain vector pieces (for blends, dimensions, tables…)
export async function explodeToGroup(o) {
  const { importSVG } = await import('./io.js');
  const r = renderObjects([o], { mode: 'export', asset: id => App.doc.assets[id] });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg"><defs>${r.defs}</defs>${r.body}</svg>`;
  const objs = importSVG(svg, { keepUnits: true });
  const g = mk('g', { ch: objs, name: o.name || '' });
  return objs.length === 1 ? objs[0] : g;
}

// ---------- Combine / break apart ----------
export function combine(list = sel()) {
  if (!need(2)) return;
  const target = list[list.length - 1], sp = [];
  for (const o of list) { const p = curveOf(o); if (p) sp.push(...p.sp); }
  const n = mk('curve', { ...style(target), p: { sp } });
  if (target.type === 'text') n.fr = 'nonzero';
  const w = App.where(target), idx = w.list.indexOf(target);
  App.remove(list);
  w.list.splice(Math.min(idx, w.list.length), 0, n);
  App.sel = [n];
  App.commit('Kombinasikan');
}
export async function breakApart(list = sel()) {
  if (!need(1)) return;
  await ensureFonts(list);
  const out = [];
  for (const o of list) {
    if (o.type === 'blend' || o.fx?.ct || o.fx?.ext || o.fx?.bs) { out.push(...await separateEffect(o)); continue; }
    const p = curveOf(o);
    if (!p || p.sp.length < 2) { out.push(o); continue; }
    const w = App.where(o), idx = w.list.indexOf(o);
    const parts = p.sp.map(s => mk('curve', { ...style(o), p: { sp: [s] } }));
    w.list.splice(idx, 1, ...parts);
    App.dirtyIndex();
    out.push(...parts);
  }
  App.sel = out;
  App.commit('Pisahkan');
}
// "Break effect apart": blends/contours/extrudes become a group of plain objects
export async function separateEffect(o) {
  if (o.type === 'blend') {
    const steps = mk('g', { ch: [], name: 'Langkah campuran' });
    const tmp = { ...o, a: { ...o.a, hid: true }, b: { ...o.b, hid: true } };
    const g = await explodeToGroup(tmp);
    steps.ch = g.type === 'g' ? g.ch : [g];
    const w = App.where(o), idx = w.list.indexOf(o);
    w.list.splice(idx, 1, o.a, steps, o.b);
    App.dirtyIndex();
    return [o.a, steps, o.b];
  }
  const base = deep(o); delete base.fx.ct; delete base.fx.ext; delete base.fx.bs; delete base.fx.sh;
  const fxOnly = deep(o); fxOnly.fill = null; fxOnly.ol = null; delete fxOnly.pc;
  const g = await explodeToGroup(fxOnly);
  const w = App.where(o), idx = w.list.indexOf(o);
  const res = [g, base];
  w.list.splice(idx, 1, ...res);
  App.dirtyIndex();
  return res;
}

// ---------- Group ----------
export function group(list = sel()) {
  if (!need(1)) return;
  const w = App.where(list[list.length - 1]);
  const order = [...list].sort((a, b) => (App.where(a).list.indexOf(a)) - (App.where(b).list.indexOf(b)));
  const g = mk('g', { ch: order });
  const idx = w.list.indexOf(list[list.length - 1]);
  App.remove(list);
  w.list.splice(Math.min(idx, w.list.length), 0, g);
  App.sel = [g];
  App.commit('Kelompokkan');
}
export function ungroup(list = sel(), all = false) {
  const out = [];
  const one = o => {
    if (o.type !== 'g') { out.push(o); return; }
    const w = App.where(o), idx = w.list.indexOf(o);
    w.list.splice(idx, 1, ...o.ch);
    App.dirtyIndex();
    if (all) o.ch.forEach(one); else out.push(...o.ch);
  };
  list.forEach(one);
  App.sel = out;
  App.commit(all ? 'Pisahkan semua kelompok' : 'Pisahkan kelompok');
}

// ---------- Shaping ----------
async function prepBool(list) {
  await loadGeoLibs(); await ensureFonts(list);
  return list.map(o => ({ o, p: curveOf(o) })).filter(x => x.p && !isEmptyPath(x.p));
}
export async function shaping(op, list = sel(), opts = {}) {
  // CorelDRAW defaults: Trim keeps the source, Intersect keeps both originals
  const keepSrc = opts.keepSrc ?? (op === 'trim' || op === 'int'), keepTgt = opts.keepTgt ?? op === 'int';
  if (!need(op === 'boundary' ? 1 : 2)) return;
  const items = await prepBool(list);
  if (items.length < (op === 'boundary' ? 1 : 2)) return toast('Objek ini tidak dapat dibentuk');
  const target = items[items.length - 1], others = items.slice(0, -1);
  const z = it => { const w = App.where(it.o); return [App.page.layers.indexOf(w.layer), w.list.indexOf(it.o)]; };
  const byZ = [...items].sort((a, b) => { const A = z(a), B = z(b); return A[0] - B[0] || A[1] - B[1]; });
  let created = [];
  try {
    if (op === 'weld') {
      const p = items.slice(1).reduce((acc, it) => boolOp('union', acc, it.p), items[0].p);
      const n = mk('curve', { ...style(target.o), p });
      placeAt(target.o, n); created = [n];
      App.remove(items.map(i => i.o).filter(o => !(keepSrc && o !== target.o) && !(keepTgt && o === target.o)));
    } else if (op === 'trim') {
      let p = target.p;
      for (const it of others) p = boolOp('sub', p, it.p);
      const n = mk('curve', { ...style(target.o), p, pc: target.o.pc });
      placeAt(target.o, n); created = [n];
      App.remove([target.o]);
      if (!keepSrc) App.remove(others.map(i => i.o));
    } else if (op === 'int') {
      for (const it of others) {
        const p = boolOp('int', it.p, target.p);
        if (isEmptyPath(p)) continue;
        const n = mk('curve', { ...style(target.o), p });
        placeAt(byZ[byZ.length - 1].o, n, true); created.push(n);
      }
      if (!keepSrc) App.remove(others.map(i => i.o));
      if (!keepTgt) App.remove([target.o]);
    } else if (op === 'simplify') {
      for (let i = 0; i < byZ.length; i++) {
        let p = byZ[i].p;
        for (let j = i + 1; j < byZ.length; j++) p = boolOp('sub', p, byZ[j].p);
        const n = mk('curve', { ...style(byZ[i].o), p });
        App.replace(byZ[i].o, n); created.push(n);
      }
    } else if (op === 'fmb' || op === 'bmf') {
      const front = byZ[byZ.length - 1], back = byZ[0];
      let p = op === 'fmb' ? front.p : back.p;
      const subs = op === 'fmb' ? byZ.slice(0, -1) : byZ.slice(1);
      for (const it of subs) p = boolOp('sub', p, it.p);
      const keep = op === 'fmb' ? front : back;
      const n = mk('curve', { ...style(keep.o), p });
      placeAt(keep.o, n); created = [n];
      App.remove(items.map(i => i.o));
    } else if (op === 'boundary') {
      const p = items.slice(1).reduce((acc, it) => boolOp('union', acc, it.p), items[0].p);
      const n = mk('curve', { fill: null, ol: { w: .3, c: '#000000' }, p });
      placeAt(byZ[byZ.length - 1].o, n, true); created = [n];
    }
  } catch (e) { console.error(e); toast('Operasi pembentukan gagal: ' + e.message, 'err'); return; }
  created = created.filter(n => !isEmptyPath(n.p));
  App.sel = created;
  App.commit({ weld: 'Las', trim: 'Pangkas', int: 'Irisan', simplify: 'Sederhanakan', fmb: 'Depan kurangi belakang', bmf: 'Belakang kurangi depan', boundary: 'Batas' }[op]);
}
function placeAt(ref, n, above = false) {
  const w = App.where(ref);
  const i = w.list.indexOf(ref);
  w.list.splice(above ? i + 1 : i, 0, n);
  App.dirtyIndex();
}

// ---------- Outline → object ----------
export async function outlineToObject(list = sel()) {
  if (!need(1)) return;
  await loadGeoLibs(); await ensureFonts(list);
  const out = [];
  for (const o of list) {
    if (!o.ol || !(o.ol.w > 0)) continue;
    const polys = polysOf(o, .03), w = strokeW(o.ol, o);
    const sp = strokePolys(polys, w, o.ol.cap || 'butt', o.ol.join || 'miter');
    const n = mk('curve', { fill: { t: 'solid', c: o.ol.c || '#000' }, ol: null, p: polysToPath(sp), name: 'Kerangka' });
    const keep = deep(o); keep.ol = null;
    const w2 = App.where(o), i = w2.list.indexOf(o);
    w2.list.splice(i, 1, ...(o.fill ? [Object.assign(o, { ol: null })] : []), n);
    App.dirtyIndex(); out.push(n);
  }
  if (!out.length) return toast('Objek terpilih tidak memiliki kerangka');
  App.sel = out; App.commit('Konversi kerangka ke objek');
}

// ---------- Order ----------
export function order(how, list = sel()) {
  if (!need(1)) return;
  const byList = new Map();
  for (const o of list) { const w = App.where(o); if (!byList.has(w.list)) byList.set(w.list, []); byList.get(w.list).push(o); }
  for (const [L, objs] of byList) {
    const sorted = objs.sort((a, b) => L.indexOf(a) - L.indexOf(b));
    if (how === 'front') { for (const o of sorted) { L.splice(L.indexOf(o), 1); L.push(o); } }
    else if (how === 'back') { for (const o of sorted.reverse()) { L.splice(L.indexOf(o), 1); L.unshift(o); } }
    else if (how === 'fwd') { for (const o of sorted.reverse()) { const i = L.indexOf(o); if (i < L.length - 1 && !objs.includes(L[i + 1])) { L.splice(i, 1); L.splice(i + 1, 0, o); } } }
    else if (how === 'bwd') { for (const o of sorted) { const i = L.indexOf(o); if (i > 0 && !objs.includes(L[i - 1])) { L.splice(i, 1); L.splice(i - 1, 0, o); } } }
    else if (how === 'reverse') { const idx = sorted.map(o => L.indexOf(o)).sort((a, b) => a - b); const rev = [...sorted].reverse(); idx.forEach((ix, k) => { L[ix] = rev[k]; }); }
  }
  App.dirtyIndex();
  App.commit({ front: 'Ke depan halaman', back: 'Ke belakang halaman', fwd: 'Maju satu', bwd: 'Mundur satu', reverse: 'Balik urutan' }[how]);
}
export function placeRelative(target, front, list = sel()) {
  const tw = App.where(target);
  App.remove(list);
  const i = tw.list.indexOf(target);
  tw.list.splice(front ? i + 1 : i, 0, ...list);
  App.sel = list; App.commit(front ? 'Di depan objek' : 'Di belakang objek');
}

// ---------- Align & distribute ----------
export function align(how, { to = 'auto', list = sel() } = {}) {
  if (!list.length) return need(1);
  let ref;
  if (to === 'page' || (to === 'auto' && list.length === 1)) { const p = App.page; ref = { x: 0, y: 0, w: p.w, h: p.h }; }
  else if (to === 'sel') ref = selBox(list);
  else if (to === 'first') ref = objBox(list[0]);
  else ref = objBox(list[list.length - 1]); // last selected = target (CorelDRAW default)
  for (const o of list) {
    const b = objBox(o); if (!b) continue;
    let dx = 0, dy = 0;
    if (how === 'l') dx = ref.x - b.x; if (how === 'r') dx = ref.x + ref.w - b.x - b.w; if (how === 'hc') dx = ref.x + ref.w / 2 - b.x - b.w / 2;
    if (how === 't') dy = ref.y - b.y; if (how === 'b') dy = ref.y + ref.h - b.y - b.h; if (how === 'vc') dy = ref.y + ref.h / 2 - b.y - b.h / 2;
    if (how === 'c') { dx = ref.x + ref.w / 2 - b.x - b.w / 2; dy = ref.y + ref.h / 2 - b.y - b.h / 2; }
    if (dx || dy) applyM(o, T(dx, dy));
  }
  App.commit('Rata ' + ({ l: 'kiri', r: 'kanan', hc: 'tengah horizontal', t: 'atas', b: 'bawah', vc: 'tengah vertikal', c: 'tengah' }[how]));
}
export function distribute(how, list = sel(), toPage = false) {
  if (list.length < (toPage ? 1 : 3)) return toast('Pilih minimal 3 objek untuk didistribusikan');
  const items = list.map(o => ({ o, b: objBox(o) })).filter(i => i.b);
  const H = how[0] === 'h';
  const key = it => H ? it.b.x + it.b.w / 2 : it.b.y + it.b.h / 2;
  items.sort((a, b) => key(a) - key(b));
  const all = toPage ? { x: 0, y: 0, w: App.page.w, h: App.page.h } : selBox(list);
  if (how.endsWith('s')) { // equal spacing
    const tot = items.reduce((s, i) => s + (H ? i.b.w : i.b.h), 0), gap = ((H ? all.w : all.h) - tot) / (items.length - 1);
    let pos = H ? all.x : all.y;
    for (const it of items) { const d = pos - (H ? it.b.x : it.b.y); applyM(it.o, H ? T(d, 0) : T(0, d)); pos += (H ? it.b.w : it.b.h) + gap; }
  } else {
    const f = how[1] === 'l' ? 0 : how[1] === 'r' ? 1 : .5; // left/top, centre, right/bottom
    const first = items[0].b, last = items[items.length - 1].b;
    const a = toPage ? (H ? all.x + first.w * f : all.y + first.h * f) : (H ? first.x + first.w * f : first.y + first.h * f);
    const z = toPage ? (H ? all.x + all.w - last.w * (1 - f) : all.y + all.h - last.h * (1 - f)) : (H ? last.x + last.w * f : last.y + last.h * f);
    items.forEach((it, i) => { const t = a + (z - a) * i / (items.length - 1), cur = H ? it.b.x + it.b.w * f : it.b.y + it.b.h * f; applyM(it.o, H ? T(t - cur, 0) : T(0, t - cur)); });
  }
  App.commit('Distribusikan');
}

// ---------- Transform helpers ----------
export function transformSel(m, label, list = sel()) { if (!list.length) return; list.forEach(o => applyM(o, m)); App.commit(label); }
export function mirror(h, list = sel()) {
  const b = selBox(list); if (!b) return need(1);
  transformSel(h ? S(-1, 1, b.x + b.w / 2, b.y + b.h / 2) : S(1, -1, b.x + b.w / 2, b.y + b.h / 2), h ? 'Cermin horizontal' : 'Cermin vertikal', list);
}
export function rotateSel(deg, list = sel()) {
  const b = selBox(list); if (!b) return need(1);
  transformSel(R(-deg, b.x + b.w / 2, b.y + b.h / 2), 'Putar ' + deg + '°', list);
}
export function duplicate(list = sel(), off = App.settings.dupOffset) {
  if (!need(1)) return;
  const copies = list.map(o => { const c = cloneObj(o); applyM(c, T(off[0], off[1])); return c; });
  for (let i = 0; i < list.length; i++) { const w = App.where(list[i]); w.list.splice(w.list.indexOf(list[i]) + 1 + i * 0, 0, copies[i]); }
  App.dirtyIndex();
  App.sel = copies; App.commit('Duplikat');
}
export function stepRepeat(n, dx, dy, rot = 0, sc = 1, list = sel()) {
  if (!need(1)) return;
  const out = [];
  let cur = list;
  for (let k = 0; k < n; k++) {
    cur = cur.map(o => { const c = cloneObj(o); const b = objBox(c) || { x: 0, y: 0, w: 0, h: 0 }; const cx = b.x + b.w / 2, cy = b.y + b.h / 2; applyM(c, mul(T(dx, dy), mul(R(-rot, cx, cy), S(sc, sc, cx, cy)))); return c; });
    out.push(...cur);
  }
  App.ctxList.push(...out); App.dirtyIndex();
  App.sel = out; App.commit(`Langkah & ulangi (${n})`);
}
export function lock(v, list = sel()) { list.forEach(o => { o.lock = v; }); App.commit(v ? 'Kunci objek' : 'Buka kunci objek'); }
export function unlockAll() { walk(App.page.layers.flatMap(l => l.objs), o => { o.lock = false; }); App.commit('Buka semua kunci'); }

// ---------- PowerClip ----------
export function powerclipInto(frame, list = sel()) {
  const items = list.filter(o => o !== frame);
  if (!items.length) return;
  App.remove(items);
  // CorelDRAW centres new PowerClip contents in the frame
  const fb = objBox(frame), cb = selBox(items);
  if (fb && cb) items.forEach(o => applyM(o, T(fb.x + fb.w / 2 - (cb.x + cb.w / 2), fb.y + fb.h / 2 - (cb.y + cb.h / 2))));
  frame.pc = [...(frame.pc || []), ...items];
  App.sel = [frame]; App.commit('PowerClip: tempatkan di dalam bingkai');
}
export function powerclipExtract(list = sel()) {
  const out = [];
  for (const f of list) {
    if (!f.pc?.length) continue;
    const w = App.where(f), i = w.list.indexOf(f);
    w.list.splice(i + 1, 0, ...f.pc);
    out.push(...f.pc); delete f.pc;
  }
  App.dirtyIndex();
  if (!out.length) return toast('Tidak ada isi PowerClip');
  App.sel = out; App.commit('Ekstrak isi PowerClip');
}
export function isolate(o) { App.isolate = o; App.sel = []; App.emit('sel'); App.render(); App.emit('isolate'); }
export function endIsolate() { const o = App.isolate; App.isolate = null; App.sel = o ? [o] : []; App.commit('Selesai mengedit'); App.emit('isolate'); }

// ---------- Rasterise ----------
export async function rasterize(list = sel(), dpi = 200, { replace = true, bg = null } = {}) {
  if (!need(1)) return;
  await ensureFonts(list);
  const b = selBox(list); if (!b) return;
  const pad = 2, W = b.w + pad * 2, H = b.h + pad * 2, scale = dpi / 25.4;
  const r = renderObjects(list, { mode: 'export', asset: id => App.doc.assets[id] });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W * scale}" height="${H * scale}" viewBox="${b.x - pad} ${b.y - pad} ${W} ${H}"><defs>${r.defs}</defs>${bg ? `<rect x="${b.x - pad}" y="${b.y - pad}" width="${W}" height="${H}" fill="${bg}"/>` : ''}${r.body}</svg>`;
  const url = await svgToPNG(svg, Math.round(W * scale), Math.round(H * scale));
  const id = App.addAsset(url);
  const img = mk('img', { asset: id, w: W, h: H, tf: T(b.x - pad, b.y - pad), px: [Math.round(W * scale), Math.round(H * scale)] });
  if (replace) {
    const w = App.where(list[list.length - 1]), i = w.list.indexOf(list[list.length - 1]);
    App.remove(list); w.list.splice(Math.min(i, w.list.length), 0, img); App.dirtyIndex();
    App.sel = [img]; App.commit('Konversi ke bitmap');
  }
  return img;
}
export function svgToPNG(svg, w, h, type = 'image/png', q = .92, bgFill) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => {
      const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h);
      const x = c.getContext('2d');
      if (bgFill) { x.fillStyle = bgFill; x.fillRect(0, 0, c.width, c.height); }
      x.drawImage(im, 0, 0, c.width, c.height);
      res(c.toDataURL(type, q));
    };
    im.onerror = () => rej(new Error('Gagal merender gambar'));
    im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}

// ---------- Effects housekeeping ----------
export function clearEffect(kind, list = sel()) {
  for (const o of list) {
    if (kind === 'tr') { o.tr = null; continue; }
    if (kind === 'blend' && o.type === 'blend') { const w = App.where(o), i = w.list.indexOf(o); w.list.splice(i, 1, o.a, o.b); App.dirtyIndex(); continue; }
    if (o.fx) { delete o.fx[kind]; if (!Object.keys(o.fx).length) delete o.fx; }
  }
  App.refreshSel();
  App.commit('Hapus efek');
}
export function copyEffect(kind, from, list = sel()) {
  for (const o of list) {
    if (o === from) continue;
    if (kind === 'tr') o.tr = deep(from.tr);
    else if (kind === 'fill') o.fill = deep(from.fill);
    else if (kind === 'ol') o.ol = deep(from.ol);
    else { o.fx = o.fx || {}; o.fx[kind] = deep(from.fx?.[kind]); }
  }
  App.commit('Salin efek');
}
export { applyLocalFx, baseLocal, inv, I, bbox, flatten, geoReady };
