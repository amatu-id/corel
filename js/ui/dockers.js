// Dockers (right-hand tabbed panels).
import { App } from '../app.js';
import { V } from '../view.js';
import { run, C } from '../commands.js';
import { applyM, newLayer, objName, walk } from '../model.js';
import { selBox, objBox, geom } from '../objgeom.js';
import { T, S, R, K, mul, bbox } from '../geom.js';
import { typeLabel } from '../shapes.js';
import { FONTS, loadFace, glyphList, glyphD, getFace } from '../fonts.js';
import { PATTERNS, TEXTURES, GRAD_PRESETS, ARROWS, DASHES, textureURL, fillColor } from '../fills.js';
import * as Op from '../ops.js';
import { icon } from '../icons.js';
import { h, deep, clamp, toast, fmtU, pickFile, readFile, kbd } from '../util.js';
import { ib, sep, num, sel, seg, tog, check, slider, colorBtn, textField, popup } from './widgets.js';
import { colorPanel } from './colorpicker.js';
import { DOCKERS } from './shell.js';
import { BLEND_MODES } from './propbar.js';
import { FX } from '../tools/fx.js';
import { TextDef, Text } from '../tools/text.js';
import { pathD } from '../geom.js';

const $ = id => document.getElementById(id);
const sel1 = () => App.sel.length === 1 ? App.sel[0] : null;
const leafs = () => { const r = []; const v = o => { if (o.type === 'g') o.ch.forEach(v); else if (o.type === 'blend') { v(o.a); v(o.b); } else r.push(o); }; App.sel.forEach(v); return r; };
const setLeaf = (fn, label, final = true) => { leafs().forEach(fn); final ? App.commit(label) : App.render(); };
const row = (label, ...c) => h('div', { class: 'drow' }, label ? h('span', { class: 'dlab' }, label) : null, h('div', { class: 'dctl' }, ...c.flat().filter(Boolean)));
function section(title, ic, body, { open = true, extra } = {}) {
  const k = 'amatudraw.sec.' + title;
  let isOpen = localStorage.getItem(k) == null ? open : localStorage.getItem(k) === '1';
  const hd = h('button', { class: 'dsec-h', type: 'button' }, h('span', { class: 'chev', html: icon('chevr', 13) }), ic ? h('span', { html: icon(ic, 16) }) : null, h('span', { class: 'dsec-t' }, title), extra || null);
  const bd = h('div', { class: 'dsec-b' }, ...[body].flat().filter(Boolean));
  const s = h('section', { class: 'dsec' + (isOpen ? ' open' : '') }, hd, bd);
  hd.onclick = e => { if (e.target.closest('.dsec-x')) return; isOpen = !isOpen; s.classList.toggle('open', isOpen); localStorage.setItem(k, isOpen ? '1' : '0'); };
  return s;
}
const btn = (t, fn, cls = '') => h('button', { class: 'btn-sm ' + cls, type: 'button', onclick: fn }, t);
const empty = t => h('div', { class: 'dempty' }, h('span', { html: icon('pick', 22) }), t);

// ---------- Properties ----------
function outlineSec() {
  const o = () => leafs().find(x => x.ol) || leafs()[0];
  const ol = () => o()?.ol;
  const upd = (p, label = 'Kerangka', f = true) => setLeaf(x => { x.ol = { ...(x.ol || { w: .2, c: '#000000' }), ...p }; }, label, f);
  const has = !!ol();
  const dashSel = h('div', { class: 'dashes' }, ...DASHES.map((d, i) => { const b = h('button', { class: 'dash' + (JSON.stringify(ol()?.d || null) === JSON.stringify(d) ? ' on' : ''), type: 'button', title: d ? d.join('-') : 'Utuh', html: `<svg width="64" height="8"><line x1="2" y1="4" x2="62" y2="4" stroke="currentColor" stroke-width="2" ${d ? `stroke-dasharray="${d.map(v => v * 2).join(' ')}"` : ''}/></svg>` }); b.onclick = () => upd({ d: d ? [...d] : null }, 'Gaya garis'); return b; }));
  const arrowSel = side => sel({ options: [['', 'Tidak ada'], ...Object.entries(ARROWS).map(([k, a]) => [k, a.n])], get: () => ol()?.[side] || '', set: v => upd({ [side]: v || null }, 'Ujung panah'), w: 112 });
  const body = [
    row('Lebar', num({ unit: 'mmw', get: () => ol()?.w ?? 0, set: (v, f) => { if (v <= 0) setLeaf(x => { x.ol = null; }, 'Tanpa kerangka', f); else upd({ w: v }, 'Lebar kerangka', f); }, min: 0, w: 70, dec: 3, step: .05, suffix: 'mm' }),
      sel({ options: [['', 'Preset…'], ['0', 'Tidak ada'], ['.076', 'Garis rambut'], ['.1', '0,1 mm'], ['.2', '0,2 mm'], ['.25', '0,25 mm'], ['.35', '0,35 mm'], ['.5', '0,5 mm'], ['.75', '0,75 mm'], ['1', '1 mm'], ['1.5', '1,5 mm'], ['2', '2 mm'], ['3', '3 mm'], ['5', '5 mm']], get: () => '', set: v => { if (v === '') return; +v ? upd({ w: +v }, 'Lebar kerangka') : setLeaf(x => { x.ol = null; }, 'Tanpa kerangka'); }, w: 92 })),
    row('Warna', colorBtn({ get: () => ol()?.c, set: (c, f) => c ? upd({ c }, 'Warna kerangka', f) : setLeaf(x => { x.ol = null; }, 'Tanpa kerangka', f) })),
    row('Gaya', dashSel),
    row('Ujung', seg([['butt', 'minus', 'Ujung datar'], ['round', 'round', 'Ujung bulat'], ['square', 'rect', 'Ujung persegi']], () => ol()?.cap || 'butt', v => upd({ cap: v }, 'Ujung garis'))),
    row('Sudut', seg([['miter', 'chamfer', 'Sudut lancip'], ['round', 'round', 'Sudut bulat'], ['bevel', 'scallop', 'Sudut potong']], () => ol()?.join || 'miter', v => upd({ join: v }, 'Sudut garis'))),
    row('Posisi', seg([['out', 'zoomin', 'Kerangka di luar'], ['mid', 'minus', 'Kerangka di tengah'], ['in', 'zoomout', 'Kerangka di dalam']], () => ol()?.pos || 'mid', v => upd({ pos: v }, 'Posisi kerangka'))),
    row('Panah', arrowSel('as'), arrowSel('ae')),
    row('', check('Di belakang isian', () => ol()?.bh, v => upd({ bh: v }, 'Kerangka di belakang')), check('Skala dengan objek', () => ol()?.sc, v => upd({ sc: v }, 'Skala kerangka'))),
  ];
  return section('Kerangka', 'outline', has || leafs().length ? body : [], { extra: h('span', { class: 'dsec-sw', style: { borderColor: ol()?.c || 'transparent' } }) });
}
function gradEditor(f, apply) {
  let si = 0;
  const bar = h('div', { class: 'gbar' }), stops = h('div', { class: 'gstops' });
  const draw = () => {
    const st = [...f().st].sort((a, b) => a.o - b.o);
    bar.style.background = `linear-gradient(90deg, ${st.map(s => `${hexa(s.c, s.a ?? 1)} ${s.o * 100}%`).join(',')})`;
    stops.innerHTML = '';
    f().st.forEach((s, i) => {
      const k = h('i', { class: 'gstop' + (i === si ? ' on' : ''), style: { left: s.o * 100 + '%', background: s.c }, title: 'Seret untuk memindah · dobel klik hapus' });
      k.onpointerdown = e => {
        e.preventDefault(); si = i; draw(); cb.refresh(); op.refresh();
        const r = bar.getBoundingClientRect();
        const mv = ev => { f().st[i].o = clamp((ev.clientX - r.left) / r.width, 0, 1); draw(); apply(false); };
        const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); apply(true); };
        addEventListener('pointermove', mv); addEventListener('pointerup', up);
      };
      k.ondblclick = () => { if (f().st.length > 2) { f().st.splice(i, 1); si = 0; draw(); apply(true); } };
      stops.append(k);
    });
  };
  bar.onclick = e => { const r = bar.getBoundingClientRect(), o = (e.clientX - r.left) / r.width, st = [...f().st].sort((a, b) => a.o - b.o); let c = st[0].c; for (const s of st) if (s.o <= o) c = s.c; f().st.push({ o, c, a: 1 }); si = f().st.length - 1; draw(); apply(true); cb.refresh(); };
  const cb = colorBtn({ get: () => f().st[si]?.c, set: (c, fi) => { if (f().st[si]) f().st[si].c = c || '#000000'; draw(); apply(fi); }, none: false, title: 'Warna titik gradasi' });
  const op = slider({ get: () => Math.round((f().st[si]?.a ?? 1) * 100), set: (v, fi) => { if (f().st[si]) f().st[si].a = v / 100; draw(); apply(fi); }, min: 0, max: 100, w: 80, fmt: v => v + '%' });
  const presets = h('div', { class: 'gpresets' }, ...GRAD_PRESETS.map(p => { const b = h('button', { class: 'gpre', title: p.n, style: { background: `linear-gradient(90deg, ${p.st.map(s => `${s.c} ${s.o * 100}%`).join(',')})` } }); b.onclick = () => { f().st = deep(p.st); if (p.g !== f().g) f().g = p.g; si = 0; draw(); apply(true); }; return b; }));
  draw();
  return [h('div', { class: 'gwrap' }, bar, stops), row('Titik', cb, op, ib('trash', 'Hapus titik', () => { if (f().st.length > 2) { f().st.splice(si, 1); si = 0; draw(); apply(true); } }), ib('reverse', 'Balik', () => { f().st = f().st.map(s => ({ ...s, o: 1 - s.o })); draw(); apply(true); })), row('Preset', presets)];
}
const hexa = (hx, a) => { if (a >= 1) return hx; const n = parseInt(hx.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
function fillSec() {
  const o = () => leafs()[0], f = () => o()?.fill;
  const type = () => { const x = f(); return !x ? 'none' : x.t === 'grad' ? x.g : x.t; };
  const body = [row('', seg([['none', 'nofill', 'Tanpa isian'], ['solid', 'fill', 'Seragam'], ['lin', 'linear', 'Gradasi linier'], ['rad', 'radial', 'Gradasi radial'], ['con', 'conical', 'Gradasi kerucut'], ['sq', 'square', 'Gradasi persegi'], ['pat', 'pattern', 'Pola dua warna'], ['tex', 'texture', 'Tekstur'], ['bmp', 'image', 'Pola bitmap']], type, async v => {
    if (v === 'bmp') { const [file] = await pickFile('image/*'); if (!file) return; const url = await readFile(file, 'url'); const id = App.addAsset(url); const im = new Image(); im.src = url; await im.decode(); setLeaf(x => { x.fill = { t: 'bmp', asset: id, s: 20, ar: im.naturalHeight / im.naturalWidth, a: 0 }; }, 'Isian bitmap'); return; }
    App.ui.setFillType(v); rebuildActive();
  }))];
  const x = f();
  if (x?.t === 'solid') body.push(colorPanel(x.c, (c, fin) => setLeaf(q => { q.fill = c ? { t: 'solid', c, a: q.fill?.a } : null; }, 'Warna isian', fin), { compact: true }), row('Opasitas', slider({ get: () => Math.round((f()?.a ?? 1) * 100), set: (v, fin) => setLeaf(q => { if (q.fill?.t === 'solid') q.fill.a = v / 100; }, 'Opasitas isian', fin), min: 0, max: 100, w: 120, fmt: v => v + '%' })));
  if (x?.t === 'grad') {
    body.push(...gradEditor(() => f(), fin => { const src = f(); setLeaf(q => { if (q !== o() && q.fill?.t === 'grad') q.fill.st = deep(src.st); }, 'Gradasi', fin); if (fin) App.commit('Gradasi'); else App.render(); }));
    body.push(row('Ulang', sel({ options: [['', 'Tidak'], ['repeat', 'Ulang'], ['reflect', 'Ulang & cermin']], get: () => f()?.sp || '', set: v => setLeaf(q => { if (q.fill?.t === 'grad') q.fill.sp = v || undefined; }, 'Pengulangan'), w: 130 })),
      h('div', { class: 'dnote' }, 'Atur arah gradasi dengan ', h('b', {}, 'Alat Isian Interaktif (G)'), ' — seret pegangan di kanvas.'));
  }
  if (x?.t === 'pat') {
    body.push(h('div', { class: 'patgrid' }, ...Object.entries(PATTERNS).map(([k, p]) => { const b = h('button', { class: 'patc' + (f()?.id === k ? ' on' : ''), title: p.n, html: `<svg viewBox="0 0 20 20" width="34" height="34"><defs><pattern id="pp_${k}" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="#fff"/><path d="${p.d}" fill="#222"/></pattern></defs><rect width="20" height="20" fill="url(#pp_${k})"/></svg>` }); b.onclick = () => { setLeaf(q => { if (q.fill?.t === 'pat') q.fill.id = k; }, 'Pola'); rebuildActive(); }; return b; })),
      row('Depan', colorBtn({ get: () => f()?.fg, set: (c, fin) => setLeaf(q => { if (q.fill?.t === 'pat') q.fill.fg = c || '#000'; }, 'Warna pola', fin), none: false }), h('span', { class: 'dlab2' }, 'Belakang'), colorBtn({ get: () => f()?.bg, set: (c, fin) => setLeaf(q => { if (q.fill?.t === 'pat') q.fill.bg = c; }, 'Latar pola', fin) })),
      row('Ukuran', num({ get: () => f()?.s ?? 5, set: (v, fin) => setLeaf(q => { if (q.fill?.t === 'pat') q.fill.s = v; }, 'Ukuran pola', fin), min: .2, w: 64 }), num({ icon: 'rotl', unit: 'deg', get: () => f()?.a ?? 0, set: (v, fin) => setLeaf(q => { if (q.fill?.t === 'pat') q.fill.a = v; }, 'Sudut pola', fin), w: 46, suffix: '°' })));
  }
  if (x?.t === 'tex') {
    body.push(h('div', { class: 'texgrid' }, ...Object.entries(TEXTURES).map(([k, t]) => { const b = h('button', { class: 'texc' + (f()?.id === k ? ' on' : ''), title: t.n }); b.style.backgroundImage = `url(${textureURL(k, null, null, 1, 64)})`; b.onclick = () => { setLeaf(q => { if (q.fill?.t === 'tex') { q.fill.id = k; delete q.fill.c1; delete q.fill.c2; } }, 'Tekstur'); rebuildActive(); }; return b; })),
      row('Warna', colorBtn({ get: () => f()?.c1 || TEXTURES[f()?.id]?.c1, set: (c, fin) => setLeaf(q => { if (q.fill?.t === 'tex') q.fill.c1 = c; }, 'Warna tekstur', fin), none: false }), colorBtn({ get: () => f()?.c2 || TEXTURES[f()?.id]?.c2, set: (c, fin) => setLeaf(q => { if (q.fill?.t === 'tex') q.fill.c2 = c; }, 'Warna tekstur', fin), none: false }), ib('sparkle', 'Acak', () => setLeaf(q => { if (q.fill?.t === 'tex') q.fill.seed = Math.floor(Math.random() * 9999); }, 'Acak tekstur'))),
      row('Ukuran', num({ get: () => f()?.s ?? 20, set: (v, fin) => setLeaf(q => { if (q.fill?.t === 'tex') q.fill.s = v; }, 'Ukuran tekstur', fin), min: 1, w: 64 })));
  }
  if (x?.t === 'bmp') body.push(row('Ukuran', num({ get: () => f()?.s ?? 20, set: (v, fin) => setLeaf(q => { if (q.fill?.t === 'bmp') q.fill.s = v; }, 'Ukuran ubin', fin), min: 1, w: 64 }), num({ icon: 'rotl', unit: 'deg', get: () => f()?.a ?? 0, set: (v, fin) => setLeaf(q => { if (q.fill?.t === 'bmp') q.fill.a = v; }, 'Sudut ubin', fin), w: 46, suffix: '°' })));
  const fc = fillColor(x);
  return section('Isian', 'fill', body, { extra: h('span', { class: 'dsec-sw f', style: { background: fc || '' } }) });
}
function transpSec() {
  const o = () => App.sel[0], tr = () => o()?.tr;
  const set = (p, label = 'Transparansi', f = true) => { App.sel.forEach(x => { x.tr = x.tr ? { ...x.tr, ...p } : { t: 'uni', v: .5, ...p }; }); f ? App.commit(label) : App.render(); };
  const body = [row('', seg([['none', 'nofill', 'Tanpa'], ['uni', 'fill', 'Seragam'], ['lin', 'linear', 'Linier'], ['rad', 'radial', 'Radial']], () => tr()?.t || 'none', v => {
    App.sel.forEach(x => { if (v === 'none') x.tr = null; else if (v === 'uni') x.tr = { t: 'uni', v: x.tr?.v ?? .5, m: x.tr?.m }; else { const g = geom(x.type === 'g' ? x.ch[0] : x), b = bbox(g.local || g.p); x.tr = { t: v, p1: v === 'lin' ? [b.x, b.y + b.h / 2] : [b.x + b.w / 2, b.y + b.h / 2], p2: [b.x + b.w, b.y + b.h / 2], v1: 0, v2: 1, m: x.tr?.m }; } });
    App.commit('Jenis transparansi'); rebuildActive();
  }))];
  if (tr()?.t === 'uni') body.push(row('Nilai', slider({ get: () => Math.round((tr()?.v ?? 0) * 100), set: (v, f) => set({ v: v / 100 }, 'Transparansi', f), min: 0, max: 100, w: 140, fmt: v => v + '%' })));
  if (tr()?.p1) body.push(row('Awal', slider({ get: () => Math.round((tr()?.v1 ?? 0) * 100), set: (v, f) => set({ v1: v / 100 }, 'Transparansi', f), min: 0, max: 100, w: 120, fmt: v => v + '%' })), row('Akhir', slider({ get: () => Math.round((tr()?.v2 ?? 1) * 100), set: (v, f) => set({ v2: v / 100 }, 'Transparansi', f), min: 0, max: 100, w: 120, fmt: v => v + '%' })), h('div', { class: 'dnote' }, 'Atur arah dengan Alat Transparansi (U).'));
  if (tr()) body.push(row('Mode', sel({ options: BLEND_MODES, get: () => tr()?.m || 'normal', set: v => set({ m: v }, 'Mode gabung'), w: 150 })));
  return section('Transparansi', 'transp', body, { open: false });
}
const FX_NAMES = { sh: ['Bayangan jatuh', 'shadow', 'shadow'], ct: ['Kontur', 'contour', 'contour'], ext: ['Ekstrusi', 'extrude', 'extrude'], bs: ['Bayangan blok', 'block', 'block'], env: ['Amplop', 'envelope', 'envelope'], persp: ['Perspektif', 'persp', 'shape'], dist: ['Distorsi', 'distort', 'distort'], lens: ['Lensa', 'lens', null] };
function effectsList() {
  const o = sel1(); if (!o) return null;
  const items = Object.keys(o.fx || {}).filter(k => FX_NAMES[k]);
  if (o.pc?.length) items.push('pc');
  if (o.type === 'blend') items.push('blend');
  if (!items.length) return section('Efek', 'fx', [h('div', { class: 'dnote' }, 'Belum ada efek. Gunakan alat efek interaktif di kotak alat atau menu Efek.')], { open: false });
  return section('Efek', 'fx', items.map(k => {
    const [n, ic, tool] = k === 'pc' ? [`PowerClip (${o.pc.length} objek)`, 'powerclip'] : k === 'blend' ? [`Campuran (${o.n} langkah)`, 'blend', 'blend'] : FX_NAMES[k];
    return h('div', { class: 'fxrow' }, h('span', { html: icon(ic, 16) }), h('span', { class: 'grow' }, n),
      tool ? ib('props', 'Edit', () => App.setTool(tool), { size: 15 }) : k === 'lens' ? ib('props', 'Edit', () => App.ui.openDocker('lens'), { size: 15 }) : k === 'pc' ? ib('props', 'Edit isi', () => run('pcEdit'), { size: 15 }) : null,
      ib('close', 'Hapus efek', () => { if (k === 'pc') run('pcExtract'); else Op.clearEffect(k); }, { size: 14 }));
  }));
}
function objectSec() {
  const o = sel1(); if (!o) return null;
  return section('Objek', 'object', [
    row('Nama', textField({ get: () => sel1()?.name || '', set: v => { if (sel1()) { sel1().name = v; App.commit('Ganti nama'); } }, w: 170, placeholder: typeLabel(o) })),
    row('', check('Kunci', () => sel1()?.lock, v => Op.lock(v)), check('Sembunyikan', () => sel1()?.hid, v => { sel1().hid = v; App.commit(v ? 'Sembunyikan' : 'Tampilkan'); })),
  ], { open: false });
}
const DK = {
  props: {
    t: 'Properti', i: 'props', build() {
      if (!App.doc || App.startOn) return [empty('Buka dokumen untuk melihat properti')];
      if (!App.sel.length) return [h('div', { class: 'dhint' }, h('b', {}, 'Tidak ada objek terpilih'), h('span', {}, 'Pilih objek untuk mengatur isian, kerangka, transparansi dan efeknya.')),
        section('Halaman', 'page', [row('Latar', colorBtn({ get: () => App.page.bg, set: (c, f) => { App.page.bg = c || '#ffffff'; V._pg = null; f ? App.commit('Latar halaman') : App.render(); }, none: false })), row('Ukuran', btn('Tata letak halaman…', () => run('pageSetup')))])];
      return [outlineSec(), fillSec(), transpSec(), effectsList(), objectSec()].filter(Boolean);
    }
  },
  objects: { t: 'Objek', i: 'layer', build: buildObjects },
  transform: { t: 'Transformasi', i: 'xform', build: buildTransform },
  align: { t: 'Rata & Distribusi', i: 'aleft', build: buildAlign },
  shaping: { t: 'Pembentukan', i: 'weld', build: buildShaping },
  color: {
    t: 'Warna', i: 'wheel', build() {
      let cur = fillColor(App.sel[0]?.fill) || App.ui.activeColor || '#2f6bff';
      return [colorPanel(cur, c => { cur = c; }, { none: false }), row('', btn('Isi', () => App.ui.applyColor(cur, false), 'pri'), btn('Kerangka', () => App.ui.applyColor(cur, true)))];
    }
  },
  effects: { t: 'Efek', i: 'fx', build: buildEffects },
  contour: { t: 'Kontur', i: 'contour', build: buildContour },
  blend: { t: 'Campuran', i: 'blend', build: buildBlend },
  lens: { t: 'Lensa', i: 'lens', build: buildLens },
  text: { t: 'Teks', i: 'text', build: buildText },
  glyphs: { t: 'Glif', i: 'glyph', build: buildGlyphs },
  history: {
    t: 'Riwayat', i: 'history', build() {
      const st = App.hist?.stack || [];
      if (!st.length) return [empty('Belum ada riwayat')];
      const list = h('div', { class: 'hlist' }, ...st.map((s, i) => { const r = h('button', { class: 'hrow' + (i === App.hist.i ? ' on' : '') + (i > App.hist.i ? ' fut' : ''), type: 'button' }, h('span', { class: 'hi' }, String(i)), h('span', { class: 'grow' }, s.label), h('span', { class: 'ht' }, new Date(s.t).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }))); r.onclick = () => App.goHist(i); return r; }).reverse());
      return [list, row('', btn('Urungkan', () => run('undo')), btn('Ulangi', () => run('redo')))];
    }
  },
  steprep: { t: 'Langkah & Ulangi', i: 'steprep', build: buildStep },
};

// ---------- Objects (Object Manager) ----------
function buildObjects() {
  if (!App.doc || App.startOn) return [empty('Tidak ada dokumen')];
  const d = App.doc, out = [];
  const tools = h('div', { class: 'dtools' },
    ib('plus', 'Lapisan baru', () => { const l = newLayer('Lapisan ' + (App.page.layers.length + 1), ['#2f80ed', '#e5484d', '#30a46c', '#f5a524', '#8e4ec6', '#12a594'][App.page.layers.length % 6]); App.page.layers.push(l); App.page.cur = l.id; App.commit('Lapisan baru'); }),
    ib('trash', 'Hapus lapisan aktif', () => { const p = App.page; if (p.layers.length < 2) return toast('Halaman harus memiliki minimal satu lapisan'); const i = p.layers.findIndex(l => l.id === p.cur); p.layers.splice(i, 1); p.cur = p.layers[Math.max(0, i - 1)].id; App.sel = []; App.commit('Hapus lapisan'); }),
    ib('chevu', 'Naikkan lapisan', () => moveLayer(1)), ib('chevd', 'Turunkan lapisan', () => moveLayer(-1)),
    h('div', { class: 'grow' }), ib('dup', 'Duplikat halaman', () => run('pageDup')), ib('page', 'Halaman baru', () => run('pageAdd')));
  out.push(tools);
  const tree = h('div', { class: 'otree' });
  d.pages.forEach((p, pi) => {
    const cur = pi === d.pi;
    const ph = h('div', { class: 'orow page' + (cur ? ' on' : '') }, h('span', { html: icon('page', 15) }), h('span', { class: 'grow' }, p.name || `Halaman ${pi + 1}`), h('span', { class: 'osz' }, `${fmtU(p.w, d.units, 1)} × ${fmtU(p.h, d.units, 1)}`));
    ph.onclick = () => App.ui.gotoPage(pi);
    tree.append(ph);
    if (!cur) return;
    [...p.layers].reverse().forEach(L => {
      const active = L.id === p.cur;
      const lr = h('div', { class: 'orow layer' + (active ? ' act' : '') },
        h('i', { class: 'lcol', style: { background: L.color } }), h('span', { html: icon('layer', 15) }), h('span', { class: 'grow lname' }, L.name),
        tbtn(L.vis ? 'eye' : 'eyeoff', 'Tampilkan/sembunyikan', () => { L.vis = !L.vis; App.commit('Visibilitas lapisan'); }, !L.vis),
        tbtn('print', 'Dapat dicetak', () => { L.print = !L.print; App.commit('Cetak lapisan'); }, !L.print),
        tbtn(L.lock ? 'lock' : 'unlock', 'Kunci lapisan', () => { L.lock = !L.lock; App.commit('Kunci lapisan'); }, L.lock));
      lr.onclick = e => { if (e.target.closest('.tb')) return; p.cur = L.id; App.emit('change'); rebuildActive(); };
      lr.ondblclick = async () => { const v = await App.ui.prompt('Nama lapisan', L.name); if (v) { L.name = v; App.commit('Ganti nama lapisan'); } };
      dropTarget(lr, L, null);
      tree.append(lr);
      const addObjs = (list, depth, owner) => [...list].reverse().forEach(o => {
        const isSel = App.sel.includes(o);
        const hasKids = o.type === 'g' || o.type === 'blend' || o.pc?.length;
        const open = App.ui._open?.has(o.id);
        const r = h('div', { class: 'orow obj' + (isSel ? ' on' : '') + (o.hid ? ' dim' : ''), draggable: 'true', style: { paddingLeft: 10 + depth * 14 + 'px' } },
          hasKids ? h('button', { class: 'ocaret' + (open ? ' open' : ''), html: icon('chevr', 12), onclick: e => { e.stopPropagation(); App.ui._open ||= new Set(); open ? App.ui._open.delete(o.id) : App.ui._open.add(o.id); rebuildActive(); } }) : h('span', { class: 'ocaret sp' }),
          h('span', { class: 'oic', html: icon(typeIcon(o), 15) }), h('span', { class: 'grow oname' }, o.name || (o.type === 'text' ? '“' + (o.s || '').slice(0, 24) + '”' : typeLabel(o))),
          o.fill ? h('i', { class: 'oswatch', style: { background: fillColor(o.fill) } }) : null,
          tbtn(o.hid ? 'eyeoff' : 'eye', 'Tampilkan/sembunyikan', () => { o.hid = !o.hid; App.commit('Visibilitas'); }, o.hid),
          tbtn(o.lock ? 'lock' : 'unlock', 'Kunci', () => { o.lock = !o.lock; App.commit('Kunci'); }, o.lock));
        r.onclick = e => { if (e.target.closest('.tb,.ocaret')) return; p.cur = L.id; App.select(o, e.shiftKey ? 'add' : (e.metaKey || e.ctrlKey) ? 'toggle' : 'set'); };
        r.ondblclick = async e => { if (e.target.closest('.tb,.ocaret')) return; const v = await App.ui.prompt('Nama objek', o.name || typeLabel(o)); if (v != null) { o.name = v; App.commit('Ganti nama'); } };
        r.ondragstart = e => { App.ui._drag = o; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', o.id); };
        dropTarget(r, L, o);
        tree.append(r);
        if (hasKids && open) {
          if (o.type === 'g') addObjs(o.ch, depth + 1, o);
          if (o.type === 'blend') addObjs([o.a, o.b], depth + 1, o);
          if (o.pc?.length) addObjs(o.pc, depth + 1, o);
        }
        void owner;
      });
      addObjs(L.objs, 1, null);
    });
  });
  out.push(tree);
  return out;
}
const tbtn = (ic, t, fn, off) => { const b = h('button', { class: 'tb' + (off ? ' off' : ''), title: t, html: icon(ic, 14) }); b.onclick = e => { e.stopPropagation(); fn(); }; return b; };
function typeIcon(o) { return { rect: 'rect', ell: 'ellipse', poly: o.cs ? 'cstar' : o.star ? 'star' : 'polygon', spiral: 'spiral', ps: 'basic', curve: 'bezier', text: 'text', img: 'image', g: 'group', blend: 'blend', dim: 'dim', conn: 'conn', table: 'table', qr: 'qr' }[o.type] || 'object'; }
function moveLayer(dir) {
  const p = App.page, i = p.layers.findIndex(l => l.id === p.cur), j = i + dir;
  if (j < 0 || j >= p.layers.length) return;
  [p.layers[i], p.layers[j]] = [p.layers[j], p.layers[i]]; App.commit('Urutan lapisan');
}
function dropTarget(el, L, ref) {
  el.addEventListener('dragover', e => { if (!App.ui._drag) return; e.preventDefault(); el.classList.add('dropping'); });
  el.addEventListener('dragleave', () => el.classList.remove('dropping'));
  el.addEventListener('drop', e => {
    e.preventDefault(); el.classList.remove('dropping');
    const o = App.ui._drag; App.ui._drag = null;
    if (!o || o === ref) return;
    const w = App.where(o); if (!w) return;
    w.list.splice(w.list.indexOf(o), 1);
    if (ref) { const rw = App.where(ref); rw.list.splice(rw.list.indexOf(ref) + 1, 0, o); }
    else L.objs.push(o);
    App.dirtyIndex(); App.commit('Pindahkan objek');
  });
}

// ---------- Transform ----------
let XT = { tab: 'pos', anchor: 4, rel: true, copies: 0, x: 0, y: 0, a: 0, sx: 100, sy: 100, mh: false, mv: false, prop: true, w: 0, h: 0, kx: 0, ky: 0 };
function buildTransform() {
  const tabs = h('div', { class: 'dtabs' }, ...[['pos', 'arrowr', 'Posisi'], ['rot', 'rotl', 'Putar'], ['scale', 'mirrorh', 'Skala & cermin'], ['size', 'rect', 'Ukuran'], ['skew', 'xform', 'Miring']].map(([k, ic, t]) => { const b = h('button', { class: XT.tab === k ? 'on' : '', title: t, html: icon(ic, 17) }); b.onclick = () => { XT.tab = k; rebuildActive(); }; return b; }));
  const anchor = h('div', { class: 'anchor9' }, ...Array.from({ length: 9 }, (_, i) => { const b = h('button', { class: i === XT.anchor ? 'on' : '' }); b.onclick = () => { XT.anchor = i; rebuildActive(); }; return b; }));
  const b0 = selBox(App.sel);
  const N = (label, key, unit = 'len', o = {}) => num({ label, unit, get: () => XT[key], set: v => { XT[key] = v; }, w: 80, ...o });
  let fields = [];
  if (XT.tab === 'pos') { if (!XT.rel && b0) { XT.x = b0.x + b0.w * (XT.anchor % 3) / 2; XT.y = b0.y + b0.h * Math.floor(XT.anchor / 3) / 2; } fields = [row('X', N('', 'x')), row('Y', N('', 'y')), row('', check('Posisi relatif', () => XT.rel, v => { XT.rel = v; if (v) { XT.x = XT.y = 0; } rebuildActive(); }))]; }
  if (XT.tab === 'rot') fields = [row('Sudut', N('', 'a', 'deg', { suffix: '°' })), row('', h('span', { class: 'dnote' }, 'Pusat rotasi mengikuti titik jangkar.'))];
  if (XT.tab === 'scale') fields = [row('H', N('', 'sx', 'pct', { suffix: '%' })), row('V', N('', 'sy', 'pct', { suffix: '%' })), row('Cermin', tog('mirrorh', 'Cermin horizontal', () => XT.mh, v => { XT.mh = v; }), tog('mirrorv', 'Cermin vertikal', () => XT.mv, v => { XT.mv = v; })), row('', check('Proporsional', () => XT.prop, v => { XT.prop = v; }))];
  if (XT.tab === 'size') { if (b0 && !XT.w) { XT.w = b0.w; XT.h = b0.h; } fields = [row('L', num({ unit: 'len', get: () => XT.w, set: v => { if (XT.prop && XT.w) XT.h = XT.h * v / XT.w; XT.w = v; rebuildActive(); }, w: 80 })), row('T', num({ unit: 'len', get: () => XT.h, set: v => { if (XT.prop && XT.h) XT.w = XT.w * v / XT.h; XT.h = v; rebuildActive(); }, w: 80 })), row('', check('Proporsional', () => XT.prop, v => { XT.prop = v; }))]; }
  if (XT.tab === 'skew') fields = [row('X', N('', 'kx', 'deg', { suffix: '°' })), row('Y', N('', 'ky', 'deg', { suffix: '°' }))];
  const apply = () => {
    if (!App.sel.length) return toast('Pilih objek terlebih dahulu');
    const b = selBox(App.sel), ax = b.x + b.w * (XT.anchor % 3) / 2, ay = b.y + b.h * Math.floor(XT.anchor / 3) / 2;
    let m;
    if (XT.tab === 'pos') m = XT.rel ? T(XT.x, XT.y) : T(XT.x - ax, XT.y - ay);
    if (XT.tab === 'rot') m = R(-XT.a, ax, ay);
    if (XT.tab === 'scale') { const sx = XT.sx / 100 * (XT.mh ? -1 : 1), sy = (XT.prop ? XT.sx : XT.sy) / 100 * (XT.mv ? -1 : 1); m = S(sx, sy, ax, ay); }
    if (XT.tab === 'size') m = S(XT.w / (b.w || 1), XT.h / (b.h || 1), ax, ay);
    if (XT.tab === 'skew') m = K(XT.kx, XT.ky, ax, ay);
    if (XT.copies > 0) {
      const out = []; let cur = App.sel;
      for (let k = 0; k < XT.copies; k++) { cur = cur.map(o => { const c = Op.toCurveObj ? JSON.parse(JSON.stringify(o)) : o; App.ui.reid(c); applyM(c, m); return c; }); out.push(...cur); }
      App.ctxList.push(...out); App.dirtyIndex(); App.sel = out; App.commit('Transformasi + salinan');
    } else { App.sel.forEach(o => applyM(o, m)); App.commit('Transformasi'); }
    if (XT.tab === 'size') XT.w = 0;
  };
  return [tabs, h('div', { class: 'xtgrid' }, h('div', {}, ...fields), anchor), row('Salinan', num({ unit: 'int', get: () => XT.copies, set: v => { XT.copies = Math.max(0, Math.round(v)); }, w: 60, dec: 0 })), row('', btn('Terapkan', apply, 'pri wide'))];
}

// ---------- Align & distribute ----------
let AL = { to: 'auto', dto: 'sel' };
function buildAlign() {
  const a = k => ib({ l: 'aleft', hc: 'ahc', r: 'aright', t: 'atop', vc: 'avc', b: 'abottom' }[k], { l: 'Rata kiri (L)', hc: 'Rata tengah horizontal (C)', r: 'Rata kanan (R)', t: 'Rata atas (T)', vc: 'Rata tengah vertikal (E)', b: 'Rata bawah (B)' }[k], () => Op.align(k, { to: AL.to }));
  const d = (k, ic, t) => ib(ic, t, () => Op.distribute(k, App.sel, AL.dto === 'page'));
  return [section('Rata', 'aleft', [row('', a('l'), a('hc'), a('r'), sep(), a('t'), a('vc'), a('b')),
    row('Terhadap', sel({ options: [['auto', 'Objek target (terakhir dipilih)'], ['first', 'Objek pertama dipilih'], ['sel', 'Batas pilihan'], ['page', 'Halaman']], get: () => AL.to, set: v => { AL.to = v; }, w: 190 })),
    row('', btn('Tengahkan ke halaman (P)', () => run('centerPage')))]),
  section('Distribusi', 'dh', [row('Horizontal', d('hl', 'aleft', 'Distribusi kiri'), d('hc', 'dh', 'Distribusi tengah'), d('hr', 'aright', 'Distribusi kanan'), d('hs', 'dsh', 'Spasi sama')),
    row('Vertikal', d('vl', 'atop', 'Distribusi atas'), d('vc', 'dv', 'Distribusi tengah'), d('vr', 'abottom', 'Distribusi bawah'), d('vs', 'dsv', 'Spasi sama')),
    row('Terhadap', sel({ options: [['sel', 'Batas pilihan'], ['page', 'Halaman']], get: () => AL.dto, set: v => { AL.dto = v; }, w: 150 }))]),
  h('div', { class: 'dnote' }, 'Seperti CorelDRAW: objek yang dipilih terakhir menjadi target perataan.')];
}

// ---------- Shaping ----------
let SH = { op: 'weld', src: false, tgt: false };
const SH_DEF = { weld: [false, false], trim: [true, false], int: [true, true] };
function buildShaping() {
  const ops = [['weld', 'Las'], ['trim', 'Pangkas'], ['int', 'Irisan'], ['simplify', 'Sederhanakan'], ['fmb', 'Depan kurangi belakang'], ['bmf', 'Belakang kurangi depan'], ['boundary', 'Batas']];
  const icn = { weld: 'weld', trim: 'trim', int: 'intersect', simplify: 'simplify', fmb: 'fmb', bmf: 'bmf', boundary: 'boundary' };
  const desc = { weld: 'Menggabungkan objek terpilih menjadi satu bentuk dengan atribut objek target.', trim: 'Memotong objek target dengan bentuk objek sumber.', int: 'Membuat objek baru dari area yang tumpang tindih.', simplify: 'Memangkas bagian yang tertutup objek lain di atasnya.', fmb: 'Objek terdepan dikurangi semua objek di belakangnya.', bmf: 'Objek terbelakang dikurangi semua objek di depannya.', boundary: 'Membuat kerangka di sekeliling objek terpilih.' };
  return [h('div', { class: 'shops' }, ...ops.map(([k, l]) => { const b = h('button', { class: 'shop' + (SH.op === k ? ' on' : ''), type: 'button' }, h('span', { html: icon(icn[k], 24) }), h('span', {}, l)); b.onclick = () => { SH.op = k; if (SH_DEF[k]) [SH.src, SH.tgt] = SH_DEF[k]; rebuildActive(); }; return b; })),
    h('div', { class: 'dnote' }, desc[SH.op]),
    ['weld', 'trim', 'int'].includes(SH.op) ? row('', check('Sisakan objek sumber', () => SH.src, v => { SH.src = v; }), SH.op !== 'trim' ? check('Sisakan objek target', () => SH.tgt, v => { SH.tgt = v; }) : null) : null,
    row('', btn(ops.find(o => o[0] === SH.op)[1], () => Op.shaping(SH.op, App.sel, { keepSrc: SH.src, keepTgt: SH.tgt }), 'pri wide'))];
}

// ---------- Effects docker ----------
function buildEffects() {
  const o = sel1();
  if (!o) return [empty('Pilih satu objek untuk mengatur efeknya')];
  const fx = () => sel1().fx || {};
  const setK = (k, p, label, f = true) => { const x = sel1(); x.fx = x.fx || {}; x.fx[k] = { ...(x.fx[k] || {}), ...p }; f ? App.commit(label) : App.render(); };
  const onoff = (k, def, label) => tog(fx()[k] ? 'check' : 'plus', fx()[k] ? 'Matikan' : 'Aktifkan', () => !!fx()[k], v => { const x = sel1(); x.fx = x.fx || {}; if (v) x.fx[k] = deep(def); else delete x.fx[k]; App.commit(label); rebuildActive(); });
  const out = [];
  const sh = fx().sh;
  out.push(section('Bayangan jatuh', 'shadow', sh ? [
    row('Offset', num({ label: 'X', get: () => fx().sh.x ?? 0, set: (v, f) => setK('sh', { x: v }, 'Bayangan', f), w: 56 }), num({ label: 'Y', get: () => fx().sh.y ?? 0, set: (v, f) => setK('sh', { y: v }, 'Bayangan', f), w: 56 })),
    row('Perhalus', num({ get: () => fx().sh.b ?? 2, set: (v, f) => setK('sh', { b: v }, 'Bayangan', f), min: 0, w: 60 })),
    row('Opasitas', slider({ get: () => Math.round((fx().sh.o ?? .5) * 100), set: (v, f) => setK('sh', { o: v / 100 }, 'Bayangan', f), min: 0, max: 100, w: 120, fmt: v => v + '%' })),
    row('Warna', colorBtn({ get: () => fx().sh.c, set: (c, f) => setK('sh', { c: c || '#000000' }, 'Bayangan', f), none: false }), sel({ options: [['flat', 'Datar'], ['persp', 'Perspektif']], get: () => fx().sh.k || 'flat', set: v => setK('sh', { k: v }, 'Jenis bayangan'), w: 100 })),
  ] : [], { extra: onoff('sh', { ...FX.sh, x: 1.5, y: 1.5 }, 'Bayangan') }));
  out.push(section('Ekstrusi', 'extrude', fx().ext ? [
    row('Kedalaman', slider({ get: () => Math.round(fx().ext.d * 100), set: (v, f) => setK('ext', { d: v / 100 }, 'Ekstrusi', f), min: 1, max: 99, w: 120 })),
    row('Titik hilang', num({ label: 'X', get: () => fx().ext.vp[0], set: (v, f) => setK('ext', { vp: [v, fx().ext.vp[1]] }, 'Ekstrusi', f), w: 56 }), num({ label: 'Y', get: () => fx().ext.vp[1], set: (v, f) => setK('ext', { vp: [fx().ext.vp[0], v] }, 'Ekstrusi', f), w: 56 })),
    row('Warna', sel({ options: [['obj', 'Isian objek'], ['solid', 'Padat'], ['shade', 'Gradasi']], get: () => fx().ext.sh, set: v => setK('ext', { sh: v }, 'Warna ekstrusi'), w: 110 }), colorBtn({ get: () => fx().ext.c1, set: (c, f) => setK('ext', { c1: c }, 'Ekstrusi', f), none: false }), colorBtn({ get: () => fx().ext.c2, set: (c, f) => setK('ext', { c2: c }, 'Ekstrusi', f), none: false })),
    row('Cahaya', num({ unit: 'deg', get: () => fx().ext.light ?? 225, set: (v, f) => setK('ext', { light: v }, 'Cahaya', f), w: 56, suffix: '°' }), check('Datar', () => fx().ext.flat, v => setK('ext', { flat: v }, 'Cahaya datar'))),
  ] : [], { open: false, extra: onoff('ext', { ...FX.ext, vp: [110, -90] }, 'Ekstrusi') }));
  out.push(section('Bayangan blok', 'block', fx().bs ? [row('Offset', num({ label: 'X', get: () => fx().bs.x ?? 3, set: (v, f) => setK('bs', { x: v }, 'Bayangan blok', f), w: 56 }), num({ label: 'Y', get: () => fx().bs.y ?? 3, set: (v, f) => setK('bs', { y: v }, 'Bayangan blok', f), w: 56 })), row('Warna', colorBtn({ get: () => fx().bs.c, set: (c, f) => setK('bs', { c: c || '#000' }, 'Bayangan blok', f), none: false }))] : [], { open: false, extra: onoff('bs', { ...FX.bs, x: 2.5, y: 2.5 }, 'Bayangan blok') }));
  out.push(section('Distorsi', 'distort', fx().dist ? [
    row('Mode', seg([['push', 'repel', 'Tarik/dorong'], ['zip', 'roughen', 'Ritsleting'], ['twist', 'twirl', 'Pusaran']], () => fx().dist.k, v => { setK('dist', { k: v }, 'Mode distorsi'); rebuildActive(); })),
    fx().dist.k !== 'twist' ? row('Amplitudo', num({ unit: 'num', get: () => fx().dist.amp, set: (v, f) => setK('dist', { amp: v }, 'Distorsi', f), w: 60 })) : row('Putaran', num({ unit: 'num', get: () => fx().dist.rot, set: (v, f) => setK('dist', { rot: v }, 'Distorsi', f), w: 60, dec: 2 })),
    fx().dist.k === 'zip' ? row('Frekuensi', num({ unit: 'int', get: () => fx().dist.freq, set: (v, f) => setK('dist', { freq: Math.round(v) }, 'Distorsi', f), w: 60, dec: 0 }), check('Halus', () => fx().dist.smooth, v => setK('dist', { smooth: v }, 'Distorsi'))) : null,
  ] : [], { open: false, extra: onoff('dist', { ...FX.dist }, 'Distorsi') }));
  out.push(section('Amplop & perspektif', 'envelope', [row('', btn('Edit amplop', () => App.setTool('envelope')), btn('Hapus', () => run('clearEnv'))), row('', btn(fx().persp ? 'Edit perspektif' : 'Tambah perspektif', () => fx().persp ? App.setTool('shape') : run('addPersp')), btn('Hapus', () => run('clearPersp')))], { open: false }));
  return out;
}
function buildContour() {
  const ct = () => sel1()?.fx?.ct || FX.ct;
  const upd = (p, f = true) => { Object.assign(FX.ct, p); if (sel1()?.fx?.ct) { Object.assign(sel1().fx.ct, p); f ? App.commit('Kontur') : App.render(); } };
  return [row('Arah', seg([['center', 'contour', 'Ke tengah'], ['in', 'zoomout', 'Ke dalam'], ['out', 'zoomin', 'Ke luar']], () => ct().dir, v => upd({ dir: v }))),
    row('Langkah', num({ unit: 'int', get: () => ct().n, set: (v, f) => upd({ n: Math.round(v) }, f), min: 1, max: 200, w: 60, dec: 0 })),
    row('Jarak', num({ get: () => ct().off, set: (v, f) => upd({ off: v }, f), min: .05, w: 70 })),
    row('Sudut', seg([['miter', 'chamfer', 'Lancip'], ['round', 'round', 'Bulat'], ['bevel', 'scallop', 'Potong']], () => ct().join, v => upd({ join: v }))),
    row('Isian akhir', colorBtn({ get: () => ct().fc, set: (c, f) => upd({ fc: c }, f) })), row('Kerangka akhir', colorBtn({ get: () => ct().oc, set: (c, f) => upd({ oc: c }, f) })),
    row('Arah warna', seg([['direct', 'arrowr', 'Langsung'], ['cw', 'rotr', 'Searah'], ['ccw', 'rotl', 'Berlawanan']], () => ct().cd || 'direct', v => upd({ cd: v }))),
    row('', btn('Terapkan', () => { App.sel.forEach(o => { o.fx = o.fx || {}; o.fx.ct = deep(FX.ct); }); App.commit('Kontur'); }, 'pri'), btn('Hapus', () => Op.clearEffect('ct')))];
}
function buildBlend() {
  const b = () => sel1()?.type === 'blend' ? sel1() : null;
  const src = () => b() || FX.blend;
  const upd = (p, f = true) => { Object.assign(FX.blend, p); if (b()) { Object.assign(b(), p); f ? App.commit('Campuran') : App.render(); } };
  return [row('Langkah', num({ unit: 'int', get: () => src().n, set: (v, f) => upd({ n: Math.round(v) }, f), min: 1, max: 999, w: 60, dec: 0 })),
    row('Rotasi', num({ unit: 'deg', get: () => src().rot || 0, set: (v, f) => upd({ rot: v }, f), w: 60, suffix: '°' })),
    row('Arah warna', seg([['direct', 'arrowr', 'Langsung'], ['cw', 'rotr', 'Searah'], ['ccw', 'rotl', 'Berlawanan']], () => src().cd || 'direct', v => upd({ cd: v }))),
    row('Akselerasi', slider({ get: () => src().oacc || 0, set: (v, f) => upd({ oacc: v, acc: v }, f), min: -100, max: 100, w: 120 })),
    row('', check('Balik urutan', () => src().loop, v => upd({ loop: v })), check('Putar mengikuti jalur', () => src().rotPath, v => upd({ rotPath: v }))),
    row('', btn('Terapkan', () => run('blend'), 'pri'), btn('Jalur…', () => { const o = b(); if (!o) return toast('Pilih objek campuran'); App.ui.pickObject('Klik jalur untuk campuran', t => { o.path = t.id; App.commit('Campuran ke jalur'); }); }), btn('Pisahkan', () => run('separate')), btn('Hapus', () => Op.clearEffect('blend'))),
    h('div', { class: 'dnote' }, 'Pilih dua objek lalu Terapkan, atau seret dengan Alat Campuran.')];
}
const LENSES = [['mag', 'Perbesar'], ['fish', 'Mata ikan'], ['bright', 'Cerahkan'], ['inv', 'Balik warna'], ['gray', 'Skala abu-abu'], ['tgray', 'Abu-abu berwarna'], ['add', 'Tambah warna'], ['limit', 'Batasi warna'], ['map', 'Peta warna khusus'], ['heat', 'Peta panas'], ['tr', 'Transparansi']];
let LS = { k: 'mag', v: 2, c: '#ff3b30', c2: '#ffd60a' };
function buildLens() {
  const o = sel1(), L = () => sel1()?.fx?.lens || LS;
  const upd = (p, f = true) => { Object.assign(LS, p); if (sel1()?.fx?.lens) { Object.assign(sel1().fx.lens, p); f ? App.commit('Lensa') : App.render(); } };
  return [h('div', { class: 'lenslist' }, ...LENSES.map(([k, n]) => { const r = h('button', { class: 'lensrow' + (L().k === k ? ' on' : ''), type: 'button' }, n); r.onclick = () => { upd({ k, v: k === 'mag' ? 2 : k === 'fish' ? .5 : .5 }); rebuildActive(); }; return r; })),
    row(L().k === 'mag' ? 'Faktor' : 'Nilai', num({ unit: 'num', get: () => L().v, set: (v, f) => upd({ v }, f), min: 0, max: L().k === 'mag' ? 20 : 1, w: 60, dec: 2, step: L().k === 'mag' ? .5 : .05 })),
    ['tgray', 'add', 'limit', 'map', 'tr'].includes(L().k) ? row('Warna', colorBtn({ get: () => L().c, set: (c, f) => upd({ c }, f), none: false }), L().k === 'map' ? colorBtn({ get: () => L().c2, set: (c, f) => upd({ c2: c }, f), none: false }) : null) : null,
    row('', btn('Terapkan', () => { if (!o) return toast('Pilih objek lensa'); App.sel.forEach(x => { x.fx = x.fx || {}; x.fx.lens = deep(LS); }); App.commit('Lensa'); }, 'pri'), btn('Hapus', () => Op.clearEffect('lens'))),
    h('div', { class: 'dnote' }, 'Lensa mengubah tampilan objek di bawahnya. Letakkan objek lensa di atas objek lain.')];
}
function buildText() {
  const o = () => App.sel.find(x => x.type === 'text');
  const src = () => o() || TextDef;
  const set = (p, f = true) => { if (o()) { App.sel.forEach(x => { if (x.type === 'text') Object.assign(x, p); }); f ? App.commit('Format teks') : App.render(); Text.place?.(); } else Object.assign(TextDef, p); if (p.font || p.wt != null || p.it != null) loadFace(src().font, src().wt, src().it); };
  const q = h('input', { class: 'tf', placeholder: 'Cari jenis huruf…' });
  const list = h('div', { class: 'fontlist' });
  const fill = () => {
    list.innerHTML = '';
    const t = q.value.toLowerCase();
    for (const f of FONTS) {
      if (t && !f.name.toLowerCase().includes(t)) continue;
      const r = h('button', { class: 'fontrow' + (src().font === f.name ? ' on' : ''), type: 'button' }, h('span', { class: 'fn', style: { fontFamily: `ad-${f.id}-n4, sans-serif` } }, f.name), h('span', { class: 'fc' }, f.cat));
      r.onclick = () => { set({ font: f.name }); fill(); };
      list.append(r);
      loadFace(f.name, 400, false);
    }
  };
  q.addEventListener('input', fill); q.addEventListener('keydown', e => e.stopPropagation());
  fill();
  return [section('Karakter', 'text', [q, list,
    row('Ukuran', num({ unit: 'num', get: () => src().sz, set: (v, f) => set({ sz: v }, f), min: 1, w: 60, suffix: 'pt' }), tog('bold', 'Tebal', () => (src().wt || 400) >= 600, v => set({ wt: v ? 700 : 400 })), tog('italic', 'Miring', () => src().it, v => set({ it: v })), tog('underline', 'Garis bawah', () => src().ul, v => set({ ul: v })), tog('strike', 'Coret', () => src().st, v => set({ st: v }))),
    row('Warna', colorBtn({ get: () => o() ? fillColor(o().fill) : '#000000', set: (c, f) => { if (o()) { App.sel.forEach(x => { if (x.type === 'text') x.fill = c ? { t: 'solid', c } : null; }); f ? App.commit('Warna teks') : App.render(); } } })),
    row('Spasi huruf', num({ unit: 'num', get: () => src().cs || 0, set: (v, f) => set({ cs: v }, f), w: 60, suffix: '%' })),
    row('Spasi kata', num({ unit: 'num', get: () => src().ws || 0, set: (v, f) => set({ ws: v }, f), w: 60, suffix: '%' })),
    row('Huruf', sel({ options: [['', 'Asli'], ['up', 'HURUF BESAR'], ['low', 'huruf kecil'], ['title', 'Huruf Judul']], get: () => src().cap || '', set: v => set({ cap: v || undefined }), w: 140 }))]),
  section('Paragraf', 'aj', [row('Perataan', seg([['l', 'al', 'Kiri'], ['c', 'ac', 'Tengah'], ['r', 'ar', 'Kanan'], ['j', 'aj', 'Rata kiri-kanan'], ['f', 'aj', 'Rata penuh']], () => src().al || 'l', v => set({ al: v }))),
    row('Spasi baris', num({ unit: 'pct', get: () => (src().ls || 1) * 100, set: (v, f) => set({ ls: v / 100 }, f), min: 30, max: 500, w: 60, suffix: '%' })),
    o()?.mode === 'para' ? row('Bingkai', num({ label: 'L', get: () => o().w, set: (v, f) => set({ w: v }, f), min: 1, w: 64 }), num({ label: 'T', get: () => o().h, set: (v, f) => set({ h: v }, f), min: 1, w: 64 })) : null,
    row('', btn(o()?.mode === 'para' ? 'Ke teks artistik' : 'Ke teks paragraf', () => run(o()?.mode === 'para' ? 'toArt' : 'toPara')))])];
}
let GL = { font: 'Arial', q: '' };
function buildGlyphs() {
  const fontSel = sel({ options: FONTS.map(f => [f.name, f.name]), get: () => GL.font, set: v => { GL.font = v; loadFace(v, 400, false).then(rebuildActive); rebuildActive(); }, w: 200 });
  const g = glyphList(GL.font, 400, false);
  if (!g) { loadFace(GL.font, 400, false).then(() => rebuildActive()); return [fontSel, h('div', { class: 'dnote' }, 'Memuat glif…')]; }
  const F = getFace(GL.font, 400, false);
  const grid = h('div', { class: 'glyphs' });
  for (const it of g.list.slice(0, 600)) {
    const subs = glyphD(F, it.g, 20);
    const b = h('button', { class: 'gl', title: `U+${it.u.toString(16).toUpperCase().padStart(4, '0')}`, html: `<svg viewBox="-2 0 ${Math.max(14, it.g.advanceWidth / F.font.unitsPerEm * 20 + 4)} 26" width="28" height="28"><path d="${pathD({ sp: subs })}" fill="currentColor"/></svg>` });
    b.onclick = () => insertChar(it.ch);
    grid.append(b);
  }
  return [fontSel, grid];
}
function insertChar(ch) {
  const ed = document.querySelector('.tedit');
  if (ed) { ed.focus(); document.execCommand('insertText', false, ch); return; }
  const o = App.sel.find(x => x.type === 'text');
  if (o) { o.s += ch; App.commit('Sisipkan glif'); return; }
  const p = App.page;
  App.add(App.mk('text', { ...TextDef, font: GL.font, s: ch, sz: 72, tf: T(p.w / 2 - 10, p.h / 2 - 10) }), 'Sisipkan glif');
}
let SR = { n: 5, dx: 10, dy: 0, rot: 0, sc: 100 };
function buildStep() {
  return [row('Salinan', num({ unit: 'int', get: () => SR.n, set: v => { SR.n = Math.max(1, Math.round(v)); }, w: 60, dec: 0 })),
    row('Geser H', num({ get: () => SR.dx, set: v => { SR.dx = v; }, w: 70 })), row('Geser V', num({ get: () => SR.dy, set: v => { SR.dy = v; }, w: 70 })),
    row('Putar', num({ unit: 'deg', get: () => SR.rot, set: v => { SR.rot = v; }, w: 60, suffix: '°' })), row('Skala', num({ unit: 'pct', get: () => SR.sc, set: v => { SR.sc = v; }, w: 60, suffix: '%' })),
    row('', btn('Terapkan', () => Op.stepRepeat(SR.n, SR.dx, SR.dy, SR.rot, SR.sc / 100), 'pri wide'))];
}

// ---------- Docker host ----------
let active = null, rkey = '';
function layout() {
  const host = $('dockers');
  const open = App.settings.dockers.filter(id => DK[id]);
  const hid = !open.length || !!App.settings.dockHidden;
  host.classList.toggle('hidden', hid);
  document.getElementById('work').classList.toggle('nodock', hid);
  host.style.width = App.settings.dockW + 'px';
  if (!open.includes(active)) active = open.includes(App.settings.dockActive) ? App.settings.dockActive : open[0];
  const tabs = $('docktabs');
  tabs.innerHTML = '';
  for (const id of App.settings.dockers) {
    if (!DK[id]) continue;
    const t = h('button', { class: 'dtabv' + (id === active && !App.settings.dockHidden ? ' on' : ''), type: 'button', title: DK[id].t }, h('span', { html: icon(DK[id].i, 16) }), h('span', { class: 'vt' }, DK[id].t));
    t.onclick = () => { if (id === active && !App.settings.dockHidden) { App.set('dockHidden', true); } else { active = id; App.set('dockActive', id); App.set('dockHidden', false); } layout(); };
    tabs.append(t);
  }
  tabs.append(h('button', { class: 'dtabv add', title: 'Tambah docker', html: icon('plus', 15), onclick: e => { const r = e.currentTarget.getBoundingClientRect(); popup(DOCKERS.map(([id, l, i]) => ({ l, i, ck: () => App.settings.dockers.includes(id), run: () => App.ui.toggleDocker(id) })), r.left - 220, r.top); } }));
  rebuildActive(true);
}
function rebuildActive(force) {
  const host = $('dockers');
  if (!active || host.classList.contains('hidden')) return;
  const d = DK[active];
  let body = host.querySelector('.dbody');
  if (!body) {
    host.innerHTML = '';
    const head = h('div', { class: 'dhead' }, h('span', { class: 'dti', html: icon(d.i, 16) }), h('span', { class: 'dtt' }, d.t), h('div', { class: 'grow' }), ib('minus', 'Ciutkan', () => { App.set('dockHidden', true); layout(); }, { size: 15 }), ib('close', 'Tutup docker', () => App.ui.toggleDocker(active), { size: 15 }));
    body = h('div', { class: 'dbody' });
    const grip = h('div', { class: 'dgrip', title: 'Seret untuk mengubah lebar' });
    grip.onpointerdown = e => { e.preventDefault(); const x0 = e.clientX, w0 = App.settings.dockW; const mv = ev => { App.settings.dockW = clamp(w0 - (ev.clientX - x0), 230, 520); host.style.width = App.settings.dockW + 'px'; V.resize(); }; const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); App.saveSettings(); }; addEventListener('pointermove', mv); addEventListener('pointerup', up); };
    host.append(grip, head, body);
  } else {
    host.querySelector('.dtt').textContent = d.t; host.querySelector('.dti').innerHTML = icon(d.i, 16);
  }
  const k = active + '|' + App.sel.map(o => o.id + o.type + (o.fill?.t || '') + (o.fill?.g || '') + (o.tr?.t || '') + Object.keys(o.fx || {}).join('') + (o.ol ? 1 : 0)).join(',') + '|' + (App.doc?.id || '') + App.doc?.pi + (active === 'objects' || active === 'history' ? App.hist?.i + ':' + App.hist?.stack.length : '');
  if (!force && k === rkey && active !== 'objects' && active !== 'history') { body.querySelectorAll('*').forEach(x => x.refresh?.()); return; }
  if (!force && k === rkey) { body.querySelectorAll('*').forEach(x => x.refresh?.()); }
  rkey = k;
  const st = body.scrollTop;
  body.innerHTML = '';
  try { body.append(...[d.build()].flat().filter(Boolean)); } catch (e) { console.error('docker', active, e); body.append(empty('Gagal memuat panel')); }
  body.scrollTop = st;
}
export function bindDockers() {
  const host = $('dockers');
  App.ui.openDocker = id => { if (!App.settings.dockers.includes(id)) App.set('dockers', [...App.settings.dockers, id]); active = id; App.set('dockActive', id); App.set('dockHidden', false); host.innerHTML = ''; layout(); V.resize(); };
  App.ui.toggleDocker = id => { const l = App.settings.dockers; if (l.includes(id)) App.set('dockers', l.filter(x => x !== id)); else { App.set('dockers', [...l, id]); active = id; App.set('dockHidden', false); } host.innerHTML = ''; layout(); V.resize(); };
  App.ui.layoutDockers = () => { host.innerHTML = ''; layout(); V.resize(); };
  App.ui.reid = o => { o.id = 'o' + Math.random().toString(36).slice(2, 10); (o.ch || []).forEach(App.ui.reid); (o.pc || []).forEach(App.ui.reid); if (o.type === 'blend') { App.ui.reid(o.a); App.ui.reid(o.b); } };
  const q = () => { cancelAnimationFrame(q._r); q._r = requestAnimationFrame(() => rebuildActive()); };
  App.on('sel', q); App.on('change', q); App.on('doc', q); App.on('page', q); App.on('fonts', () => { if (active === 'glyphs') rebuildActive(true); });
  App.on('status', () => { if (active === 'props' || active === 'transform') { cancelAnimationFrame(q._s); q._s = requestAnimationFrame(() => host.querySelectorAll('.dbody *').forEach(x => x.refresh?.())); } });
  layout();
}
export const panels = { outline: outlineSec, fill: fillSec, transp: transpSec };
export { kbd, objName, walk, mul, C, objBox };
