// Document → SVG markup. Used for the live canvas, thumbnails, SVG/PNG/PDF export and printing.
import { geom, objBox, connPts, getEpoch } from './objgeom.js';
import { pathD, polyD, msvg, det, mul, R as Rot, T, flatten, bbox, ap } from './geom.js';
import { layoutText, textPath, cssFamily, fontInfo } from './fonts.js';
import { PATTERNS, ARROWS, textureURL, gradImageURL } from './fills.js';
import { blendSteps, contourRings, extrudeFaces, blockPolys, shadowMatrix } from './effects.js';
import { offsetPolys } from './bool.js';
import { esc, PT, fmtU, mixHex } from './util.js';

const f3 = v => +(+v).toFixed(3);
export class Ctx {
  constructor(o = {}) {
    this.mode = o.mode || 'screen'; this.wire = !!o.wire; this.defs = []; this.below = []; this.n = 0;
    this.asset = o.asset || (() => ''); this.hide = o.hide || null; this.units = o.units || 'mm'; this.zoom = o.zoom || 1;
    this.pdf = this.mode === 'pdf'; this.exp = this.mode !== 'screen';
  }
  id(p) { return p + (this.n++).toString(36); }
}

// ---------- Paint ----------
function stops(st) {
  return [...st].sort((a, b) => a.o - b.o).map(s => `<stop offset="${f3(s.o)}" stop-color="${s.c}"${(s.a ?? 1) < 1 ? ` stop-opacity="${f3(s.a)}"` : ''}/>`).join('');
}
export function paint(f, o, ctx, tf = o.tf) {
  if (!f) return 'none';
  if (f.t === 'solid') return f.c + ((f.a ?? 1) < 1 ? `" fill-opacity="${f3(f.a)}` : '');
  const id = ctx.id('p' + (o.id || 'x').slice(-4));
  const T0 = tf ? ` gradientTransform="${msvg(tf)}"` : '';
  if (f.t === 'grad') {
    const p1 = f.p1 || [0, 0], p2 = f.p2 || [10, 0], sp = f.sp ? ` spreadMethod="${f.sp}"` : '';
    if (f.g === 'lin') { ctx.defs.push(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${f3(p1[0])}" y1="${f3(p1[1])}" x2="${f3(p2[0])}" y2="${f3(p2[1])}"${T0}${sp}>${stops(f.st)}</linearGradient>`); return `url(#${id})`; }
    if (f.g === 'rad') {
      const r = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) || 1, fc = f.fc || p1;
      ctx.defs.push(`<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${f3(p1[0])}" cy="${f3(p1[1])}" r="${f3(r)}" fx="${f3(fc[0])}" fy="${f3(fc[1])}"${T0}${sp}>${stops(f.st)}</radialGradient>`); return `url(#${id})`;
    }
    // conical / square → image pattern centred on p1
    const lb = o.type ? localBox(o) : { x: p1[0] - 50, y: p1[1] - 50, w: 100, h: 100 };
    const r = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) || 1;
    const Rr = Math.max(r, ...[[lb.x, lb.y], [lb.x + lb.w, lb.y], [lb.x, lb.y + lb.h], [lb.x + lb.w, lb.y + lb.h]].map(([x, y]) => Math.hypot(x - p1[0], y - p1[1]))) * 1.02;
    const ang = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]) * 180 / Math.PI;
    const url = gradImageURL({ g: f.g, st: f.st, k: Rr / r }, f.g === 'con' ? 512 : 384);
    const M = mul(tf || [1, 0, 0, 1, 0, 0], Rot(ang, p1[0], p1[1]));
    ctx.defs.push(`<pattern id="${id}" patternUnits="userSpaceOnUse" x="${f3(p1[0] - Rr)}" y="${f3(p1[1] - Rr)}" width="${f3(2 * Rr)}" height="${f3(2 * Rr)}" patternTransform="${msvg(M)}"><image href="${url}" width="${f3(2 * Rr)}" height="${f3(2 * Rr)}" preserveAspectRatio="none"/></pattern>`);
    return `url(#${id})`;
  }
  if (f.t === 'pat') {
    const P = PATTERNS[f.id] || PATTERNS.checker, s = f.s || 5, M = mul(tf || [1, 0, 0, 1, 0, 0], Rot(f.a || 0));
    ctx.defs.push(`<pattern id="${id}" patternUnits="userSpaceOnUse" width="${f3(s)}" height="${f3(s)}" patternTransform="${msvg(M)}">${f.bg ? `<rect width="${f3(s)}" height="${f3(s)}" fill="${f.bg}"/>` : ''}<path d="${P.d}" transform="scale(${f3(s / 10)})" fill="${f.fg || '#000'}"/></pattern>`);
    return `url(#${id})`;
  }
  if (f.t === 'bmp' || f.t === 'tex') {
    const url = f.t === 'tex' ? textureURL(f.id, f.c1, f.c2, f.seed || 1) : ctx.asset(f.asset);
    const w = f.s || 20, h = f.t === 'tex' ? w : (f.s || 20) * (f.ar || 1), M = mul(tf || [1, 0, 0, 1, 0, 0], Rot(f.a || 0));
    ctx.defs.push(`<pattern id="${id}" patternUnits="userSpaceOnUse" width="${f3(w)}" height="${f3(h)}" patternTransform="${msvg(M)}"><image href="${url}" width="${f3(w)}" height="${f3(h)}" preserveAspectRatio="none"/></pattern>`);
    return `url(#${id})`;
  }
  return 'none';
}
export function localBox(o) {
  const g = geom(o);
  return g.local ? bbox(g.local) : { x: 0, y: 0, w: o.w || 10, h: o.h || 10 };
}
export function strokeW(ol, o) { return ol.sc && o.tf ? ol.w * Math.sqrt(Math.abs(det(o.tf))) : ol.w; }
function strokeAttrs(ol, o, ctx, wMul = 1) {
  if (ctx.wire) return 'stroke="#000" stroke-width="1" vector-effect="non-scaling-stroke" fill="none"';
  const w = strokeW(ol, o) * wMul;
  let s = `stroke="${ol.c || '#000'}" stroke-width="${f3(w)}"`;
  if (ol.cap && ol.cap !== 'butt') s += ` stroke-linecap="${ol.cap}"`;
  if (ol.join && ol.join !== 'miter') s += ` stroke-linejoin="${ol.join}"`;
  if (ol.ml) s += ` stroke-miterlimit="${ol.ml}"`;
  if (ol.d?.length) s += ` stroke-dasharray="${ol.d.map(v => f3(Math.max(.01, v * w / wMul))).join(' ')}"`;
  if ((ol.a ?? 1) < 1) s += ` stroke-opacity="${f3(ol.a)}"`;
  return s;
}

// ---------- Arrowheads ----------
function endTangent(sub, atEnd) {
  const n = sub.n;
  if (atEnd) {
    const b = n[n.length - 1], a = n[n.length - 2];
    let dx = b.x - b.ix, dy = b.y - b.iy;
    if (Math.hypot(dx, dy) < 1e-6) { dx = b.x - a.ox; dy = b.y - a.oy; }
    if (Math.hypot(dx, dy) < 1e-6) { dx = b.x - a.x; dy = b.y - a.y; }
    return [b.x, b.y, Math.atan2(dy, dx)];
  }
  const a = n[0], b = n[1];
  let dx = a.x - a.ox, dy = a.y - a.oy;
  if (Math.hypot(dx, dy) < 1e-6) { dx = a.x - b.ix; dy = a.y - b.iy; }
  if (Math.hypot(dx, dy) < 1e-6) { dx = a.x - b.x; dy = a.y - b.y; }
  return [a.x, a.y, Math.atan2(dy, dx)];
}
function arrowsSVG(ol, o, p, ctx) {
  if (!ol || (!ol.as && !ol.ae) || ctx.wire) return '';
  const s = Math.max(strokeW(ol, o), .18) * (ol.asz || 1.2);
  let out = '';
  for (const sub of p.sp) {
    if (sub.c || sub.n.length < 2) continue;
    for (const [name, end] of [[ol.as, false], [ol.ae, true]]) {
      if (!name || !ARROWS[name]) continue;
      const [x, y, a] = endTangent(sub, end);
      out += `<path d="${ARROWS[name].d}" transform="translate(${f3(x)} ${f3(y)}) rotate(${f3(a * 180 / Math.PI)}) scale(${f3(s)})" fill="${ol.c || '#000'}"${name === 'open' || name === 'bar' ? '' : ''}/>`;
    }
  }
  return out;
}

// ---------- Fill + outline for a world path ----------
function shapeBody(o, d, p, ctx, lines) {
  const rule = o.fr || (o.type === 'text' ? 'nonzero' : 'evenodd');
  const ol = o.ol && o.ol.w > 0 ? o.ol : null;
  let fill = '', stroke = '';
  if (ctx.wire) return `<path d="${d}" ${strokeAttrs({}, o, ctx)}/>` + (lines ? `<path d="${pathD(lines)}" ${strokeAttrs({}, o, ctx)}/>` : '');
  if (o.fill) fill = `<path d="${d}" fill="${paint(o.fill, o, ctx)}" fill-rule="${rule}"/>`;
  if (ol) {
    const pos = ol.pos || 'mid';
    if (pos === 'in') {
      const cid = ctx.id('ci');
      ctx.defs.push(`<clipPath id="${cid}"><path d="${d}" clip-rule="${rule}"/></clipPath>`);
      stroke = `<path d="${d}" fill="none" ${strokeAttrs(ol, o, ctx, 2)} clip-path="url(#${cid})"/>`;
    } else if (pos === 'out') {
      const mid = ctx.id('mo'), b = bbox(p), pad = strokeW(ol, o) * 2 + 1;
      ctx.defs.push(`<mask id="${mid}" maskUnits="userSpaceOnUse" x="${f3(b.x - pad)}" y="${f3(b.y - pad)}" width="${f3(b.w + 2 * pad)}" height="${f3(b.h + 2 * pad)}"><rect x="${f3(b.x - pad)}" y="${f3(b.y - pad)}" width="${f3(b.w + 2 * pad)}" height="${f3(b.h + 2 * pad)}" fill="#fff"/><path d="${d}" fill="#000" fill-rule="${rule}"/></mask>`);
      stroke = `<path d="${d}" fill="none" ${strokeAttrs(ol, o, ctx, 2)} mask="url(#${mid})"/>`;
    } else stroke = `<path d="${d}" fill="none" ${strokeAttrs(ol, o, ctx)}/>`;
    stroke += arrowsSVG(ol, o, p, ctx);
    if (lines) stroke += `<path d="${pathD(lines)}" fill="none" ${strokeAttrs(ol, o, ctx)}/>`;
  }
  let pc = '';
  if (o.pc?.length) {
    const cid = ctx.id('pc');
    ctx.defs.push(`<clipPath id="${cid}"><path d="${d}" clip-rule="${rule}"/></clipPath>`);
    pc = `<g clip-path="url(#${cid})">${o.pc.map(c => renderObj(c, ctx)).join('')}</g>`;
  }
  return ol?.bh ? stroke + fill + pc : fill + pc + stroke;
}

// ---------- Special object kinds ----------
function textFallback(o, lay, ctx) {
  const ff = `${cssFamily(o.font, o.wt, o.it)}, ${fontInfo(o.font).cat === 'Serif' ? 'Georgia, serif' : 'Arial, sans-serif'}`;
  let s = `<g transform="${msvg(o.tf)}" font-family="${ff}" font-size="${f3(lay.size)}" font-weight="${o.wt || 400}"${o.it ? ' font-style="italic"' : ''} fill="${ctx.wire ? 'none' : paint(o.fill, o, ctx)}"${ctx.wire ? ' stroke="#000" stroke-width="1" vector-effect="non-scaling-stroke"' : ''}>`;
  for (const ln of lay.lines) s += `<text x="${f3(ln.x || 0)}" y="${f3(ln.y)}" xml:space="preserve">${esc(ln.t)}</text>`;
  return s + '</g>';
}
function imageSVG(o, ctx) {
  const url = ctx.asset(o.asset);
  let s = `<image href="${url}" x="0" y="0" width="${f3(o.w)}" height="${f3(o.h)}" preserveAspectRatio="none" transform="${msvg(o.tf)}"${o.smooth === false ? ' image-rendering="pixelated"' : ''}/>`;
  if (ctx.wire) s = `<path d="${pathD(geom(o).p)}" ${strokeAttrs({}, o, ctx)}/>`;
  const g = geom(o);
  if (o.ol && o.ol.w > 0) s += `<path d="${pathD(g.p)}" fill="none" ${strokeAttrs(o.ol, o, ctx)}/>`;
  if (o.pc?.length) {
    const cid = ctx.id('pc');
    ctx.defs.push(`<clipPath id="${cid}"><path d="${pathD(g.p)}"/></clipPath>`);
    s += `<g clip-path="url(#${cid})">${o.pc.map(c => renderObj(c, ctx)).join('')}</g>`;
  }
  return s;
}
// Text drawn as outlines through the same layout engine (for dimensions, tables)
export function labelPath(str, x, y, sz, font, al = 'l', rot = 0, wt = 400) {
  const t = { type: 'text', s: str, font, wt, it: false, sz, al: 'l', ls: 1, mode: 'art', tf: [1, 0, 0, 1, 0, 0] };
  const lay = layoutText(t), tp = textPath(t, lay);
  const dx = al === 'c' ? -lay.w / 2 : al === 'r' ? -lay.w : 0;
  const M = mul(T(x, y), mul(Rot(rot), T(dx, -lay.asc)));
  return { d: tp ? pathD({ sp: tp.sp.map(s => ({ c: s.c, n: s.n.map(n => { const [X, Y] = ap(M, n.x, n.y), [ix, iy] = ap(M, n.ix, n.iy), [ox, oy] = ap(M, n.ox, n.oy); return { x: X, y: Y, ix, iy, ox, oy }; }) })) }) : '', w: lay.w, h: lay.h, ready: !!tp, lay, M };
}
function dimSVG(o, ctx) {
  const P = o.pts || [], ol = o.ol || { w: .2, c: '#000' }, col = ol.c || '#000', sw = f3(ol.w || .2);
  if (P.length < 2) return '';
  const sz = o.sz || 8, as = o.as ?? Math.max(1.6, sz * PT * .55), font = o.font || 'Arial';
  let lines = '', heads = '', label = '', val = 0, tx = 0, ty = 0, rot = 0;
  const arrow = (x, y, a) => `<path d="M0 0L${f3(-as)} ${f3(-as * .36)}L${f3(-as)} ${f3(as * .36)}Z" transform="translate(${f3(x)} ${f3(y)}) rotate(${f3(a * 180 / Math.PI)})" fill="${col}"/>`;
  const units = o.u || ctx.units, unitLbl = o.su === false ? '' : ' ' + units;
  if (o.k === 'ang') {
    const [c, a, b] = P, r = P[3] ? Math.hypot(P[3][0] - c[0], P[3][1] - c[1]) : Math.hypot(a[0] - c[0], a[1] - c[1]) * .6;
    let a0 = Math.atan2(a[1] - c[1], a[0] - c[0]), a1 = Math.atan2(b[1] - c[1], b[0] - c[0]);
    let sw2 = a1 - a0; while (sw2 <= -Math.PI) sw2 += 2 * Math.PI; while (sw2 > Math.PI) sw2 -= 2 * Math.PI;
    val = Math.abs(sw2) * 180 / Math.PI;
    const n = 24, pts = []; for (let i = 0; i <= n; i++) { const t = a0 + sw2 * i / n; pts.push([c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)]); }
    lines += `M${f3(c[0])} ${f3(c[1])}L${f3(c[0] + (r + 2) * Math.cos(a0))} ${f3(c[1] + (r + 2) * Math.sin(a0))}M${f3(c[0])} ${f3(c[1])}L${f3(c[0] + (r + 2) * Math.cos(a1))} ${f3(c[1] + (r + 2) * Math.sin(a1))}`;
    lines += 'M' + pts.map(p => f3(p[0]) + ' ' + f3(p[1])).join('L');
    heads += arrow(pts[0][0], pts[0][1], a0 - Math.sign(sw2) * Math.PI / 2) + arrow(pts[n][0], pts[n][1], a1 + Math.sign(sw2) * Math.PI / 2);
    const am = a0 + sw2 / 2; tx = c[0] + (r + 1.2) * Math.cos(am); ty = c[1] + (r + 1.2) * Math.sin(am); rot = am * 180 / Math.PI + 90;
    if (rot > 90 && rot < 270) rot -= 180;
    label = (o.txt ?? (val.toFixed(o.dec ?? 1) + '°'));
  } else if (o.k === 'lead') {
    const pts = P;
    lines += 'M' + pts.map(p => f3(p[0]) + ' ' + f3(p[1])).join('L');
    heads += arrow(pts[0][0], pts[0][1], Math.atan2(pts[0][1] - pts[1][1], pts[0][0] - pts[1][0]));
    const e = pts[pts.length - 1], dir = pts.length > 1 && e[0] < pts[pts.length - 2][0] ? 'r' : 'l';
    const lp = labelPath(o.txt || 'Keterangan', e[0] + (dir === 'l' ? 1 : -1), e[1] + sz * PT * .35, sz, font, dir);
    return `<path d="${lines}" fill="none" stroke="${col}" stroke-width="${sw}"/>${heads}${lp.ready ? `<path d="${lp.d}" fill="${col}"/>` : `<text x="${f3(e[0] + 1)}" y="${f3(e[1])}" font-size="${f3(sz * PT)}" fill="${col}" font-family="Arial">${esc(o.txt || 'Keterangan')}</text>`}`;
  } else {
    const [p1, p2] = P, p3 = P[2] || p2;
    let d1, d2;
    if (o.k === 'h') { d1 = [p1[0], p3[1]]; d2 = [p2[0], p3[1]]; val = Math.abs(p2[0] - p1[0]); }
    else if (o.k === 'v') { d1 = [p3[0], p1[1]]; d2 = [p3[0], p2[1]]; val = Math.abs(p2[1] - p1[1]); }
    else {
      const dx = p2[0] - p1[0], dy = p2[1] - p1[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
      const off = (p3[0] - p1[0]) * nx + (p3[1] - p1[1]) * ny;
      d1 = [p1[0] + nx * off, p1[1] + ny * off]; d2 = [p2[0] + nx * off, p2[1] + ny * off]; val = L;
    }
    const ext = 1.2, gap = .8;
    const extl = (p, d) => { const vx = d[0] - p[0], vy = d[1] - p[1], L = Math.hypot(vx, vy); if (L < 1e-6) return ''; const ux = vx / L, uy = vy / L; return `M${f3(p[0] + ux * gap)} ${f3(p[1] + uy * gap)}L${f3(d[0] + ux * ext)} ${f3(d[1] + uy * ext)}`; };
    if (o.ext !== false) lines += extl(p1, d1) + extl(p2, d2);
    lines += `M${f3(d1[0])} ${f3(d1[1])}L${f3(d2[0])} ${f3(d2[1])}`;
    const a = Math.atan2(d2[1] - d1[1], d2[0] - d1[0]);
    heads += arrow(d2[0], d2[1], a) + arrow(d1[0], d1[1], a + Math.PI);
    rot = a * 180 / Math.PI; if (rot > 90.5 || rot < -89.5) rot += 180;
    const mx = (d1[0] + d2[0]) / 2, my = (d1[1] + d2[1]) / 2, ra = rot * Math.PI / 180;
    tx = mx + Math.sin(ra) * 1; ty = my - Math.cos(ra) * 1;
    label = o.txt ?? ((o.pre || '') + fmtU(val * (o.scale || 1), units, o.dec) + unitLbl + (o.suf || ''));
  }
  const lp = labelPath(label, tx, ty, sz, font, 'c', rot);
  // label baseline sits 1 mm above the line
  return `<path d="${lines}" fill="none" stroke="${col}" stroke-width="${sw}"/>${heads}` + (lp.ready ? `<path d="${lp.d}" fill="${col}"/>` : `<text x="${f3(tx)}" y="${f3(ty)}" text-anchor="middle" font-size="${f3(sz * PT)}" fill="${col}" font-family="Arial" transform="rotate(${f3(rot)} ${f3(tx)} ${f3(ty)})">${esc(label)}</text>`);
}
function connSVG(o, ctx) {
  const pts = connPts(o);
  if (o.k === 'rr' && pts.length > 2) { // rounded right-angle
    const r = o.r ?? 3;
    let d = `M${f3(pts[0][0])} ${f3(pts[0][1])}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i - 1], b = pts[i], c = pts[i + 1];
      const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, l2 = Math.hypot(c[0] - b[0], c[1] - b[1]) || 1, rr = Math.min(r, l1 / 2, l2 / 2);
      const p = [b[0] - (b[0] - a[0]) / l1 * rr, b[1] - (b[1] - a[1]) / l1 * rr], q = [b[0] + (c[0] - b[0]) / l2 * rr, b[1] + (c[1] - b[1]) / l2 * rr];
      d += `L${f3(p[0])} ${f3(p[1])}Q${f3(b[0])} ${f3(b[1])} ${f3(q[0])} ${f3(q[1])}`;
    }
    d += `L${f3(pts.at(-1)[0])} ${f3(pts.at(-1)[1])}`;
    return `<path d="${d}" fill="none" ${strokeAttrs(o.ol || { w: .3, c: '#000' }, o, ctx)}/>` + arrowsSVG(o.ol, o, { sp: [{ c: false, n: pts.map(([x, y]) => ({ x, y, ix: x, iy: y, ox: x, oy: y })) }] }, ctx);
  }
  const p = { sp: [{ c: false, n: pts.map(([x, y]) => ({ x, y, ix: x, iy: y, ox: x, oy: y })) }] };
  return `<path d="${pathD(p)}" fill="none" ${strokeAttrs(o.ol || { w: .3, c: '#000' }, o, ctx)}/>` + arrowsSVG(o.ol, o, p, ctx);
}
function tableSVG(o, ctx) {
  const cw = o.cw, rh = o.rh, ol = o.ol || { w: .2, c: '#000' };
  let s = `<g transform="${msvg(o.tf)}">`;
  if (o.bg) s += `<rect width="${f3(o.w)}" height="${f3(o.h)}" fill="${o.bg}"/>`;
  let y = 0;
  for (let r = 0; r < rh.length; r++) {
    let x = 0;
    for (let c = 0; c < cw.length; c++) {
      const cell = o.cells?.[r]?.[c] || {};
      if (cell.f) s += `<rect x="${f3(x)}" y="${f3(y)}" width="${f3(cw[c])}" height="${f3(rh[r])}" fill="${cell.f}"/>`;
      if (cell.t) {
        const sz = cell.sz || o.sz || 9, pad = 1.2, al = cell.al || o.al || 'l';
        const lx = al === 'c' ? x + cw[c] / 2 : al === 'r' ? x + cw[c] - pad : x + pad;
        const lines = String(cell.t).split('\n'), lh = sz * PT * 1.25, top = y + rh[r] / 2 - (lines.length - 1) * lh / 2 + sz * PT * .35;
        lines.forEach((ln, i) => {
          const lp = labelPath(ln, lx, top + i * lh, sz, cell.font || o.font || 'Arial', al, 0, cell.b ? 700 : 400);
          s += lp.ready ? `<path d="${lp.d}" fill="${cell.c || o.tc || '#000'}"/>` : `<text x="${f3(lx)}" y="${f3(top + i * lh)}" font-size="${f3(sz * PT)}" font-family="Arial" text-anchor="${al === 'c' ? 'middle' : al === 'r' ? 'end' : 'start'}" fill="${cell.c || o.tc || '#000'}">${esc(ln)}</text>`;
        });
      }
      x += cw[c];
    }
    y += rh[r];
  }
  if (ol.w > 0) {
    let d = `M0 0H${f3(o.w)}V${f3(o.h)}H0Z`;
    let acc = 0; for (let c = 0; c < cw.length - 1; c++) { acc += cw[c]; d += `M${f3(acc)} 0V${f3(o.h)}`; }
    acc = 0; for (let r = 0; r < rh.length - 1; r++) { acc += rh[r]; d += `M0 ${f3(acc)}H${f3(o.w)}`; }
    s += `<path d="${d}" fill="none" stroke="${ol.c}" stroke-width="${f3(ol.w)}" vector-effect="${ctx.exp ? 'none' : 'none'}"/>`;
  }
  return s + '</g>';
}
const qrCache = new Map();
function qrSVG(o, ctx) {
  const q = window.qrcode;
  let mods = qrCache.get(o.data + o.ec);
  if (!mods && q) {
    try { const qr = q(0, o.ec || 'M'); qr.addData(unescape(encodeURIComponent(o.data || ''))); qr.make(); const n = qr.getModuleCount(); mods = { n, m: [] }; for (let r = 0; r < n; r++) { mods.m.push([]); for (let c = 0; c < n; c++) mods.m[r].push(qr.isDark(r, c)); } qrCache.set(o.data + o.ec, mods); } catch { mods = null; }
  }
  if (!mods) return `<rect width="${f3(o.w)}" height="${f3(o.h)}" transform="${msvg(o.tf)}" fill="#eee" stroke="#999" stroke-width=".2"/>`;
  const qz = o.qz ?? 2, n = mods.n + qz * 2, cs = o.w / n;
  let d = '';
  for (let r = 0; r < mods.n; r++) {
    let c = 0;
    while (c < mods.n) {
      if (!mods.m[r][c]) { c++; continue; }
      let e = c; while (e < mods.n && mods.m[r][e]) e++;
      d += `M${f3((c + qz) * cs)} ${f3((r + qz) * cs)}h${f3((e - c) * cs)}v${f3(cs)}h${f3(-(e - c) * cs)}z`;
      c = e;
    }
  }
  return `<g transform="${msvg(o.tf)}">${o.bg !== null ? `<rect width="${f3(o.w)}" height="${f3(o.w)}" fill="${o.bg || '#fff'}"/>` : ''}<path d="${d}" fill="${ctx.wire ? 'none' : (o.fill?.c || '#000')}" shape-rendering="crispEdges"/></g>`;
}

// ---------- Effects wrappers ----------
function lensSVG(o, ctx, d) {
  const L = o.fx.lens, cid = ctx.id('lc'), fid = ctx.id('lf');
  ctx.defs.push(`<clipPath id="${cid}"><path d="${d}"/></clipPath>`);
  const uses = ctx.below.map(id => `<use href="#R_${id}"/>`).join('');
  const b = objBox(o) || { x: 0, y: 0, w: 1, h: 1 }, cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  let filter = '', tr = '', over = '';
  const amt = L.v ?? .5, col = L.c || '#ff0000';
  const [r, g, bl] = [1, 3, 5].map(i => parseInt(col.slice(i, i + 2), 16) / 255);
  switch (L.k) {
    case 'mag': tr = ` transform="translate(${f3(cx)} ${f3(cy)}) scale(${f3(L.v ?? 2)}) translate(${f3(-cx)} ${f3(-cy)})"`; break;
    case 'bright': filter = `<feComponentTransfer><feFuncR type="linear" slope="${f3(1 + amt)}" intercept="${f3(amt * .2)}"/><feFuncG type="linear" slope="${f3(1 + amt)}" intercept="${f3(amt * .2)}"/><feFuncB type="linear" slope="${f3(1 + amt)}" intercept="${f3(amt * .2)}"/></feComponentTransfer>`; break;
    case 'inv': filter = '<feComponentTransfer><feFuncR type="table" tableValues="1 0"/><feFuncG type="table" tableValues="1 0"/><feFuncB type="table" tableValues="1 0"/></feComponentTransfer>'; break;
    case 'gray': filter = '<feColorMatrix type="saturate" values="0"/>'; break;
    case 'tgray': filter = `<feColorMatrix type="matrix" values="${[.3 * r, .59 * r, .11 * r, 0, 0, .3 * g, .59 * g, .11 * g, 0, 0, .3 * bl, .59 * bl, .11 * bl, 0, 0, 0, 0, 0, 1, 0].map(f3).join(' ')}"/>`; break;
    case 'limit': { const k = 1 - amt; filter = `<feColorMatrix type="matrix" values="${[k + amt * r, 0, 0, 0, 0, 0, k + amt * g, 0, 0, 0, 0, 0, k + amt * bl, 0, 0, 0, 0, 0, 1, 0].map(f3).join(' ')}"/>`; break; }
    case 'add': filter = `<feComponentTransfer><feFuncR type="linear" slope="1" intercept="${f3(r * amt)}"/><feFuncG type="linear" slope="1" intercept="${f3(g * amt)}"/><feFuncB type="linear" slope="1" intercept="${f3(bl * amt)}"/></feComponentTransfer>`; break;
    case 'heat': filter = '<feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncR type="table" tableValues="0 0 .1 .9 1 1"/><feFuncG type="table" tableValues="0 .2 .9 .9 .5 1"/><feFuncB type="table" tableValues=".5 1 .2 0 0 .8"/></feComponentTransfer>'; break;
    case 'map': { const c2 = L.c2 || '#ffff00', [r2, g2, b2] = [1, 3, 5].map(i => parseInt(c2.slice(i, i + 2), 16) / 255); filter = `<feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncR type="table" tableValues="${f3(r)} ${f3(r2)}"/><feFuncG type="table" tableValues="${f3(g)} ${f3(g2)}"/><feFuncB type="table" tableValues="${f3(bl)} ${f3(b2)}"/></feComponentTransfer>`; break; }
    case 'tr': over = `<path d="${d}" fill="${col}" fill-opacity="${f3(1 - amt)}"/>`; break;
    case 'fish': tr = ` transform="translate(${f3(cx)} ${f3(cy)}) scale(${f3(1 + amt)}) translate(${f3(-cx)} ${f3(-cy)})"`; break;
  }
  if (filter) ctx.defs.push(`<filter id="${fid}" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB">${filter}</filter>`);
  const bg = L.k === 'tr' ? '' : `<path d="${d}" fill="${ctx.pageBg || '#fff'}"/>`;
  return `<g clip-path="url(#${cid})" pointer-events="none">${bg}<g${filter ? ` filter="url(#${fid})"` : ''}${tr}>${uses}</g>${over}</g>`;
}
function shadowSVG(o, ctx, bodyId) {
  const s = o.fx.sh, b = objBox(o);
  if (!b) return '';
  const M = shadowMatrix(o, b), col = s.c || '#000000', op = s.o ?? .5, blur = s.b ?? 2;
  if (ctx.pdf) { // no SVG filters in PDF: feathered rings
    const polys = flatten(geom(o).p, .1).filter(q => q.c);
    if (!polys.length) return '';
    let out = `<g transform="${msvg(M)}" fill="${col}">`;
    const steps = blur > .2 ? 6 : 1;
    for (let i = 0; i < steps; i++) {
      const off = steps > 1 ? blur * (0.5 - i / (steps - 1)) : 0, pp = off ? offsetPolys(polys, off) : polys;
      out += `<path d="${polyD(pp)}" fill-opacity="${f3(op / steps * (steps > 1 ? 1.4 : 1))}"/>`;
    }
    return out + '</g>';
  }
  const fid = ctx.id('sf');
  ctx.defs.push(`<filter id="${fid}" x="-60%" y="-60%" width="220%" height="220%" color-interpolation-filters="sRGB"><feFlood flood-color="${col}" flood-opacity="${f3(op)}"/><feComposite in2="SourceAlpha" operator="in"/>${blur > 0 ? `<feGaussianBlur stdDeviation="${f3(blur / 2)}"/>` : ''}</filter>`);
  return `<use href="#${bodyId}" transform="${msvg(M)}" filter="url(#${fid})" pointer-events="none"${s.mode ? ` style="mix-blend-mode:${s.mode}"` : ''}/>`;
}
function extrudeSVG(o, ctx) {
  const E = extrudeFaces(o), e = o.fx.ext;
  const sw = o.ol && o.ol.w > 0 ? `stroke="${o.ol.c}" stroke-width="${f3(strokeW(o.ol, o))}" stroke-linejoin="round"` : '';
  let s = '';
  for (const bk of E.backs) s += `<path d="${polyD([bk])}" fill="${E.shade(.45) || E.endColor}" ${sw}/>`;
  for (const f of E.faces) {
    let fill = E.shade(f.f);
    if (!fill) {
      const gid = ctx.id('ex');
      ctx.defs.push(`<linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="${f3(f.mid[0])}" y1="${f3(f.mid[1])}" x2="${f3(f.bmid[0])}" y2="${f3(f.bmid[1])}"><stop offset="0" stop-color="${mixHex(e.c1 || E.base, '#000', f.f * .5)}"/><stop offset="1" stop-color="${E.endColor}"/></linearGradient>`);
      fill = `url(#${gid})`;
    }
    s += `<path d="${polyD([{ c: true, pts: f.pts }])}" fill="${ctx.wire ? 'none' : fill}" ${sw || `stroke="${ctx.wire ? '#000' : fill}" stroke-width="0.04"`}${ctx.wire ? ' vector-effect="non-scaling-stroke"' : ''}/>`;
  }
  return `<g pointer-events="none">${s}</g>`;
}
function contourSVG(rings, o, ctx) {
  const sw = o.ol && o.ol.w > 0 ? strokeW(o.ol, o) : 0;
  return rings.map(r => `<path d="${polyD(r.polys)}" fill="${ctx.wire ? 'none' : r.fill || 'none'}" fill-rule="evenodd"${sw ? ` stroke="${r.oc}" stroke-width="${f3(sw)}"` : ctx.wire ? ' stroke="#000" stroke-width="1" vector-effect="non-scaling-stroke"' : ''}/>`).join('');
}

// ---------- Object ----------
export function renderObj(o, ctx) {
  if (o.hid) return '';
  let body = '', back = '', front = '';
  const fx = o.fx || {};
  if (o.type === 'g') body = o.ch.map(c => renderObj(c, ctx)).join('');
  else if (o.type === 'blend') {
    const steps = blendSteps(o);
    body = renderObj(o.a, ctx);
    for (const st of steps) {
      const fake = { id: o.id, tf: o.a.tf, fill: st.fill, ol: st.ol, type: 'curve' };
      const ol = st.ol && st.ol.w > 0;
      let one = '';
      if (ctx.wire) one = `<path d="${st.d}" ${strokeAttrs({}, fake, ctx)}/>`;
      else {
        if (st.fill) one += `<path d="${st.d}" fill="${paint(st.fill, fake, ctx)}" fill-rule="evenodd"/>`;
        if (ol) one += `<path d="${st.d}" fill="none" ${strokeAttrs(st.ol, fake, ctx)}/>`;
      }
      body += st.tr?.v ? `<g opacity="${f3(1 - st.tr.v)}">${one}</g>` : one;
    }
    body += renderObj(o.b, ctx);
    body = `<g pointer-events="visiblePainted">${body}</g>`;
  }
  else if (o.type === 'img') body = imageSVG(o, ctx);
  else if (o.type === 'dim') body = dimSVG(o, ctx);
  else if (o.type === 'conn') body = connSVG(o, ctx);
  else if (o.type === 'table') body = tableSVG(o, ctx);
  else if (o.type === 'qr') body = qrSVG(o, ctx);
  else {
    const g = geom(o);
    if (o.type === 'text' && !g.ready) body = textFallback(o, g.lay || layoutText(o), ctx);
    else {
      const d = pathD(g.p);
      if (fx.lens) body = lensSVG(o, ctx, d) + (o.ol && o.ol.w > 0 ? `<path d="${d}" fill="none" ${strokeAttrs(o.ol, o, ctx)}/>` : '');
      else body = shapeBody(o, d, g.p, ctx, g.lines);
    }
  }
  // effects drawn behind
  if (fx.ct && !ctx.wire) { const r = contourRings(o); back += contourSVG(r.back, o, ctx); front += contourSVG(r.front, o, ctx); }
  if (fx.ext) back = extrudeSVG(o, ctx) + back;
  if (fx.bs && !ctx.wire) back = `<path d="${polyD(blockPolys(o))}" fill="${fx.bs.c || '#333'}" pointer-events="none"/>` + back;
  const bodyId = 'B_' + o.id;
  if (fx.sh && !ctx.wire) back = shadowSVG(o, ctx, bodyId) + back;
  // transparency
  let attrs = '';
  const tr = o.tr;
  if (tr && !ctx.wire) {
    if (tr.t === 'uni' && tr.v) attrs += ` opacity="${f3(1 - tr.v)}"`;
    else if ((tr.t === 'lin' || tr.t === 'rad') && o.type !== 'g') {
      const b = objBox(o), mid = ctx.id('tm'), gid = ctx.id('tg'), pad = 50;
      if (b) {
        const v1 = 1 - (tr.v1 ?? 0), v2 = 1 - (tr.v2 ?? 1), g1 = Math.round(v1 * 255).toString(16).padStart(2, '0'), g2 = Math.round(v2 * 255).toString(16).padStart(2, '0');
        const p1 = tr.p1 || [0, 0], p2 = tr.p2 || [10, 0];
        const grad = tr.t === 'lin'
          ? `<linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="${f3(p1[0])}" y1="${f3(p1[1])}" x2="${f3(p2[0])}" y2="${f3(p2[1])}" gradientTransform="${msvg(o.tf || [1, 0, 0, 1, 0, 0])}"><stop offset="0" stop-color="#${g1}${g1}${g1}"/><stop offset="1" stop-color="#${g2}${g2}${g2}"/></linearGradient>`
          : `<radialGradient id="${gid}" gradientUnits="userSpaceOnUse" cx="${f3(p1[0])}" cy="${f3(p1[1])}" r="${f3(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) || 1)}" gradientTransform="${msvg(o.tf || [1, 0, 0, 1, 0, 0])}"><stop offset="0" stop-color="#${g1}${g1}${g1}"/><stop offset="1" stop-color="#${g2}${g2}${g2}"/></radialGradient>`;
        ctx.defs.push(grad + `<mask id="${mid}" maskUnits="userSpaceOnUse" x="${f3(b.x - pad)}" y="${f3(b.y - pad)}" width="${f3(b.w + 2 * pad)}" height="${f3(b.h + 2 * pad)}"><rect x="${f3(b.x - pad)}" y="${f3(b.y - pad)}" width="${f3(b.w + 2 * pad)}" height="${f3(b.h + 2 * pad)}" fill="url(#${gid})"/></mask>`);
        attrs += ` mask="url(#${mid})"`;
      }
    }
    if (tr.m && tr.m !== 'normal') attrs += ` style="mix-blend-mode:${tr.m}"`;
  }
  if (ctx.hide?.has(o.id)) attrs += ' visibility="hidden"';
  const tag = ctx.exp ? '' : ` data-oid="${o.id}"`;
  return `<g id="R_${o.id}"${tag}${attrs}>${back}<g id="${bodyId}">${body}</g>${front}</g>`;
}

// ---------- Page ----------
const cache = new WeakMap();
const VOLATILE = /"(lens|tp)"|"type":"(conn|dim)"|"path":"/;
function renderTop(o, ctx) {
  if (ctx.mode !== 'screen' || ctx.hide?.size) return renderObj(o, ctx);
  const json = JSON.stringify(o);
  if (VOLATILE.test(json)) return renderObj(o, ctx);
  const key = json + '|' + getEpoch() + '|' + ctx.wire + '|' + (ctx.assetEpoch || 0) + '|' + ctx.pageBg;
  const c = cache.get(o);
  if (c && c.key === key) { ctx.defs.push(c.defs); return c.svg; }
  const sub = new Ctx({ mode: ctx.mode, wire: ctx.wire, asset: ctx.asset, units: ctx.units });
  sub.below = ctx.below; sub.pageBg = ctx.pageBg;
  sub.id = p => p + o.id + '_' + (sub.n++).toString(36);
  const svg = renderObj(o, sub), defs = sub.defs.join('');
  ctx.defs.push(defs);
  cache.set(o, { key, svg, defs });
  return svg;
}
export function renderPage(page, opts = {}) {
  const ctx = new Ctx(opts);
  ctx.pageBg = page.bg || '#fff';
  ctx.assetEpoch = opts.assetEpoch;
  let body = '';
  for (const L of page.layers) {
    if (!L.vis && !opts.all) continue;
    if (ctx.exp && L.print === false && !opts.all) continue;
    let s = '';
    for (const o of L.objs) {
      if (opts.only && !opts.only.has(o.id)) { ctx.below.push(o.id); continue; }
      s += renderTop(o, ctx); ctx.below.push(o.id);
    }
    body += ctx.exp ? `<g>${s}</g>` : `<g data-layer="${L.id}">${s}</g>`;
  }
  return { defs: ctx.defs.join(''), body };
}
export function renderObjects(objs, opts = {}) {
  const ctx = new Ctx(opts);
  const body = objs.map(o => renderObj(o, ctx)).join('');
  return { defs: ctx.defs.join(''), body };
}
