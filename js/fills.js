// Colour palettes, fountain presets, two-colour patterns, procedural textures and arrowheads.
import { cmykHex, hex2rgb, rgb2hex, lerp } from './util.js';

// Default CMYK process palette (name, C, M, Y, K)
const CMYK = [
  ['Hitam', 0, 0, 0, 100], ['90% Hitam', 0, 0, 0, 90], ['80% Hitam', 0, 0, 0, 80], ['70% Hitam', 0, 0, 0, 70], ['60% Hitam', 0, 0, 0, 60],
  ['50% Hitam', 0, 0, 0, 50], ['40% Hitam', 0, 0, 0, 40], ['30% Hitam', 0, 0, 0, 30], ['20% Hitam', 0, 0, 0, 20], ['10% Hitam', 0, 0, 0, 10], ['Putih', 0, 0, 0, 0],
  ['Biru', 100, 100, 0, 0], ['Sian', 100, 0, 0, 0], ['Hijau', 100, 0, 100, 0], ['Kuning', 0, 0, 100, 0], ['Merah', 0, 100, 100, 0], ['Magenta', 0, 100, 0, 0],
  ['Ungu Tua', 20, 80, 0, 20], ['Biru Langit', 60, 0, 0, 20], ['Hijau Muda', 60, 0, 60, 20], ['Kuning Pucat', 0, 0, 60, 20], ['Merah Bata', 0, 60, 60, 40],
  ['Oranye', 0, 60, 100, 0], ['Oranye Tua', 0, 40, 80, 0], ['Emas', 0, 20, 100, 0], ['Lemon', 0, 0, 40, 0], ['Krem', 0, 5, 20, 0],
  ['Hijau Lumut', 40, 0, 100, 0], ['Hijau Daun', 60, 0, 100, 20], ['Hijau Tua', 100, 0, 100, 60], ['Teal', 100, 0, 40, 20], ['Tosca', 60, 0, 20, 0],
  ['Biru Muda', 40, 0, 0, 0], ['Biru Baja', 60, 20, 0, 20], ['Biru Laut', 100, 60, 0, 20], ['Biru Tua', 100, 100, 0, 40], ['Nila', 80, 100, 0, 0],
  ['Lavender', 20, 40, 0, 0], ['Anggur', 40, 100, 0, 20], ['Ungu', 60, 80, 0, 0], ['Merah Muda', 0, 40, 0, 0], ['Fuchsia', 0, 100, 20, 0],
  ['Merah Tua', 0, 100, 100, 40], ['Merah Anggur', 0, 100, 60, 40], ['Salem', 0, 40, 40, 0], ['Persik', 0, 20, 40, 0], ['Cokelat Muda', 0, 40, 60, 20],
  ['Cokelat', 0, 60, 100, 40], ['Cokelat Tua', 0, 40, 60, 80], ['Zaitun', 0, 0, 100, 60], ['Khaki', 0, 10, 40, 20], ['Pasir', 0, 10, 30, 10],
  ['Abu Hangat', 0, 10, 20, 40], ['Abu Dingin', 20, 10, 0, 40], ['Batu Tulis', 40, 20, 0, 60], ['Perak', 0, 0, 0, 25], ['Arang', 20, 10, 0, 80],
];
export const PALETTE = CMYK.map(([n, c, m, y, k]) => ({ n, hex: cmykHex(c, m, y, k), cmyk: [c, m, y, k] }));

export const PALETTES = {
  cmyk: { n: 'Palet Default CMYK', cols: PALETTE },
  rgb: {
    n: 'Palet Default RGB', cols: ['#000000', '#333333', '#666666', '#999999', '#cccccc', '#ffffff', '#ff0000', '#ff8000', '#ffff00', '#80ff00', '#00ff00', '#00ff80', '#00ffff', '#0080ff', '#0000ff', '#8000ff', '#ff00ff', '#ff0080',
      '#800000', '#804000', '#808000', '#408000', '#008000', '#008040', '#008080', '#004080', '#000080', '#400080', '#800080', '#800040'].map(hex => ({ n: hex, hex }))
  },
  modern: {
    n: 'Palet Modern', cols: ['#0f172a', '#1e293b', '#334155', '#64748b', '#cbd5e1', '#f1f5f9', '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e',
      '#7f1d1d', '#7c2d12', '#78350f', '#14532d', '#134e4a', '#1e3a8a', '#4c1d95', '#831843'].map(hex => ({ n: hex, hex }))
  },
  pastel: {
    n: 'Palet Pastel', cols: ['#fde2e4', '#fad2e1', '#e2ece9', '#bee1e6', '#f0efeb', '#dfe7fd', '#cddafd', '#fff1e6', '#ffd7ba', '#fec89a', '#d8e2dc', '#ece4db', '#ffe5d9', '#cdb4db', '#ffc8dd', '#ffafcc', '#bde0fe', '#a2d2ff', '#caffbf', '#fdffb6', '#ffd6a5', '#ffadad', '#9bf6ff', '#a0c4ff', '#bdb2ff', '#ffc6ff']
      .map(hex => ({ n: hex, hex }))
  },
  indo: {
    n: 'Palet Nusantara', cols: [['Merah Putih', '#ce1126'], ['Batik Sogan', '#7b4a24'], ['Kunyit', '#e8a317'], ['Pandan', '#4c8c2b'], ['Laut Banda', '#0b5d8c'], ['Kopi Toraja', '#3e2723'], ['Jati', '#a0522d'], ['Melati', '#fbf7ee'],
    ['Tenun Ikat', '#8e2443'], ['Songket Emas', '#c9a227'], ['Gerabah', '#b5651d'], ['Padi', '#d9c36a'], ['Bambu', '#9cad6b'], ['Lumut Gunung', '#566b30'], ['Kerak Telor', '#d98f3d'], ['Indigo Tarum', '#2e3a87']].map(([n, hex]) => ({ n, hex }))
  },
};

export const GRAD_PRESETS = [
  ['Senja', 'lin', [['#ff7e5f', 0], ['#feb47b', 1]]], ['Samudra', 'lin', [['#2193b0', 0], ['#6dd5ed', 1]]], ['Aurora', 'lin', [['#00c9a7', 0], ['#845ec2', 1]]],
  ['Emas', 'lin', [['#8a6a1f', 0], ['#f6e27a', .45], ['#b88a2a', .7], ['#f9e9a8', 1]]], ['Perak', 'lin', [['#6d6d6d', 0], ['#f2f2f2', .5], ['#8a8a8a', 1]]],
  ['Pelangi', 'lin', [['#ff0000', 0], ['#ffa500', .17], ['#ffff00', .33], ['#008000', .5], ['#0000ff', .67], ['#4b0082', .83], ['#ee82ee', 1]]],
  ['Api', 'rad', [['#fff3b0', 0], ['#ff9a00', .45], ['#c1121f', 1]]], ['Bola', 'rad', [['#ffffff', 0], ['#7ab8ff', .35], ['#0b3d91', 1]]],
  ['Malam', 'lin', [['#0f2027', 0], ['#203a43', .5], ['#2c5364', 1]]], ['Mint', 'lin', [['#d4fc79', 0], ['#96e6a1', 1]]], ['Tembaga', 'con', [['#b87333', 0], ['#f4c49b', .25], ['#8a4b1f', .5], ['#f4c49b', .75], ['#b87333', 1]]],
  ['Krom', 'lin', [['#e6e6e6', 0], ['#7a7a7a', .48], ['#2b2b2b', .5], ['#bdbdbd', 1]]], ['Neon', 'lin', [['#f72585', 0], ['#7209b7', .5], ['#4cc9f0', 1]]], ['Kayu', 'lin', [['#c69c6d', 0], ['#8b5a2b', 1]]],
].map(([n, g, st]) => ({ n, g, st: st.map(([c, o]) => ({ c, o, a: 1 })) }));

// Two-colour patterns: tile size 10 units, drawn in fg over bg
export const PATTERNS = {
  checker: { n: 'Papan catur', d: 'M0 0h5v5H0zM5 5h5v5H5z' },
  dots: { n: 'Titik', d: 'M5 2.5a2.5 2.5 0 1 0 .01 0z' },
  dotsS: { n: 'Titik kecil', d: 'M2.5 1.5a1 1 0 1 0 .01 0zM7.5 6.5a1 1 0 1 0 .01 0z' },
  hlines: { n: 'Garis horizontal', d: 'M0 0h10v2.5H0z' },
  vlines: { n: 'Garis vertikal', d: 'M0 0h2.5v10H0z' },
  diag: { n: 'Diagonal', d: 'M0 8.6L8.6 0H10v1.4L1.4 10H0zM8.6 10L10 8.6V10z' },
  diag2: { n: 'Diagonal balik', d: 'M1.4 0L10 8.6V10H8.6L0 1.4V0zM0 8.6L1.4 10H0z' },
  cross: { n: 'Silang', d: 'M4 0h2v4h4v2H6v4H4V6H0V4h4z' },
  hatch: { n: 'Arsir silang', d: 'M0 8.8L8.8 0H10v1.2L1.2 10H0zM1.2 0L10 8.8V10H8.8L0 1.2V0z' },
  grid: { n: 'Kisi', d: 'M0 0h10v1H1v9H0z' },
  brick: { n: 'Bata', d: 'M0 0h10v.8H0zM0 4.6h10v.8H0zM4.6 .8h.8v3.8h-.8zM0 5.4h.8V10H0zM9.2 5.4h.8V10h-.8z' },
  zigzag: { n: 'Zigzag', d: 'M0 6l2.5-3 2.5 3 2.5-3L10 6v2L7.5 5 5 8 2.5 5 0 8z' },
  waves: { n: 'Gelombang', d: 'M0 5c2.5-3 2.5 3 5 0s2.5 3 5 0v1.6c-2.5 3-2.5-3-5 0s-2.5-3-5 0z' },
  diamond: { n: 'Wajik', d: 'M5 0l5 5-5 5-5-5zM5 2L2 5l3 3 3-3z' },
  scales: { n: 'Sisik', d: 'M0 10a5 5 0 0 1 10 0h-1a4 4 0 0 0-8 0zM-5 5a5 5 0 0 1 10 0h-1a4 4 0 0 0-8 0zM5 5a5 5 0 0 1 10 0h-1a4 4 0 0 0-8 0z' },
  hex: { n: 'Sarang lebah', d: 'M2.5 0h5L10 4.33 7.5 8.66h-5L0 4.33zM3.1 1L1.2 4.33 3.1 7.66h3.8L8.8 4.33 6.9 1z' },
  plus: { n: 'Tambah', d: 'M4.25 2h1.5v2.25H8v1.5H5.75V8h-1.5V5.75H2v-1.5h2.25z' },
  star: { n: 'Bintang', d: 'M5 1l1.18 2.6 2.82.32-2.1 1.9.58 2.78L5 7.2 2.52 8.6l.58-2.78L1 3.92l2.82-.32z' },
  triangle: { n: 'Segitiga', d: 'M5 1.5l4 7H1z' },
  kawung: { n: 'Kawung (batik)', d: 'M5 5C3 3 3 0 5 0s2 3 0 5zM5 5c2 2 2 5 0 5s-2-3 0-5zM5 5c2-2 5-2 5 0s-3 2-5 0zM5 5c-2 2-5 2-5 0s3-2 5 0z' },
  parang: { n: 'Parang (batik)', d: 'M0 10L10 0v2.2L2.2 10zM6 10c0-2 2-4 4-4v1.6c-1.4 0-2.4 1-2.4 2.4zM0 4c2 0 4-2 4-4H2.4C2.4 1.4 1.4 2.4 0 2.4z' },
};
export const TEXTURES = {
  clouds: { n: 'Awan', c1: '#4a90d9', c2: '#ffffff', oct: 5, sc: 3 },
  marble: { n: 'Marmer', c1: '#f4f1ea', c2: '#5d5a54', oct: 5, sc: 2, f: 'marble' },
  wood: { n: 'Kayu', c1: '#c08a52', c2: '#6b3e1d', oct: 3, sc: 2, f: 'wood' },
  canvas: { n: 'Kanvas', c1: '#efe6d2', c2: '#b9a988', oct: 2, sc: 24, f: 'weave' },
  sand: { n: 'Pasir', c1: '#e8d3a6', c2: '#a88a55', oct: 2, sc: 40 },
  granite: { n: 'Granit', c1: '#8d8d8d', c2: '#2a2a2a', oct: 4, sc: 18, f: 'speck' },
  water: { n: 'Air', c1: '#0b6fa4', c2: '#a9e4ff', oct: 4, sc: 4, f: 'ripple' },
  paper: { n: 'Kertas daur ulang', c1: '#f3efe4', c2: '#cfc6b0', oct: 4, sc: 12, f: 'speck' },
  rust: { n: 'Karat', c1: '#9c4a1a', c2: '#3b1d0c', oct: 5, sc: 6 },
  leather: { n: 'Kulit', c1: '#7a4a2b', c2: '#3c2414', oct: 3, sc: 14, f: 'cell' },
};

// Value noise
function noise2(seed) {
  const P = new Uint8Array(512); let s = seed * 9301 + 49297;
  const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const p = [...Array(256).keys()].sort(() => rnd() - .5);
  for (let i = 0; i < 512; i++) P[i] = p[i & 255];
  const fade = t => t * t * (3 - 2 * t), gr = (i, j) => P[(P[i & 255] + j) & 255] / 255;
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = fade(xf), v = fade(yf);
    return lerp(lerp(gr(xi, yi), gr(xi + 1, yi), u), lerp(gr(xi, yi + 1), gr(xi + 1, yi + 1), u), v);
  };
}
const texCache = new Map();
export function textureURL(id, c1, c2, seed = 1, size = 256) {
  const k = [id, c1, c2, seed, size].join();
  if (texCache.has(k)) return texCache.get(k);
  const T = TEXTURES[id] || TEXTURES.clouds, cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d'), im = ctx.createImageData(size, size), n = noise2(seed);
  const A = hex2rgb(c1 || T.c1), B = hex2rgb(c2 || T.c2);
  // tileable fBm via torus wrap blend
  const fbm = (x, y) => { let v = 0, a = .5, f = 1; for (let o = 0; o < T.oct; o++) { v += a * n(x * f, y * f); a /= 2; f *= 2; } return v; };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, w = y / size, sc = T.sc;
    const v1 = fbm(u * sc, w * sc), v2 = fbm((u - 1) * sc, w * sc), v3 = fbm(u * sc, (w - 1) * sc), v4 = fbm((u - 1) * sc, (w - 1) * sc);
    let v = (v1 * (1 - u) + v2 * u) * (1 - w) + (v3 * (1 - u) + v4 * u) * w;
    if (T.f === 'marble') v = .5 + .5 * Math.sin((u * 6 + v * 7) * Math.PI);
    else if (T.f === 'wood') { const r = v * 14; v = r - Math.floor(r); v = Math.pow(v, .6); }
    else if (T.f === 'weave') v = .55 * v + .45 * ((Math.sin(u * size / 3) * Math.sin(w * size / 3)) > 0 ? .8 : .2);
    else if (T.f === 'speck') v = v > .62 ? 1 : v < .35 ? 0 : v * .6;
    else if (T.f === 'ripple') v = .5 + .5 * Math.sin(v * 18);
    else if (T.f === 'cell') v = Math.pow(Math.abs(Math.sin(v * 22)), .35);
    const i = (y * size + x) * 4;
    im.data[i] = lerp(A[0], B[0], v); im.data[i + 1] = lerp(A[1], B[1], v); im.data[i + 2] = lerp(A[2], B[2], v); im.data[i + 3] = 255;
  }
  ctx.putImageData(im, 0, 0);
  const url = cv.toDataURL('image/png');
  texCache.set(k, url);
  return url;
}

// Conical / square fountain fills rendered as images (SVG has no native equivalent)
const gradCache = new Map();
export function gradImageURL(f, size = 512) {
  const k = JSON.stringify([f.g, f.st, f.k || 1, size]);
  if (gradCache.has(k)) return gradCache.get(k);
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const ctx = cv.getContext('2d'), im = ctx.createImageData(size, size), st = [...f.st].sort((a, b) => a.o - b.o);
  const colAt = t => {
    if (t <= st[0].o) return [...hex2rgb(st[0].c), st[0].a ?? 1];
    for (let i = 1; i < st.length; i++) if (t <= st[i].o) {
      const a = st[i - 1], b = st[i], u = (t - a.o) / ((b.o - a.o) || 1), A = hex2rgb(a.c), B = hex2rgb(b.c);
      return [lerp(A[0], B[0], u), lerp(A[1], B[1], u), lerp(A[2], B[2], u), lerp(a.a ?? 1, b.a ?? 1, u)];
    }
    const l = st[st.length - 1]; return [...hex2rgb(l.c), l.a ?? 1];
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (x + .5) / size * 2 - 1, dy = (y + .5) / size * 2 - 1;
    const t = f.g === 'con' ? ((Math.atan2(dy, dx) / (2 * Math.PI)) + 1) % 1 : Math.min(1, Math.max(Math.abs(dx), Math.abs(dy)) * (f.k || 1));
    const c = colAt(t), i = (y * size + x) * 4;
    im.data[i] = c[0]; im.data[i + 1] = c[1]; im.data[i + 2] = c[2]; im.data[i + 3] = c[3] * 255;
  }
  ctx.putImageData(im, 0, 0);
  const url = cv.toDataURL('image/png');
  gradCache.set(k, url);
  return url;
}

// Arrowheads in a unit space pointing +x with the tip at (0,0); scaled by outline width.
export const ARROWS = {
  tri: { n: 'Segitiga', d: 'M0 0L-5 -2.2L-5 2.2Z', back: 4.2 },
  stealth: { n: 'Siluman', d: 'M0 0L-5.5 -2.6L-4 0L-5.5 2.6Z', back: 3.6 },
  open: { n: 'Terbuka', d: 'M0.4 0L-4.6 -2.9L-5.2 -2L-1.6 0L-5.2 2L-4.6 2.9Z', back: 0.5 },
  circle: { n: 'Lingkaran', d: 'M0 0a1.9 1.9 0 1 0-3.8 0a1.9 1.9 0 1 0 3.8 0Z', back: 1.9 },
  square: { n: 'Persegi', d: 'M0 -1.7H-3.4V1.7H0Z', back: 1.7 },
  diamond: { n: 'Wajik', d: 'M0 0L-2.4 -2.2L-4.8 0L-2.4 2.2Z', back: 2.4 },
  bar: { n: 'Palang', d: 'M0.5 -3H-0.5V3H0.5Z', back: 0 },
  dot: { n: 'Titik', d: 'M1.4 0a1.4 1.4 0 1 0-2.8 0a1.4 1.4 0 1 0 2.8 0Z', back: 0 },
  feather: { n: 'Bulu', d: 'M0 -1.2L-4 -3.4L-5.6 -3.4L-3 0L-5.6 3.4L-4 3.4L0 1.2Z', back: 0 },
};
export const DASHES = [
  null, [4, 2], [2, 2], [1, 2], [6, 2, 1, 2], [8, 3], [12, 4], [1, 1], [6, 2, 1, 2, 1, 2], [3, 6],
];

export const solid = c => c ? { t: 'solid', c } : null;
export function fillColor(f) { // representative colour of any fill (for blends, contours, status bar)
  if (!f) return null;
  if (f.t === 'solid') return f.c;
  if (f.t === 'grad') return f.st?.[0]?.c || '#000000';
  if (f.t === 'pat') return f.fg;
  if (f.t === 'tex') return f.c1 || TEXTURES[f.id]?.c1 || '#888888';
  return '#888888';
}
export function lerpHex(a, b, t, dir = 'direct') {
  if (dir === 'direct') { const A = hex2rgb(a), B = hex2rgb(b); return rgb2hex(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)); }
  return lerpHue(a, b, t, dir);
}
function lerpHue(a, b, t, dir) {
  const toHsv = hx => { const [r, g, b2] = hex2rgb(hx).map(v => v / 255), mx = Math.max(r, g, b2), mn = Math.min(r, g, b2), d = mx - mn; let h = 0; if (d) h = mx === r ? ((g - b2) / d) % 6 : mx === g ? (b2 - r) / d + 2 : (r - g) / d + 4; return [(h * 60 + 360) % 360, mx ? d / mx : 0, mx]; };
  const [h1, s1, v1] = toHsv(a), [h2, s2, v2] = toHsv(b);
  let dh = h2 - h1;
  if (dir === 'cw') { if (dh < 0) dh += 360; } else { if (dh > 0) dh -= 360; }
  const h = (h1 + dh * t + 360) % 360, s = lerp(s1, s2, t), v = lerp(v1, v2, t);
  const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c;
  const [r, g, bb] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return rgb2hex((r + m) * 255, (g + m) * 255, (bb + m) * 255);
}
