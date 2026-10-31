// Shared helpers: DOM, ids, numbers, colours, units, shortcuts.

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(9)) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

let _n = 0;
export const uid = (p = 'o') => p + Date.now().toString(36).slice(-5) + (_n++).toString(36) + Math.random().toString(36).slice(2, 5);
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const r3 = v => Math.round(v * 1000) / 1000;
export const r2 = v => Math.round(v * 100) / 100;
export const deg = r => r * 180 / Math.PI;
export const rad = d => d * Math.PI / 180;
export const deep = o => o == null ? o : JSON.parse(JSON.stringify(o));
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

// ---------- Colour ----------
export function hex2rgb(hx) {
  if (!hx || hx[0] !== '#') return [0, 0, 0];
  let s = hx.slice(1);
  if (s.length === 3) s = s.split('').map(c => c + c).join('');
  const n = parseInt(s.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const rgb2hex = (r, g, b) => '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
export function mixHex(a, b, t) {
  const A = hex2rgb(a), B = hex2rgb(b);
  return rgb2hex(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t));
}
export function shade(hx, f) { // f<0 darker, f>0 lighter
  return f < 0 ? mixHex(hx, '#000000', -f) : mixHex(hx, '#ffffff', f);
}
export function rgb2hsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let hh = 0;
  if (d) hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  hh = (hh * 60 + 360) % 360;
  return [hh, mx ? d / mx : 0, mx];
}
export function hsv2rgb(hh, s, v) {
  const c = v * s, x = c * (1 - Math.abs((hh / 60) % 2 - 1)), m = v - c;
  const [r, g, b] = hh < 60 ? [c, x, 0] : hh < 120 ? [x, c, 0] : hh < 180 ? [0, c, x] : hh < 240 ? [0, x, c] : hh < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
export function rgb2cmyk(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const k = 1 - Math.max(r, g, b);
  if (k >= 1) return [0, 0, 0, 100];
  return [(1 - r - k) / (1 - k), (1 - g - k) / (1 - k), (1 - b - k) / (1 - k), k].map(v => Math.round(v * 100));
}
export function cmyk2rgb(c, m, y, k) {
  c /= 100; m /= 100; y /= 100; k /= 100;
  return [255 * (1 - c) * (1 - k), 255 * (1 - m) * (1 - k), 255 * (1 - y) * (1 - k)];
}
export const cmykHex = (c, m, y, k) => rgb2hex(...cmyk2rgb(c, m, y, k));
export function lum(hx) { const [r, g, b] = hex2rgb(hx); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; }
export function normHex(s) {
  s = String(s || '').trim();
  if (/^#?[0-9a-f]{3}$/i.test(s) || /^#?[0-9a-f]{6}$/i.test(s)) {
    s = s.replace('#', '');
    if (s.length === 3) s = s.split('').map(c => c + c).join('');
    return '#' + s.toLowerCase();
  }
  return null;
}

// ---------- Units (internal unit: millimetre) ----------
export const UNITS = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, px: 25.4 / 96, m: 1000 };
export const UNIT_LABEL = { mm: 'milimeter', cm: 'sentimeter', in: 'inci', pt: 'poin', px: 'piksel', m: 'meter' };
export const PT = 25.4 / 72;
export function toU(mm, u) { return mm / UNITS[u || 'mm']; }
export function fromU(v, u) { return v * UNITS[u || 'mm']; }
export function fmtU(mm, u, dec) {
  const v = toU(mm, u);
  const d = dec ?? (u === 'in' ? 3 : u === 'px' || u === 'pt' ? 1 : u === 'cm' || u === 'm' ? 3 : 2);
  return (+v.toFixed(d)).toString();
}
// Parses "12", "12.5 cm", "10+2*3", "1in" → millimetres. Returns NaN when invalid.
export function parseLen(str, u) {
  if (typeof str === 'number') return fromU(str, u);
  let s = String(str).trim().replace(/,/g, '.');
  let unit = u;
  const m = s.match(/(mm|cm|in|pt|px|m|"|″)\s*$/i);
  if (m) { unit = m[1] === '"' || m[1] === '″' ? 'in' : m[1].toLowerCase(); s = s.slice(0, -m[0].length); }
  const v = evalNum(s);
  return isFinite(v) ? fromU(v, unit) : NaN;
}
export function evalNum(s) {
  s = String(s).trim().replace(/,/g, '.').replace(/×/g, '*').replace(/÷/g, '/');
  if (!/^[\d.+\-*/()\s%]+$/.test(s) || !s) return NaN;
  try { return Function('"use strict";return (' + s.replace(/%/g, '/100') + ')')(); } catch { return NaN; }
}

// ---------- Platform / shortcuts ----------
export const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export function kbd(s) {
  if (!s) return '';
  if (!isMac) return s.replace('Mod', 'Ctrl');
  return s.replace(/Mod\+/g, '⌘').replace(/Ctrl\+/g, '⌃').replace(/Shift\+/g, '⇧').replace(/Alt\+/g, '⌥')
    .replace('PgUp', '⇞').replace('PgDn', '⇟').replace('Delete', '⌫').replace('Enter', '↩');
}
export function keyId(e) {
  let k = e.key;
  if (k === ' ') k = 'Space';
  if (k.length === 1) k = k.toUpperCase();
  if (k === 'PageUp') k = 'PgUp';
  if (k === 'PageDown') k = 'PgDn';
  if (k === 'Backspace') k = 'Delete';
  const mod = (isMac ? e.metaKey : e.ctrlKey) ? 'Mod+' : '';
  const ctl = isMac && e.ctrlKey ? 'Ctrl+' : '';
  return ctl + mod + (e.altKey ? 'Alt+' : '') + (e.shiftKey ? 'Shift+' : '') + k;
}
export const isMod = e => isMac ? e.metaKey : e.ctrlKey;

export function download(blob, name) {
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
export function readFile(file, as = 'text') {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result); r.onerror = rej;
    as === 'url' ? r.readAsDataURL(file) : as === 'buf' ? r.readAsArrayBuffer(file) : r.readAsText(file);
  });
}
export function pickFile(accept, multiple) {
  return new Promise(res => {
    const i = h('input', { type: 'file', accept, multiple, style: 'display:none' });
    i.onchange = () => { res([...i.files]); i.remove(); };
    document.body.append(i); i.click();
  });
}
export function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = h('script', { src }); s.onload = res; s.onerror = () => rej(new Error('Gagal memuat ' + src));
    document.head.append(s);
  });
}
export const sleep = ms => new Promise(r => setTimeout(r, ms));

let toastBox;
export function toast(msg, kind = '', ms = 2600) {
  if (!toastBox) { toastBox = h('div', { class: 'toasts' }); document.body.append(toastBox); }
  const t = h('div', { class: 'toast glass ' + kind }, msg);
  toastBox.append(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, ms);
}
