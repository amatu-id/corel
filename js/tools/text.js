// Text tool: artistic text (click) and paragraph frames (drag), edited in place; table cell editing.
import { App } from '../app.js';
import { V } from '../view.js';
import { mk } from '../model.js';
import { layoutText, cssFamily, loadFace, fontInfo } from '../fonts.js';
import { T, mul, ap, inv } from '../geom.js';
import { geom } from '../objgeom.js';
import { fillColor } from '../fills.js';
import { h } from '../util.js';
import { S, rectSVG, hint, setCursor, wpath } from './common.js';
import { Pick } from './pick.js';

export const TextDef = App.textDef = { font: 'Arial', wt: 400, it: false, sz: 24, al: 'l', ls: 1, cs: 0, ws: 0, ul: false };
const selOverlay = () => Pick.overlay.call({ ...Pick, drag: null, mode: 'scale', syncMode() { } });

export const Text = {
  id: 'text', name: 'Alat Teks',
  activate(opt) {
    setCursor('text');
    hint('Klik untuk teks artistik · Seret untuk bingkai teks paragraf · Esc selesai');
    if (opt?.edit) this.edit(opt.edit);
  },
  deactivate() { this.commit(); },
  down(ev) {
    if (this.ed) this.commit();
    const hit = V.hit(ev);
    if (hit?.type === 'text' && !hit.lock) { App.select(hit); this.edit(hit); return; }
    this.d = { p0: [ev.x, ev.y], p1: [ev.x, ev.y] };
  },
  move(ev) {
    if (ev.down && this.d) { this.d.p1 = [ev.x, ev.y]; App.overlay(); return; }
    const hit = !ev.down && V.hit(ev);
    setCursor(hit?.type === 'text' ? 'text' : 'crosshair');
  },
  up() {
    const d = this.d; this.d = null;
    if (!d) return;
    const w = Math.abs(d.p1[0] - d.p0[0]), hh = Math.abs(d.p1[1] - d.p0[1]);
    const o = mk('text', { ...JSON.parse(JSON.stringify(TextDef)), s: '' });
    if (w * V.z > 10 && hh * V.z > 10) { o.mode = 'para'; o.w = w; o.h = hh; o.tf = T(Math.min(d.p0[0], d.p1[0]), Math.min(d.p0[1], d.p1[1])); o.name = ''; }
    else { o.mode = 'art'; const lay = layoutText({ ...o, s: 'M' }); o.tf = T(d.p0[0], d.p0[1] - lay.asc); }
    loadFace(o.font, o.wt, o.it);
    App.ctxList.push(o); App.dirtyIndex(); App.sel = [o];
    this.isNew = true;
    this.edit(o);
    App.emit('sel');
  },
  edit(o) {
    if (this.ed) this.commit();
    loadFace(o.font, o.wt, o.it);
    App.editing = o; this.o = o;
    const lay = layoutText(o);
    this.anchor = o.al === 'c' ? lay.w / 2 : o.al === 'r' ? lay.w : 0;
    const el = h('div', { class: 'tedit' + (o.mode === 'para' ? ' para' : ''), spellcheck: 'false' });
    try { el.contentEditable = 'plaintext-only'; } catch { el.contentEditable = 'true'; }
    if (el.contentEditable !== 'plaintext-only') el.contentEditable = 'true';
    el.textContent = o.s;
    el.addEventListener('input', () => { o.s = el.innerText.replace(/\n$/, ''); App.overlay(); App.emit('textinput'); });
    el.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); const t = this.o; this.commit(); App.setTool('pick'); if (t && App.find(t.id)) App.select(t); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); this.commit(); }
    });
    el.addEventListener('pointerdown', e => e.stopPropagation());
    el.addEventListener('paste', e => { e.preventDefault(); const t = e.clipboardData.getData('text/plain'); document.execCommand('insertText', false, t); });
    document.getElementById('textedit').append(el);
    this.ed = el;
    this.place();
    App.render();
    setTimeout(() => { el.focus(); const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); if (!this.isNew) { r.selectNodeContents(el); s.removeAllRanges(); s.addRange(r); } }, 0);
    if (!this._vh) { this._vh = true; App.on('view', () => this.ed && this.place()); App.on('change', () => this.ed && this.place()); App.on('fonts', () => this.ed && this.place()); }
  },
  place() {
    const o = this.o, el = this.ed; if (!o || !el) return;
    const lay = layoutText(o), z = V.z, m = o.tf;
    const col = o.fill ? fillColor(o.fill) : 'transparent';
    Object.assign(el.style, {
      fontFamily: `${cssFamily(o.font, o.wt, o.it)}, ${fontInfo(o.font).cat === 'Serif' ? 'Georgia, serif' : 'Arial, sans-serif'}`,
      fontSize: lay.size * z + 'px', lineHeight: lay.lineH * z + 'px', fontWeight: o.wt || 400, fontStyle: o.it ? 'italic' : 'normal',
      letterSpacing: (o.cs || 0) / 100 * lay.size * z + 'px', wordSpacing: (o.ws || 0) / 100 * lay.size * z + 'px',
      textDecoration: [o.ul && 'underline', o.st && 'line-through'].filter(Boolean).join(' ') || 'none',
      textAlign: { l: 'left', c: 'center', r: 'right', j: 'justify', f: 'justify' }[o.al || 'l'],
      textTransform: { up: 'uppercase', low: 'lowercase', title: 'capitalize' }[o.cap] || 'none',
      color: col, caretColor: 'var(--accent)',
      width: o.mode === 'para' ? o.w * z + 'px' : 'auto', minHeight: o.mode === 'para' ? o.h * z + 'px' : lay.lineH * z + 'px',
      marginTop: -(lay.lineH - (lay.asc + lay.desc)) / 2 * z + 'px',
    });
    const [tx, ty] = [m[4] * z + V.tx, m[5] * z + V.ty];
    const shift = o.mode === 'para' ? '' : o.al === 'c' ? ` translateX(${this.anchor * z}px) translateX(-50%)` : o.al === 'r' ? ` translateX(${this.anchor * z}px) translateX(-100%)` : '';
    el.style.transform = `matrix(${m[0]},${m[1]},${m[2]},${m[3]},${tx},${ty})${shift}`;
  },
  commit() {
    const o = this.o, el = this.ed;
    if (!el) return;
    this.ed = null; this.o = null; App.editing = null;
    o.s = el.innerText.replace(/\n$/, '');
    el.remove();
    if (!App.find(o.id)) { App.render(); return; }
    if (!o.s.trim() && o.mode !== 'para') { App.remove([o]); App.render(); App.emit('sel'); if (!this.isNew) App.commit('Hapus teks'); this.isNew = false; return; }
    if (o.mode !== 'para' && o.al && o.al !== 'l') {
      const lay = layoutText(o), now = o.al === 'c' ? lay.w / 2 : lay.w;
      o.tf = mul(o.tf, T(this.anchor - now, 0));
    }
    App.commit(this.isNew ? 'Buat teks' : 'Edit teks');
    this.isNew = false;
  },
  key(e) { if (e.key === 'Escape') { App.setTool('pick'); return true; } },
  overlay() {
    let s = this.ed ? '' : selOverlay();
    if (this.d) { const a = S(...this.d.p0), b = S(...this.d.p1); s += rectSVG({ x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1]) }, 'mq'); }
    if (this.o && this.o.mode === 'para') { const g = geom({ ...this.o, type: 'rect', w: this.o.w, h: this.o.h, r: [0, 0, 0, 0], s: undefined }); s += wpath(g.p, 'frame'); }
    return s;
  },
};

// ---------- Table cell editing ----------
export function editTable(o, ev) {
  const [lx, ly] = ap(inv(o.tf), ev.x, ev.y);
  let c = 0, x = 0; while (c < o.cw.length - 1 && x + o.cw[c] < lx) x += o.cw[c++];
  let r = 0, y = 0; while (r < o.rh.length - 1 && y + o.rh[r] < ly) y += o.rh[r++];
  const cell = (o.cells[r] ||= [])[c] ||= { t: '' };
  const z = V.z, m = o.tf;
  const ta = h('textarea', { class: 'celledit', spellcheck: 'false' });
  ta.value = cell.t || '';
  const [tx, ty] = ap(m, x, y).map((v, i) => v * z + (i ? V.ty : V.tx));
  Object.assign(ta.style, { width: o.cw[c] * z + 'px', height: o.rh[r] * z + 'px', fontSize: (cell.sz || o.sz || 9) * 25.4 / 72 * z + 'px', transform: `matrix(${m[0]},${m[1]},${m[2]},${m[3]},${tx},${ty})`, textAlign: { l: 'left', c: 'center', r: 'right' }[cell.al || o.al || 'l'] });
  const done = save => { if (!ta.isConnected) return; if (save) { cell.t = ta.value; App.commit('Edit sel tabel'); } ta.remove(); };
  ta.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Escape') done(false);
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); done(true); }
    if (e.key === 'Tab') { e.preventDefault(); done(true); const nc = (c + 1) % o.cw.length, nr = nc === 0 ? (r + 1) % o.rh.length : r; let xx = 0; for (let i = 0; i < nc; i++) xx += o.cw[i]; let yy = 0; for (let i = 0; i < nr; i++) yy += o.rh[i]; const [wx, wy] = ap(o.tf, xx + o.cw[nc] / 2, yy + o.rh[nr] / 2); editTable(o, { x: wx, y: wy }); }
  });
  ta.addEventListener('blur', () => done(true));
  ta.addEventListener('pointerdown', e => e.stopPropagation());
  document.getElementById('textedit').append(ta);
  setTimeout(() => { ta.focus(); ta.select(); }, 0);
  App.tableCell = { o, r, c };
}
App.ui.editTable = editTable;
