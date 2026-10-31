// Small UI widgets: numeric fields with units/expressions, selects, segmented toggles, colour buttons, popups.
import { h, parseLen, fmtU, evalNum, clamp, kbd } from '../util.js';
import { icon } from '../icons.js';
import { App } from '../app.js';

export const ib = (name, title, onclick, opts = {}) => {
  const b = h('button', { class: 'ib' + (opts.cls ? ' ' + opts.cls : ''), title: title + (opts.key ? ` (${kbd(opts.key)})` : ''), 'aria-label': title, type: 'button', html: icon(name, opts.size || 18) });
  b.addEventListener('click', e => { e.stopPropagation(); onclick?.(e, b); });
  if (opts.on) b.classList.add('on');
  return b;
};
export const sep = () => h('div', { class: 'sep' });
export const lbl = t => h('span', { class: 'plbl' }, t);

// Numeric field. get() → value in internal units (mm for lengths); set(v, final)
export function num({ label, icon: ic, get, set, unit = 'len', step, min = -Infinity, max = Infinity, w = 64, dec, title, suffix, units }) {
  const u = () => unit === 'len' ? (units ? units() : App.doc?.units || 'mm') : null;
  const show = v => v == null || Number.isNaN(v) ? '' : unit === 'len' ? fmtU(v, u(), dec) : unit === 'deg' ? (+v.toFixed(dec ?? 1)).toString() : (+(+v).toFixed(dec ?? 2)).toString();
  const inp = h('input', { class: 'nf', type: 'text', inputmode: 'decimal', spellcheck: 'false', style: { width: w + 'px' }, title: title || label || '' });
  const parse = s => unit === 'len' ? parseLen(s, u()) : evalNum(String(s).replace(/[°%]/g, ''));
  const commit = (final = true) => {
    const v = parse(inp.value);
    if (!isFinite(v)) { refresh(); return; }
    set(clamp(v, min, max), final);
    refresh();
  };
  inp.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') { commit(); inp.select(); }
    else if (e.key === 'Escape') { refresh(); inp.blur(); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const cur = get(); if (cur == null) return;
      const st = (step ?? (unit === 'len' ? (u() === 'in' ? 2.54 : 1) : 1)) * (e.shiftKey ? 10 : e.altKey ? .1 : 1);
      set(clamp(cur + (e.key === 'ArrowUp' ? st : -st), min, max), true); refresh(); inp.select();
    }
  });
  inp.addEventListener('change', () => commit());
  inp.addEventListener('focus', () => setTimeout(() => inp.select(), 0));
  const wrap = h('label', { class: 'numf' + (ic ? ' hasic' : '') }, ic ? h('span', { class: 'nfic', html: icon(ic, 15) }) : label ? h('span', { class: 'nfl' }, label) : null, inp, suffix ? h('span', { class: 'nfs' }, suffix) : null);
  // scrub by dragging the label
  const grip = wrap.firstChild;
  if (grip && grip !== inp) grip.addEventListener('pointerdown', e => {
    e.preventDefault(); const x0 = e.clientX, v0 = get() ?? 0, st = step ?? (unit === 'len' ? .5 : 1);
    const mv = ev => { set(clamp(v0 + Math.round((ev.clientX - x0) / 2) * st, min, max), false); refresh(); };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); set(get(), true); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  });
  const refresh = () => { if (document.activeElement !== inp) inp.value = show(get()); };
  wrap.refresh = refresh; refresh();
  return wrap;
}
export function sel({ options, get, set, w, title, cls }) {
  const s = h('select', { class: 'sf' + (cls ? ' ' + cls : ''), title: title || '', style: w ? { width: w + 'px' } : null });
  const fill = () => { s.innerHTML = ''; for (const o of (typeof options === 'function' ? options() : options)) { if (o === '-') { s.append(h('option', { disabled: true }, '──────────')); continue; } const [v, t] = Array.isArray(o) ? o : [o, o]; s.append(h('option', { value: v }, t)); } };
  fill();
  s.addEventListener('change', () => set(s.value));
  s.addEventListener('keydown', e => e.stopPropagation());
  s.refresh = () => { const v = get(); s.value = v == null ? '' : String(v); };
  s.refill = () => { fill(); s.refresh(); };
  s.refresh();
  return s;
}
// Segmented icon toggles. items: [[value, icon, title]]
export function seg(items, get, set, { multi = false } = {}) {
  const el = h('div', { class: 'segi' });
  const btns = items.map(([v, ic, t]) => { const b = ib(ic, t, () => { set(v); refresh(); }); b.dataset.v = v; el.append(b); return b; });
  const refresh = () => { const cur = get(); btns.forEach(b => b.classList.toggle('on', multi ? !!cur?.[b.dataset.v] : String(cur) === b.dataset.v)); };
  el.refresh = refresh; refresh();
  return el;
}
export function tog(ic, title, get, set, key) {
  const b = ib(ic, title, () => { set(!get()); b.refresh(); }, { key });
  b.refresh = () => b.classList.toggle('on', !!get());
  b.refresh();
  return b;
}
export function check(text, get, set) {
  const i = h('input', { type: 'checkbox' });
  i.addEventListener('change', () => set(i.checked));
  const l = h('label', { class: 'chk' }, i, h('span', {}, text));
  l.refresh = () => { i.checked = !!get(); };
  l.refresh();
  return l;
}
export function slider({ get, set, min = 0, max = 100, step = 1, w = 90, fmt = v => v, label }) {
  const r = h('input', { type: 'range', min, max, step, class: 'rng', style: { width: w + 'px' } });
  const out = h('span', { class: 'rngv' });
  r.addEventListener('input', () => { set(+r.value, false); out.textContent = fmt(+r.value); });
  r.addEventListener('change', () => set(+r.value, true));
  const el = h('label', { class: 'rngw' }, label ? h('span', { class: 'nfl' }, label) : null, r, out);
  el.refresh = () => { const v = get(); r.value = v; out.textContent = fmt(v); };
  el.refresh();
  return el;
}
export function colorBtn({ get, set, title = 'Warna', none = true, cls = '' }) {
  const b = h('button', { class: 'cbtn ' + cls, type: 'button', title });
  const sw = h('i'); b.append(sw);
  b.addEventListener('click', async e => {
    e.stopPropagation();
    const { pickColor } = await import('./colorpicker.js');
    pickColor(b, get(), (c, final) => { set(c, final); b.refresh(); }, { none });
  });
  b.refresh = () => { const c = get(); sw.style.background = c || ''; b.classList.toggle('none', !c); };
  b.refresh();
  return b;
}
export function textField({ get, set, w = 160, placeholder = '' }) {
  const i = h('input', { class: 'tf', type: 'text', style: { width: w + 'px' }, placeholder });
  i.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { set(i.value); i.blur(); } });
  i.addEventListener('change', () => set(i.value));
  i.refresh = () => { if (document.activeElement !== i) i.value = get() ?? ''; };
  i.refresh();
  return i;
}

// ---------- Popup menus ----------
let openMenus = [];
export function closeMenus(depth = 0) { while (openMenus.length > depth) openMenus.pop().remove(); document.querySelectorAll('.mbar .mi.open').forEach(x => depth === 0 && x.classList.remove('open')); }
addEventListener('pointerdown', e => { if (!e.target.closest('.menu') && !e.target.closest('.mbar .mi') && !e.target.closest('.flyout') && !e.target.closest('.dd-trigger')) closeMenus(); }, true);
addEventListener('keydown', e => { if (e.key === 'Escape' && openMenus.length) { e.stopPropagation(); closeMenus(); } }, true);
// items: [{l, k, i, run, en, ck, sub:[...]}, '-' ...]
export function popup(items, x, y, { depth = 0, minW = 220, cls = '' } = {}) {
  closeMenus(depth);
  const m = h('div', { class: 'menu glass-strong ' + cls, role: 'menu', style: { minWidth: minW + 'px' } });
  for (const it of items) {
    if (!it) continue;
    if (it === '-') { m.append(h('div', { class: 'msep' })); continue; }
    if (it.head) { m.append(h('div', { class: 'mhead' }, it.head)); continue; }
    const dis = it.en && !it.en();
    const row = h('div', { class: 'mrow' + (dis ? ' dis' : '') + (it.sub ? ' hassub' : ''), role: 'menuitem', tabindex: -1 },
      h('span', { class: 'mic', html: it.ck?.() ? icon('check', 16) : it.i ? icon(it.i, 16) : '' }),
      h('span', { class: 'mlbl' }, it.l),
      h('span', { class: 'mkey' }, it.sub ? '' : kbd(it.k || '')),
      it.sub ? h('span', { class: 'msub', html: icon('chevr', 14) }) : null);
    if (it.sw) row.querySelector('.mic').innerHTML = `<i class="msw" style="background:${it.sw}"></i>`;
    if (it.sub) {
      const open = () => { const r = row.getBoundingClientRect(); const sub = typeof it.sub === 'function' ? it.sub() : it.sub; popup(sub, r.right - 4, r.top - 6, { depth: depth + 1 }); m.querySelectorAll('.mrow.subopen').forEach(x => x.classList.remove('subopen')); row.classList.add('subopen'); };
      row.addEventListener('pointerenter', () => { clearTimeout(row._t); row._t = setTimeout(open, 120); });
      row.addEventListener('pointerleave', () => clearTimeout(row._t));
      row.addEventListener('click', open);
    } else {
      row.addEventListener('pointerenter', () => { clearTimeout(m._t); m._t = setTimeout(() => closeMenus(depth + 1), 160); });
      if (!dis) row.addEventListener('click', e => { e.stopPropagation(); closeMenus(); it.run?.(); });
    }
    m.append(row);
  }
  document.body.append(m);
  const r = m.getBoundingClientRect();
  m.style.left = Math.max(4, Math.min(x, innerWidth - r.width - 6)) + 'px';
  m.style.top = Math.max(4, Math.min(y, innerHeight - r.height - 6)) + 'px';
  if (depth && x + r.width > innerWidth - 6) m.style.left = Math.max(4, x - r.width - (openMenus[depth - 1]?.getBoundingClientRect().width || 0) + 8) + 'px';
  openMenus.push(m);
  return m;
}
// Generic popover anchored to an element
export function popover(anchor, content, { cls = '', align = 'left', onClose } = {}) {
  closeMenus();
  document.querySelectorAll('.popover').forEach(p => p._close?.());
  const p = h('div', { class: 'popover glass-strong ' + cls });
  p.append(content);
  document.body.append(p);
  const r = anchor.getBoundingClientRect(), pr = p.getBoundingClientRect();
  let x = align === 'right' ? r.right - pr.width : r.left, y = r.bottom + 6;
  if (y + pr.height > innerHeight - 6) y = Math.max(6, r.top - pr.height - 6);
  if (r.left > innerWidth - 120 && align !== 'right') x = r.left - pr.width - 6, y = Math.max(6, Math.min(r.top, innerHeight - pr.height - 6));
  p.style.left = Math.max(6, Math.min(x, innerWidth - pr.width - 6)) + 'px'; p.style.top = y + 'px';
  const close = () => { p.remove(); removeEventListener('pointerdown', out, true); onClose?.(); };
  const out = e => { if (!p.contains(e.target) && !anchor.contains(e.target)) close(); };
  setTimeout(() => addEventListener('pointerdown', out, true), 0);
  p._close = close;
  p.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
  return p;
}
export function ddButton(label, items, { icon: ic, cls = '', title } = {}) {
  const b = h('button', { class: 'dd-trigger ' + cls, type: 'button', title: title || label }, ic ? h('span', { html: icon(ic, 17) }) : null, label ? h('span', { class: 'ddl' }, label) : null, h('span', { class: 'ddc', html: icon('chevd', 12) }));
  b.addEventListener('click', e => { e.stopPropagation(); const r = b.getBoundingClientRect(); popup(typeof items === 'function' ? items() : items, r.left, r.bottom + 4); });
  return b;
}
