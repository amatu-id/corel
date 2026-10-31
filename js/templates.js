// Starter templates shown on the Welcome screen. Each builds a complete, editable document.
import { newDoc, mk } from './model.js';
import { T, S, R, mul, N } from './geom.js';
import { PT } from './util.js';

const solid = c => ({ t: 'solid', c });
const lin = (p1, p2, ...st) => ({ t: 'grad', g: 'lin', p1, p2, st: st.map(([c, o, a = 1]) => ({ c, o, a })) });
const rad = (p1, p2, ...st) => ({ t: 'grad', g: 'rad', p1, p2, st: st.map(([c, o, a = 1]) => ({ c, o, a })) });
const txt = (s, font, sz, x, y, o = {}) => mk('text', { s, font, sz, wt: o.wt || 400, it: !!o.it, al: o.al || 'l', cs: o.cs || 0, ls: o.ls || 1, fill: o.fill || solid('#000000'), ol: o.ol || null, tf: T(x, y - sz * PT * .9), ...o.x });
const rect = (x, y, w, h, o = {}) => mk('rect', { w, h, r: o.r ? [o.r, o.r, o.r, o.r] : [0, 0, 0, 0], tf: T(x, y), fill: o.fill ?? null, ol: o.ol ?? null, tr: o.tr, fx: o.fx, name: o.name || '' });
const ell = (x, y, w, h, o = {}) => mk('ell', { w, h, tf: T(x, y), fill: o.fill ?? null, ol: o.ol ?? null, tr: o.tr, fx: o.fx, name: o.name || '' });
const curve = (pts, o = {}) => mk('curve', { p: { sp: [{ c: o.open ? false : true, n: pts.map(p => N(...p)) }] }, fill: o.fill ?? null, ol: o.ol ?? null, tr: o.tr, fx: o.fx, name: o.name || '' });
function doc(name, w, h, build) {
  const d = newDoc({ name, w, h });
  const L = d.pages[0].layers[0];
  build(L.objs, d.pages[0], d);
  return d;
}

export const TEMPLATES = [
  {
    id: 'bizcard', n: 'Kartu Nama Aurora', c: 'Kartu nama · 90 × 55 mm', fonts: ['Montserrat', 'Inter'],
    make: () => doc('Kartu Nama Aurora', 90, 55, (O, p) => {
      p.bg = '#0b1026';
      O.push(rect(0, 0, 90, 55, { fill: lin([0, 0], [90, 55], ['#0b1026', 0], ['#1b2a63', 1]), name: 'Latar' }));
      O.push(ell(48, 18, 62, 62, { fill: rad([31, 31], [62, 31], ['#2ee6a6', 0, .9], ['#6d5cff', .6, .55], ['#6d5cff', 1, 0]), name: 'Cahaya aurora' }));
      O.push(ell(-14, -22, 40, 40, { fill: rad([20, 20], [40, 20], ['#19a8d8', 0, .55], ['#19a8d8', 1, 0]), name: 'Cahaya 2' }));
      O.push(mk('poly', { w: 9, h: 9, n: 6, star: true, ir: .45, tf: T(8, 8), fill: lin([0, 0], [9, 9], ['#2ee6a6', 0], ['#6d5cff', 1]), ol: null, name: 'Logo' }));
      O.push(txt('STUDIO RUPA', 'Montserrat', 6.5, 20, 13.6, { wt: 700, cs: 18, fill: solid('#ffffff') }));
      O.push(txt('Rangga Pratama', 'Montserrat', 13, 8, 31, { wt: 700, fill: solid('#ffffff') }));
      O.push(txt('Desainer Grafis & Ilustrator', 'Montserrat', 6.5, 8, 36.5, { fill: solid('#2ee6a6') }));
      O.push(mk('curve', { p: { sp: [{ c: false, n: [N(8, 40.5), N(40, 40.5)] }] }, fill: null, ol: { w: .25, c: '#ffffff', a: .35 }, name: 'Garis' }));
      ['+62 812 3456 7890', 'rangga@studiorupa.id', 'Jl. Merdeka 45, Bandung'].forEach((s, i) => {
        O.push(ell(8, 43.4 + i * 3.6, 1.6, 1.6, { fill: solid('#2ee6a6') }));
        O.push(txt(s, 'Inter', 5.5, 11, 45 + i * 3.6, { fill: solid('#c9d3f5') }));
      });
    }),
  },
  {
    id: 'poster', n: 'Poster Festival Senja', c: 'Poster · A4 potret', fonts: ['Bebas Neue', 'Montserrat'],
    make: () => doc('Poster Festival Senja', 210, 297, (O, p) => {
      p.bg = '#2b1055';
      O.push(rect(0, 0, 210, 297, { fill: lin([0, 0], [0, 297], ['#ff9a5a', 0], ['#ff5e7e', .35], ['#7b2d8e', .7], ['#2b1055', 1]), name: 'Langit' }));
      O.push(ell(35, 70, 140, 140, { fill: lin([0, 0], [0, 140], ['#fff3b0', 0], ['#ffb347', .55], ['#ff6a3d', 1]), name: 'Matahari', fx: { sh: { k: 'flat', x: 0, y: 0, b: 14, o: .6, c: '#ffcf70' } } }));
      for (let i = 0; i < 6; i++) O.push(rect(30, 150 + i * 9, 150, 2 + i * .9, { fill: solid('#ff5e7e'), name: 'Garis matahari' }));
      O.push(curve([[0, 205], [40, 170], [70, 188], [105, 150], [150, 192], [180, 172], [210, 196], [210, 297], [0, 297]], { fill: solid('#5a1f73'), name: 'Gunung belakang' }));
      O.push(curve([[0, 232], [55, 196], [95, 222], [140, 190], [210, 232], [210, 297], [0, 297]], { fill: lin([0, 190], [0, 297], ['#3a145a', 0], ['#1a0833', 1]), name: 'Gunung depan' }));
      O.push(txt('FESTIVAL', 'Bebas Neue', 108, 0, 58, { cs: 4, fill: solid('#ffffff') }));
      O.at(-1)._cx = 105; O.at(-1).fx = { sh: { k: 'flat', x: 0, y: 2.5, b: 4, o: .35, c: '#2b1055' } };
      O.push(txt('MUSIK SENJA', 'Bebas Neue', 58, 0, 245, { cs: 10, fill: solid('#ffe8a3') }));
      O.at(-1)._cx = 105;
      O.push(txt('SABTU, 14 DESEMBER 2026  ·  16.00 WIB', 'Montserrat', 12, 14, 262, { wt: 700, cs: 6, fill: solid('#ffffff') }));
      O.push(txt('Lapangan Gasibu, Bandung  ·  Tiket mulai Rp75.000', 'Montserrat', 10, 14, 272, { fill: solid('#f2c6ff') }));
      O.push(mk('qr', { data: 'https://amatu-id.github.io/corel', ec: 'M', w: 22, h: 22, fill: solid('#2b1055'), bg: '#ffffff', ol: null, tf: T(176, 264), name: 'QR tiket' }));
    }),
  },
  {
    id: 'logo', n: 'Logo Kopi Nusantara', c: 'Logo · 100 × 100 mm', fonts: ['Cinzel', 'Lora'],
    make: () => doc('Logo Kopi Nusantara', 100, 100, (O, p) => {
      p.bg = '#f6efe4';
      O.push(ell(8, 8, 84, 84, { fill: solid('#3e2723'), name: 'Lencana' }));
      O.push(ell(12, 12, 76, 76, { fill: null, ol: { w: .6, c: '#c9a227' }, name: 'Cincin' }));
      const ring = ell(22, 22, 56, 56, { fill: null, ol: null, name: 'Jalur teks' });
      O.push(ring);
      const t = txt('KOPI NUSANTARA • SEJAK 2026 • ', 'Cinzel', 11, 0, 0, { wt: 700, cs: 12, fill: solid('#f6e7c1') });
      t.al = 'c'; t.tp = { id: ring.id, off: Math.PI * 56 / 4, side: 0 };
      O.push(t);
      const bean = mk('ell', { w: 22, h: 30, tf: mul(T(50, 50), mul(R(-30), T(-11, -15))), fill: lin([0, 0], [22, 30], ['#c9a227', 0], ['#8a6a1f', 1]), ol: null, name: 'Biji kopi' });
      O.push(bean);
      O.push(mk('curve', { p: { sp: [{ c: false, n: [N(11, 2, 11, 2, 4, 10), N(11, 15, 18, 10, 4, 20), N(11, 28, 18, 20, 11, 28)] }] }, tf: mul(T(50, 50), mul(R(-30), T(-11, -15))), fill: null, ol: { w: 1.4, c: '#3e2723', cap: 'round' }, name: 'Celah biji' }));
    }),
  },
  {
    id: 'cert', n: 'Sertifikat Penghargaan', c: 'Sertifikat · A4 lanskap', fonts: ['Cinzel', 'Great Vibes', 'Lora'],
    make: () => doc('Sertifikat Penghargaan', 297, 210, (O, p) => {
      p.bg = '#fffdf7';
      const gold = (w) => lin([0, 0], [w, 0], ['#8a6a1f', 0], ['#f6e27a', .45], ['#b88a2a', .7], ['#f9e9a8', 1]);
      O.push(mk('ps', { sh: 'frame', w: 277, h: 190, p: [.03], tf: T(10, 10), fill: { t: 'pat', id: 'kawung', fg: '#c9a227', bg: '#1f2a44', s: 6, a: 0 }, ol: null, name: 'Bingkai batik' }));
      O.push(rect(20, 20, 257, 170, { fill: null, ol: { w: .6, c: '#c9a227' } }));
      O.push(txt('SERTIFIKAT', 'Cinzel', 46, 0, 62, { wt: 700, cs: 8, fill: gold(200) }));
      O.at(-1)._cx = 148.5;
      O.push(txt('P E N G H A R G A A N', 'Lora', 12, 0, 74, { fill: solid('#1f2a44') }));
      O.at(-1)._cx = 148.5;
      O.push(txt('Dengan bangga diberikan kepada', 'Lora', 12, 0, 92, { it: true, fill: solid('#555555') }));
      O.at(-1)._cx = 148.5;
      O.push(txt('Nama Penerima', 'Great Vibes', 44, 0, 118, { fill: solid('#1f2a44') }));
      O.at(-1)._cx = 148.5;
      O.push(mk('curve', { p: { sp: [{ c: false, n: [N(88, 124), N(209, 124)] }] }, fill: null, ol: { w: .4, c: '#c9a227' } }));
      O.push(mk('text', { s: 'Atas dedikasi, kerja keras, dan kontribusi luar biasa dalam Program Pengembangan Desain 2026.', font: 'Lora', sz: 11, al: 'c', mode: 'para', w: 150, h: 16, ls: 1.2, fill: solid('#444444'), ol: null, tf: T(73.5, 130) }));
      O.push(mk('ps', { sh: 'seal', w: 34, h: 34, p: [.86], tf: T(36, 150), fill: gold(34), ol: null, name: 'Segel' }));
      O.push(ell(43, 157, 20, 20, { fill: null, ol: { w: .5, c: '#fffdf7' } }));
      [['Direktur', 190], ['Ketua Panitia', 240]].forEach(([s, x]) => {
        O.push(mk('curve', { p: { sp: [{ c: false, n: [N(x - 22, 172), N(x + 22, 172)] }] }, fill: null, ol: { w: .35, c: '#1f2a44' } }));
        const t = txt(s, 'Lora', 9, 0, 178, { fill: solid('#1f2a44') }); t._cx = x; O.push(t);
      });
    }),
  },
  {
    id: 'social', n: 'Promo Media Sosial', c: 'Instagram · 1080 × 1080 px', fonts: ['Anton', 'Poppins'],
    make: () => doc('Promo Media Sosial', 285.75, 285.75, (O, p) => {
      p.bg = '#ffde59';
      O.push(rect(0, 0, 285.75, 285.75, { fill: solid('#ffde59'), name: 'Latar' }));
      const a = ell(-40, 170, 150, 150, { fill: solid('#ff5757') }), b = ell(200, -40, 120, 120, { fill: solid('#5170ff') });
      O.push(mk('blend', { a, b, n: 8, rot: 0, cd: 'cw', name: 'Campuran lingkaran' }));
      O.push(rect(40, 70, 205.75, 140, { r: 10, fill: solid('#ffffff'), fx: { bs: { x: 6, y: 6, c: '#1a1a1a' } }, ol: { w: 1.2, c: '#1a1a1a' }, name: 'Kartu' }));
      O.push(txt('DISKON', 'Anton', 54, 58, 128, { fill: solid('#1a1a1a'), cs: 2 }));
      O.push(txt('50%', 'Anton', 96, 160, 150, { fill: lin([0, 0], [90, 0], ['#ff5757', 0], ['#5170ff', 1]) }));
      O.push(txt('Hanya minggu ini — semua koleksi baru', 'Poppins', 14, 58, 172, { fill: solid('#333333') }));
      O.push(rect(58, 182, 92, 18, { r: 9, fill: solid('#1a1a1a'), name: 'Tombol' }));
      O.push(txt('Belanja sekarang', 'Poppins', 13, 70, 194.5, { wt: 700, fill: solid('#ffffff') }));
      O.push(txt('@tokokamu', 'Poppins', 12, 110, 262, { wt: 700, fill: solid('#1a1a1a') }));
    }),
  },
  {
    id: 'blank-a4', n: 'A4 Kosong', c: 'Dokumen · 210 × 297 mm', fonts: [], make: () => newDoc({ name: 'Tanpa judul', w: 210, h: 297 }),
  },
];
void S;
