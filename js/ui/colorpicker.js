// Colour picker popover: HSB field + hue slider, CMYK/RGB/HSB/HEX models, palettes, document colours, screen eyedropper.
import { h, hex2rgb, rgb2hex, rgb2hsv, hsv2rgb, rgb2cmyk, cmyk2rgb, normHex, clamp } from '../util.js';
import { icon } from '../icons.js';
import { popover } from './widgets.js';
import { PALETTES } from '../fills.js';
import { App } from '../app.js';

const RECENT = 'amatudraw.recentColors';
const recent = () => { try { return JSON.parse(localStorage.getItem(RECENT) || '[]'); } catch { return []; } };
const pushRecent = c => { if (!c) return; const r = [c, ...recent().filter(x => x !== c)].slice(0, 16); try { localStorage.setItem(RECENT, JSON.stringify(r)); } catch { } };

export function colorPanel(initial, onChange, { none = true, compact = false } = {}) {
  let hex = initial || '#000000', isNone = !initial;
  let [H, Sx, Vx] = rgb2hsv(...hex2rgb(hex));
  let model = localStorage.getItem('amatudraw.cmodel') || 'cmyk';
  const sv = h('canvas', { class: 'cp-sv', width: 220, height: compact ? 120 : 150 });
  const hue = h('canvas', { class: 'cp-hue', width: 220, height: 12 });
  const svK = h('i', { class: 'cp-k' }), hueK = h('i', { class: 'cp-hk' });
  const prev = h('div', { class: 'cp-prev' }, h('i', { class: 'old', style: { background: initial || 'transparent' } }), h('i', { class: 'new' }));
  const fields = h('div', { class: 'cp-fields' });
  const hexIn = h('input', { class: 'tf cp-hex', value: hex, spellcheck: 'false' });
  const emit = (final) => { isNone = false; onChange(hex, final); };
  const drawSV = () => {
    const c = sv.getContext('2d'), W = sv.width, Hh = sv.height;
    const [r, g, b] = hsv2rgb(H, 1, 1);
    c.fillStyle = rgb2hex(r, g, b); c.fillRect(0, 0, W, Hh);
    let gr = c.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, '#fff'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, W, Hh);
    gr = c.createLinearGradient(0, 0, 0, Hh); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, '#000'); c.fillStyle = gr; c.fillRect(0, 0, W, Hh);
    const hc = hue.getContext('2d'), hg = hc.createLinearGradient(0, 0, hue.width, 0);
    for (let i = 0; i <= 6; i++) hg.addColorStop(i / 6, rgb2hex(...hsv2rgb(i * 60 % 360, 1, 1)));
    hc.fillStyle = hg; hc.fillRect(0, 0, hue.width, hue.height);
    svK.style.left = Sx * 100 + '%'; svK.style.top = (1 - Vx) * 100 + '%'; hueK.style.left = H / 360 * 100 + '%';
    prev.querySelector('.new').style.background = isNone ? 'transparent' : hex;
    prev.querySelector('.new').classList.toggle('none', isNone);
    if (document.activeElement !== hexIn) hexIn.value = isNone ? '' : hex;
  };
  const fromHSV = (final) => { hex = rgb2hex(...hsv2rgb(H, Sx, Vx)); drawSV(); buildFields(); emit(final); };
  const fromHex = (hx, final) => { const n = normHex(hx); if (!n) return; hex = n; [H, Sx, Vx] = rgb2hsv(...hex2rgb(hex)); drawSV(); buildFields(); emit(final); };
  const drag = (el, fn) => el.addEventListener('pointerdown', e => {
    e.preventDefault(); el.setPointerCapture(e.pointerId);
    const mv = ev => { const r = el.getBoundingClientRect(); fn(clamp((ev.clientX - r.left) / r.width, 0, 1), clamp((ev.clientY - r.top) / r.height, 0, 1), false); };
    mv(e);
    el.onpointermove = mv;
    el.onpointerup = ev => { el.onpointermove = null; const r = el.getBoundingClientRect(); fn(clamp((ev.clientX - r.left) / r.width, 0, 1), clamp((ev.clientY - r.top) / r.height, 0, 1), true); pushRecent(hex); };
  });
  drag(sv, (x, y, f) => { Sx = x; Vx = 1 - y; fromHSV(f); });
  drag(hue, (x, y, f) => { H = x * 359.9; fromHSV(f); });
  hexIn.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { fromHex(hexIn.value, true); pushRecent(hex); } });
  hexIn.addEventListener('change', () => fromHex(hexIn.value, true));
  const mkNum = (name, val, max, on) => {
    const i = h('input', { class: 'tf', value: Math.round(val), inputmode: 'numeric' });
    i.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); i.value = clamp(+i.value + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1), 0, max); on(+i.value, true); } });
    i.addEventListener('change', () => on(clamp(+i.value || 0, 0, max), true));
    return h('label', { class: 'cp-n' }, h('span', {}, name), i);
  };
  const buildFields = () => {
    fields.innerHTML = '';
    const [r, g, b] = hex2rgb(hex);
    if (model === 'cmyk') {
      const v = rgb2cmyk(r, g, b);
      ['C', 'M', 'Y', 'K'].forEach((n, i) => fields.append(mkNum(n, v[i], 100, (x, f) => { const c = rgb2cmyk(...hex2rgb(hex)); c[i] = x; fromHex(rgb2hex(...cmyk2rgb(...c)), f); })));
    } else if (model === 'rgb') {
      ['R', 'G', 'B'].forEach((n, i) => fields.append(mkNum(n, [r, g, b][i], 255, (x, f) => { const c = hex2rgb(hex); c[i] = x; fromHex(rgb2hex(...c), f); })));
    } else {
      fields.append(mkNum('H', H, 359, (x, f) => { H = x; fromHSV(f); }), mkNum('S', Sx * 100, 100, (x, f) => { Sx = x / 100; fromHSV(f); }), mkNum('B', Vx * 100, 100, (x, f) => { Vx = x / 100; fromHSV(f); }));
    }
  };
  const tabs = h('div', { class: 'cp-tabs seg' }, ...[['cmyk', 'CMYK'], ['rgb', 'RGB'], ['hsb', 'HSB']].map(([v, t]) => {
    const b = h('button', { type: 'button', class: model === v ? 'on' : '' }, t);
    b.onclick = () => { model = v; localStorage.setItem('amatudraw.cmodel', v); tabs.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); buildFields(); };
    return b;
  }));
  const swatches = (list, cls = '') => h('div', { class: 'cp-sw ' + cls }, ...list.map(c => { const hx = c.hex || c; const s = h('button', { type: 'button', title: c.n || hx, style: { background: hx } }); s.onclick = () => { fromHex(hx, true); pushRecent(hx); }; return s; }));
  const docCols = App.doc?.palette?.length ? App.doc.palette : [];
  const pal = PALETTES[App.settings.palette] || PALETTES.cmyk;
  const tools = h('div', { class: 'cp-tools' },
    none ? h('button', { type: 'button', class: 'btn-sm', onclick: () => { isNone = true; drawSV(); onChange(null, true); } }, h('span', { html: icon('nofill', 15) }), 'Tidak ada') : null,
    window.EyeDropper ? h('button', { type: 'button', class: 'btn-sm', title: 'Ambil warna dari layar', onclick: async () => { try { const r = await new window.EyeDropper().open(); fromHex(r.sRGBHex, true); pushRecent(hex); } catch { } } }, h('span', { html: icon('eyedrop', 15) }), 'Pipet') : null,
  );
  const el = h('div', { class: 'cpicker' },
    h('div', { class: 'cp-svw' }, sv, svK), h('div', { class: 'cp-huew' }, hue, hueK),
    h('div', { class: 'cp-row' }, prev, h('label', { class: 'cp-hexw' }, h('span', {}, '#'), hexIn), tabs),
    fields, tools,
    recent().length ? h('div', { class: 'cp-lbl' }, 'Terakhir') : null, recent().length ? swatches(recent(), 'small') : null,
    docCols.length ? h('div', { class: 'cp-lbl' }, 'Palet dokumen') : null, docCols.length ? swatches(docCols, 'small') : null,
    h('div', { class: 'cp-lbl' }, pal.n), swatches(pal.cols.slice(0, compact ? 30 : 60)));
  el.set = c => { if (!c) { isNone = true; drawSV(); return; } isNone = false; hex = c; [H, Sx, Vx] = rgb2hsv(...hex2rgb(hex)); drawSV(); buildFields(); };
  requestAnimationFrame(drawSV);
  buildFields();
  return el;
}
export function pickColor(anchor, initial, onChange, opts = {}) {
  let last = initial;
  const panel = colorPanel(initial, (c, final) => { last = c; onChange(c, final); }, opts);
  popover(anchor, panel, { cls: 'cp-pop', onClose: () => { pushRecent(last); } });
}
