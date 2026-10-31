// Overlay drawing helpers shared by the tools (all overlay output is in screen pixels).
import { V } from '../view.js';
import { App } from '../app.js';
import { pathD } from '../geom.js';
import { PS } from '../shapes.js';
import { ap } from '../geom.js';

export const S = (x, y) => V.toS(x, y);
export const sq = (x, y, cls = 'h', r = 3.5) => `<rect class="${cls}" x="${(x - r).toFixed(1)}" y="${(y - r).toFixed(1)}" width="${r * 2}" height="${r * 2}"/>`;
export const dot = (x, y, cls = 'hd', r = 3.5) => `<circle class="${cls}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}"/>`;
export const dia = (x, y, cls = 'hg', r = 4.5) => `<path class="${cls}" d="M${x} ${y - r}L${x + r} ${y}L${x} ${y + r}L${x - r} ${y}Z"/>`;
export const line = (a, b, cls = 'ln') => `<line class="${cls}" x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}"/>`;
export function wpath(p, cls = 'wp') { // world path drawn in screen space with hairline
  return `<path class="${cls}" d="${pathD(p)}" transform="matrix(${V.z} 0 0 ${V.z} ${V.tx} ${V.ty})" vector-effect="non-scaling-stroke"/>`;
}
export function wd(d, cls = 'wp') { return `<path class="${cls}" d="${d}" transform="matrix(${V.z} 0 0 ${V.z} ${V.tx} ${V.ty})" vector-effect="non-scaling-stroke"/>`; }
export function boxS(b, pad = 0) {
  const [x, y] = S(b.x, b.y);
  return { x: x - pad, y: y - pad, w: b.w * V.z + pad * 2, h: b.h * V.z + pad * 2 };
}
export function rectSVG(r, cls = 'mq') { return `<rect class="${cls}" x="${r.x.toFixed(1)}" y="${r.y.toFixed(1)}" width="${Math.max(0, r.w).toFixed(1)}" height="${Math.max(0, r.h).toFixed(1)}"/>`; }
export const near = (ev, p, tol = 6) => Math.hypot(ev.sx - p[0], ev.sy - p[1]) <= tol;
export const hint = t => App.emit('hint', t);
export function setCursor(c) { if (V.el && V.el.style.cursor !== c) V.el.style.cursor = c; }

// Constrain a vector to 15° steps (Ctrl/⌘ while drawing)
export function constrain(x0, y0, x, y, step = 15) {
  const a = Math.atan2(y - y0, x - x0), L = Math.hypot(x - x0, y - y0), s = step * Math.PI / 180, q = Math.round(a / s) * s;
  return [x0 + Math.cos(q) * L, y0 + Math.sin(q) * L];
}
// Perfect-shape glyph handles (red diamonds)
export function psHandles(o) {
  const d = PS[o.sh];
  if (!d?.hd) return [];
  const p = o.p || d.p;
  return d.hd.map((h, i) => ({ i, w: ap(o.tf, ...h.pos(o.w, o.h, p)) }));
}
export function snapped(ev, exclude) {
  if (ev.alt && ev.e?.type !== 'pointerup') { V.snapHint = null; V.snapLines = null; return [ev.x, ev.y]; }
  const r = V.snapPoint([ev.x, ev.y], { exclude });
  V.snapHint = r.hint; V.snapLines = r.lines;
  return r.p;
}
export function clearSnap() { V.snapHint = null; V.snapLines = null; }
