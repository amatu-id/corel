// Themes, accent colours and the liquid-glass refraction filter.
import { App } from '../app.js';

export const THEMES = [
  { id: 'liquid-dark', n: 'Liquid Gelap', liquid: true, prev: 'linear-gradient(135deg,#0d1430,#2a1d4f 50%,#0b3a44)', panel: 'rgba(52,56,76,.75)', page: '#fff' },
  { id: 'liquid-light', n: 'Liquid Terang', liquid: true, prev: 'linear-gradient(135deg,#d8e5ff,#f3e4ff 50%,#d9f6ee)', panel: 'rgba(255,255,255,.75)', page: '#fff' },
  { id: 'aurora', n: 'Liquid Aurora', liquid: true, prev: 'linear-gradient(135deg,#17306e,#6a2690 45%,#0d7a68)', panel: 'rgba(30,24,60,.6)', page: '#fff' },
  { id: 'classic-dark', n: 'Klasik Gelap', prev: '#2a2c30', panel: '#3b3d42', page: '#fff' },
  { id: 'classic-medium', n: 'Klasik Medium', prev: '#62656c', panel: '#82858c', page: '#fff' },
  { id: 'classic-light', n: 'Klasik Terang', prev: '#e7e8eb', panel: '#f8f8f9', page: '#fff' },
];
export const ACCENTS = { teal: '#14b8a6', green: '#22c55e', blue: '#3b82f6', indigo: '#6366f1', violet: '#8b5cf6', pink: '#ec4899', orange: '#f97316', red: '#ef4444', gold: '#d4a017', graphite: '#64748b' };

export function applyTheme() {
  const r = document.documentElement, s = App.settings;
  const t = THEMES.find(x => x.id === s.theme) || THEMES[0];
  r.dataset.theme = t.id;
  r.dataset.mode = /light/.test(t.id) ? 'light' : 'dark';
  r.dataset.glass = t.liquid ? s.glass : 'solid';
  r.dataset.liquid = t.liquid ? '1' : '0';
  r.style.setProperty('--accent', ACCENTS[s.accent] || ACCENTS.teal);
  r.classList.toggle('can-refract', !!window.chrome && t.liquid && s.glass === 'liquid');
  ensureRefraction();
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', /light/.test(t.id) ? '#eef1f7' : '#15161c');
  App.view?.drawRulers?.();
}
function ensureRefraction() {
  if (document.getElementById('lg-refract')) return;
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d'), im = x.createImageData(S, S);
  const edge = t => { const e = .14; return t < e ? -((1 - t / e) ** 2) : t > 1 - e ? ((t - (1 - e)) / e) ** 2 : 0; };
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const u = i / (S - 1), v = j / (S - 1), k = (j * S + i) * 4;
    im.data[k] = 128 + 127 * edge(u); im.data[k + 1] = 128 + 127 * edge(v); im.data[k + 2] = 128; im.data[k + 3] = 255;
  }
  x.putImageData(im, 0, 0);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.style.position = 'absolute';
  svg.innerHTML = `<filter id="lg-refract" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feImage href="${c.toDataURL()}" x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map"/><feDisplacementMap in="SourceGraphic" in2="map" scale="22" xChannelSelector="R" yChannelSelector="G"/></filter>`;
  document.body.append(svg);
}
