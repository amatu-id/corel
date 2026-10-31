// Font registry + text layout. Every face is loaded once as a FontFace (for in-place editing)
// and parsed with opentype.js (for layout and outlines), so screen, export and "convert to curves" match.
import { loadScript, PT } from './util.js';
import { N } from './geom.js';

const OT = 'https://cdn.jsdelivr.net/npm/opentype.js@1.3.4/dist/opentype.min.js';
const FS = (id, v) => `https://cdn.jsdelivr.net/npm/@fontsource/${id}@5.1.0/files/${id}-latin-${v}.woff`;

// [display name, fontsource id, category, available variants]
const ALL = 'n4 n7 i4 i7', NB = 'n4 n7', N4 = 'n4';
const LIST = [
  ['Arial', 'arimo', 'Sans Serif', ALL], ['Helvetica', 'arimo', 'Sans Serif', ALL], ['Times New Roman', 'tinos', 'Serif', ALL],
  ['Courier New', 'cousine', 'Monospace', ALL], ['Inter', 'inter', 'Sans Serif', ALL], ['Roboto', 'roboto', 'Sans Serif', ALL],
  ['Open Sans', 'open-sans', 'Sans Serif', ALL], ['Montserrat', 'montserrat', 'Sans Serif', ALL], ['Poppins', 'poppins', 'Sans Serif', ALL],
  ['Lato', 'lato', 'Sans Serif', ALL], ['Oswald', 'oswald', 'Sans Serif', NB], ['Raleway', 'raleway', 'Sans Serif', ALL],
  ['Nunito', 'nunito', 'Sans Serif', ALL], ['Rubik', 'rubik', 'Sans Serif', ALL], ['Work Sans', 'work-sans', 'Sans Serif', ALL],
  ['Barlow', 'barlow', 'Sans Serif', ALL], ['Josefin Sans', 'josefin-sans', 'Sans Serif', ALL], ['Playfair Display', 'playfair-display', 'Serif', ALL],
  ['Merriweather', 'merriweather', 'Serif', ALL], ['Lora', 'lora', 'Serif', ALL], ['Noto Serif', 'noto-serif', 'Serif', ALL],
  ['PT Serif', 'pt-serif', 'Serif', ALL], ['Cinzel', 'cinzel', 'Serif', NB], ['Abril Fatface', 'abril-fatface', 'Display', N4],
  ['Bebas Neue', 'bebas-neue', 'Display', N4], ['Anton', 'anton', 'Display', N4], ['Archivo Black', 'archivo-black', 'Display', N4],
  ['Pacifico', 'pacifico', 'Skrip', N4], ['Dancing Script', 'dancing-script', 'Skrip', NB], ['Lobster', 'lobster', 'Skrip', N4],
  ['Great Vibes', 'great-vibes', 'Skrip', N4], ['Caveat', 'caveat', 'Skrip', NB], ['Permanent Marker', 'permanent-marker', 'Skrip', N4],
  ['Source Code Pro', 'source-code-pro', 'Monospace', ALL],
];
export const FONTS = LIST.map(([name, id, cat, v]) => ({ name, id, cat, v: v.split(' ') }));
const byName = new Map(FONTS.map(f => [f.name.toLowerCase(), f]));
export const fontInfo = name => byName.get(String(name || '').toLowerCase()) || byName.get('arial');

const faces = new Map();   // key → {font, css, p}
const listeners = new Set();
export const onFontLoad = fn => listeners.add(fn);
let otReady;
function ensureOT() { return otReady || (otReady = loadScript(OT)); }

export function variant(name, wt, it) {
  const f = fontInfo(name), want = (it ? 'i' : 'n') + (wt >= 600 ? 7 : 4);
  const pick = f.v.includes(want) ? want : f.v.includes((it ? 'i' : 'n') + 4) ? (it ? 'i' : 'n') + 4 : f.v.includes('n' + (wt >= 600 ? 7 : 4)) ? 'n' + (wt >= 600 ? 7 : 4) : 'n4';
  return { f, v: pick, key: f.id + '-' + pick, synthBold: wt >= 600 && pick[1] === '4', synthItalic: it && pick[0] === 'n' };
}
export function cssFamily(name, wt, it) { return 'ad-' + variant(name, wt, it).key; }

export function loadFace(name, wt = 400, it = false) {
  const vr = variant(name, wt, it);
  let e = faces.get(vr.key);
  if (e) return e.p;
  e = { font: null, css: 'ad-' + vr.key };
  faces.set(vr.key, e);
  const file = FS(vr.f.id, (vr.v[1] === '7' ? '700' : '400') + '-' + (vr.v[0] === 'i' ? 'italic' : 'normal'));
  e.p = (async () => {
    const [buf] = await Promise.all([fetch(file).then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }), ensureOT()]);
    e.font = window.opentype.parse(buf);
    try { const ff = new FontFace(e.css, buf); await ff.load(); document.fonts.add(ff); } catch { /* editing overlay falls back */ }
    e.glyphs = new Map();
    listeners.forEach(fn => fn(vr.key));
    return e.font;
  })().catch(err => { console.warn('font', file, err); e.failed = true; faces.delete(vr.key); });
  return e.p;
}
export function getFace(name, wt, it) {
  const vr = variant(name, wt, it), e = faces.get(vr.key);
  if (e?.font) return { font: e.font, e, vr };
  loadFace(name, wt, it);
  return null;
}
export const fontsReady = () => Promise.all([...faces.values()].map(e => e.p));
export async function ensureFonts(objs) {
  const ps = [];
  const visit = o => {
    if (o.type === 'text') ps.push(loadFace(o.font, o.wt, o.it));
    if (o.type === 'table') ps.push(loadFace(o.font || 'Arial', 400, false));
    if (o.type === 'dim') ps.push(loadFace(o.font || 'Arial', 400, false));
    (o.ch || []).forEach(visit); (o.pc || []).forEach(visit);
    if (o.a) visit(o.a); if (o.b) visit(o.b);
  };
  objs.forEach(visit);
  await Promise.all(ps);
}

// Glyph outline in font units (opentype already returns y down), cached; converted to our node format per placement.
function glyphCmds(e, g) {
  let c = e.glyphs.get(g.index);
  if (!c) { c = g.getPath(0, 0, e.font.unitsPerEm).commands; e.glyphs.set(g.index, c); }
  return c;
}
// Converts glyph commands to subpaths with transform (scale s, origin x,y; optional rotation a; synthetic italic skew)
function glyphSubs(cmds, s, x, y, rot = 0, skew = 0) {
  const c = Math.cos(rot), sn = Math.sin(rot);
  const P = (gx, gy) => { gx = gx + skew * -gy; const X = gx * s, Y = gy * s; return [x + X * c - Y * sn, y + X * sn + Y * c]; };
  const out = []; let cur = null;
  for (const k of cmds) {
    if (k.type === 'M') { cur = { c: false, n: [N(...P(k.x, k.y))] }; out.push(cur); }
    else if (k.type === 'L') cur.n.push(N(...P(k.x, k.y)));
    else if (k.type === 'C') { const l = cur.n[cur.n.length - 1], [ax, ay] = P(k.x1, k.y1), [bx, by] = P(k.x2, k.y2), [px, py] = P(k.x, k.y); l.ox = ax; l.oy = ay; cur.n.push(N(px, py, bx, by, px, py)); }
    else if (k.type === 'Q') {
      const l = cur.n[cur.n.length - 1], [qx, qy] = P(k.x1, k.y1), [px, py] = P(k.x, k.y);
      l.ox = l.x + 2 / 3 * (qx - l.x); l.oy = l.y + 2 / 3 * (qy - l.y);
      cur.n.push(N(px, py, px + 2 / 3 * (qx - px), py + 2 / 3 * (qy - py), px, py));
    } else if (k.type === 'Z' && cur) {
      cur.c = true;
      const f = cur.n[0], l = cur.n[cur.n.length - 1];
      if (cur.n.length > 1 && Math.abs(f.x - l.x) < 1e-6 && Math.abs(f.y - l.y) < 1e-6) { f.ix = l.ix; f.iy = l.iy; cur.n.pop(); }
    }
  }
  return out;
}

// ---------- Layout ----------
// Text object: {s, font, wt, it, ul, st, sz (pt), al: l|c|r|j|f, ls (line spacing ×), cs (char spacing % of em), ws (word spacing %), mode: art|para, w, h, cap}
const measureCtx = document.createElement('canvas').getContext('2d');
export function layoutText(o) {
  const F = getFace(o.font, o.wt, o.it);
  const size = (o.sz || 24) * PT;                    // em in mm
  const txt = applyCase(o.s ?? '', o.cap);
  let adv, kern, asc, desc, upm;
  if (F) {
    const f = F.font; upm = f.unitsPerEm;
    asc = f.ascender / upm; desc = -f.descender / upm;
    const cache = new Map();
    adv = ch => { let g = cache.get(ch); if (!g) { g = f.charToGlyph(ch); cache.set(ch, g); } return g.advanceWidth / upm; };
    kern = (a, b) => f.getKerningValue(f.charToGlyph(a), f.charToGlyph(b)) / upm;
  } else {
    measureCtx.font = `${o.it ? 'italic ' : ''}${o.wt || 400} 100px ${fontInfo(o.font).cat === 'Serif' ? 'Georgia, serif' : 'Arial, sans-serif'}`;
    adv = ch => measureCtx.measureText(ch).width / 100; kern = () => 0; asc = .9; desc = .22;
  }
  const cs = (o.cs || 0) / 100, ws = (o.ws || 0) / 100;
  const lineH = (asc + desc) * size * (o.ls || 1) * 1.04;
  const wordW = w => { let x = 0; for (let i = 0; i < w.length; i++) x += adv(w[i]) + cs + (i ? kern(w[i - 1], w[i]) : 0); return x * size; };
  const spW = (adv(' ') + cs + ws) * size;
  // break into lines
  const paras = txt.split('\n'), lines = [];
  const maxW = o.mode === 'para' ? Math.max(1, o.w) : Infinity;
  for (const p of paras) {
    if (maxW === Infinity) { lines.push({ t: p, end: true }); continue; }
    const words = p.split(/( +)/);
    let cur = '';
    for (const wd of words) {
      if (!wd) continue;
      const test = cur + wd;
      if (cur && /\S/.test(wd) && wordW(test.trimEnd()) > maxW) { lines.push({ t: cur.trimEnd(), end: false }); cur = wd.trimStart(); }
      else cur = test;
      while (wordW(cur) > maxW && cur.length > 1) { // hard-break very long words
        let k = cur.length - 1; while (k > 1 && wordW(cur.slice(0, k)) > maxW) k--;
        lines.push({ t: cur.slice(0, k), end: false }); cur = cur.slice(k);
      }
    }
    lines.push({ t: cur, end: true });
  }
  let W = 0;
  const L = lines.map((ln, i) => {
    const glyphs = []; let x = 0;
    for (let k = 0; k < ln.t.length; k++) {
      const ch = ln.t[k];
      if (k) x += kern(ln.t[k - 1], ch) * size;
      const a = adv(ch) * size;
      glyphs.push({ ch, x, a });
      x += a + cs * size + (ch === ' ' ? ws * size : 0);
    }
    const w = x - (ln.t.length ? cs * size : 0);
    W = Math.max(W, w);
    return { glyphs, w, y: asc * size + i * lineH, end: ln.end, t: ln.t };
  });
  const boxW = o.mode === 'para' ? o.w : W;
  for (const ln of L) {
    let off = 0, extra = 0;
    const al = o.al || 'l';
    if (al === 'c') off = (boxW - ln.w) / 2;
    else if (al === 'r') off = boxW - ln.w;
    else if ((al === 'j' && !ln.end) || al === 'f') {
      const spaces = ln.glyphs.filter(g => g.ch === ' ').length;
      if (spaces && o.mode === 'para') extra = (boxW - ln.w) / spaces;
    }
    let add = 0;
    for (const g of ln.glyphs) { g.x += off + add; if (g.ch === ' ') add += extra; }
    ln.x = off;
  }
  const H = o.mode === 'para' ? o.h : (L.length ? (L.length - 1) * lineH + (asc + desc) * size : size);
  const used = L.length ? (L.length - 1) * lineH + (asc + desc) * size : 0;
  return { lines: L, w: boxW, h: H, size, asc: asc * size, desc: desc * size, lineH, ready: !!F, F, overflow: o.mode === 'para' && used > o.h + 0.01 };
}
export function applyCase(s, cap) {
  if (cap === 'up') return s.toUpperCase();
  if (cap === 'low') return s.toLowerCase();
  if (cap === 'title') return s.replace(/\b\p{L}/gu, c => c.toUpperCase());
  return s;
}
// Text outline as a path in local coordinates (null if the font is not loaded yet).
export function textPath(o, lay = layoutText(o)) {
  if (!lay.F) return null;
  const { font } = lay.F, e = lay.F.e, vr = lay.F.vr, upm = font.unitsPerEm, s = lay.size / upm;
  const skew = vr.synthItalic ? 0.2 : 0, sp = [];
  for (const ln of lay.lines) {
    if (o.mode === 'para' && ln.y - lay.asc > o.h + 0.01) break;
    for (const g of ln.glyphs) {
      if (g.ch === ' ') continue;
      const gl = font.charToGlyph(g.ch);
      const subs = glyphSubs(glyphCmds(e, gl), s, g.x, ln.y, 0, skew);
      sp.push(...subs);
    }
    if (o.ul || o.st) {
      const th = Math.max(lay.size * 0.06, 0.05);
      const x0 = ln.glyphs[0]?.x ?? 0, x1 = ln.glyphs.length ? ln.glyphs[ln.glyphs.length - 1].x + ln.glyphs[ln.glyphs.length - 1].a : 0;
      if (x1 > x0) {
        if (o.ul) { const y = ln.y + lay.size * 0.12; sp.push({ c: true, n: [N(x0, y), N(x1, y), N(x1, y + th), N(x0, y + th)] }); }
        if (o.st) { const y = ln.y - lay.size * 0.3; sp.push({ c: true, n: [N(x0, y), N(x1, y), N(x1, y + th), N(x0, y + th)] }); }
      }
    }
  }
  return { sp, bold: vr.synthBold };
}

// Glyph placement along a polyline (fit text to path). pts in world coords. Returns world-space path.
export function textOnPath(o, pts, closed, offset = 0, side = 0) {
  const F = getFace(o.font, o.wt, o.it);
  if (!F) return null;
  const lay = layoutText({ ...o, mode: 'art', s: (o.s || '').replace(/\n/g, ' ') });
  const { font } = F, upm = font.unitsPerEm, s = lay.size / upm, sp = [];
  let L = 0; const acc = [0];
  const q = closed ? [...pts, pts[0]] : pts;
  for (let i = 1; i < q.length; i++) { L += Math.hypot(q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]); acc.push(L); }
  const at = d => {
    d = closed ? ((d % L) + L) % L : Math.max(0, Math.min(L, d));
    let i = 1; while (i < acc.length - 1 && acc[i] < d) i++;
    const seg = acc[i] - acc[i - 1] || 1, t = (d - acc[i - 1]) / seg;
    const a = q[i - 1], b = q[i];
    return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, a: Math.atan2(b[1] - a[1], b[0] - a[0]) };
  };
  const ln = lay.lines[0]; if (!ln) return { sp };
  const total = ln.w;
  let start = offset;
  if (o.al === 'c') start += (L - total) / 2; else if (o.al === 'r') start += L - total;
  const skew = F.vr.synthItalic ? 0.2 : 0;
  for (const g of ln.glyphs) {
    if (g.ch === ' ') continue;
    const mid = start + g.x + g.a / 2;
    if (!closed && (mid < 0 || mid > L)) continue;
    const p = at(mid);
    const nx = -Math.sin(p.a), ny = Math.cos(p.a), shift = side ? lay.asc * 0.72 : 0;
    const ox = p.x - Math.cos(p.a) * g.a / 2 + nx * shift, oy = p.y - Math.sin(p.a) * g.a / 2 + ny * shift;
    sp.push(...glyphSubs(glyphCmds(F.e, font.charToGlyph(g.ch)), s, ox, oy, p.a, skew));
  }
  return { sp };
}
export function glyphList(name, wt, it) {
  const F = getFace(name, wt, it);
  if (!F) return null;
  const f = F.font, out = [];
  for (let i = 0; i < f.glyphs.length; i++) {
    const g = f.glyphs.get(i);
    if (g.unicode && g.unicode > 32) out.push({ ch: String.fromCodePoint(g.unicode), u: g.unicode, g });
  }
  return { font: f, list: out.sort((a, b) => a.u - b.u), e: F.e };
}
export function glyphD(F, g, size) {
  const upm = F.font.unitsPerEm, s = size / upm, subs = glyphSubs(glyphCmds(F.e, g), s, 0, size * F.font.ascender / upm);
  return subs;
}
