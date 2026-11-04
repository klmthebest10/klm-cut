'use strict';
/* =========================================================
   KLM Cut — utilitas umum: DOM, ikon, format, kontrol UI, dialog
   ========================================================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const uid = (p = '') => p + Math.random().toString(36).slice(2, 8) + (Date.now() % 1e6).toString(36);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const deepClone = o => JSON.parse(JSON.stringify(o));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));
const isTouch = () => matchMedia('(pointer: coarse)').matches;

function debounce(fn, ms) {
  let t; const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(t); fn(...a); };
  d.cancel = () => clearTimeout(t);
  return d;
}

const Ease = {
  linear: t => t,
  inQuad: t => t * t,
  outQuad: t => 1 - (1 - t) * (1 - t),
  inOut: t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
  inCubic: t => t * t * t,
  outCubic: t => 1 - Math.pow(1 - t, 3),
  outBack: t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  inBack: t => { const c1 = 1.70158, c3 = c1 + 1; return c3 * t * t * t - c1 * t * t; },
  outBounce: t => {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + .75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + .9375;
    return n1 * (t -= 2.625 / d1) * t + .984375;
  },
  outElastic: t => t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - .75) * (2 * Math.PI) / 3) + 1,
};

function fmtTC(t, fps = 30) {
  t = Math.max(0, t || 0);
  let tot = Math.floor(t * fps + 1e-4);
  const f = tot % fps; tot = Math.floor(tot / fps);
  const s = tot % 60, m = Math.floor(tot / 60) % 60, hh = Math.floor(tot / 3600);
  return [hh, m, s, f].map(n => String(n).padStart(2, '0')).join(':');
}
function fmtDur(t) {
  t = Math.max(0, t || 0);
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  if (m >= 60) return Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  return m + ':' + String(s).padStart(2, '0');
}
function fmtSec(t) { return (Math.round(t * 10) / 10).toFixed(1) + 'd'; }
function fmtBytes(b) {
  if (!b) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0;
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return (b < 10 && i ? b.toFixed(1) : Math.round(b)) + ' ' + u[i];
}
function fmtDate(ts) {
  const d = new Date(ts), now = new Date();
  const same = d.toDateString() === now.toDateString();
  const hm = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  if (same) return 'Hari ini ' + hm;
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) + ' ' + hm;
}
function hexToRgb(hex) {
  hex = (hex || '#000').replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const n = parseInt(hex.slice(0, 6), 16) || 0;
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}
function rgba(hex, a) { const [r, g, b] = hexToRgb(hex); return `rgba(${r * 255 | 0},${g * 255 | 0},${b * 255 | 0},${a})`; }
function getPath(o, p) { return p.split('.').reduce((a, k) => a == null ? a : a[k], o); }
function setPath(o, p, v) {
  const ks = p.split('.'); let a = o;
  for (let i = 0; i < ks.length - 1; i++) { if (a[ks[i]] == null || typeof a[ks[i]] !== 'object') a[ks[i]] = {}; a = a[ks[i]]; }
  a[ks[ks.length - 1]] = v;
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

/* ---------------- ikon (SVG buatan sendiri, 24x24) ---------------- */
const ICONS = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 9.5V20h5v-6h4v6h5V9.5"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  play: '<path d="M7.5 4.8v14.4L19.5 12z" fill="currentColor" stroke-width="1.2"/>',
  pause: '<rect x="6.5" y="5" width="3.6" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="13.9" y="5" width="3.6" height="14" rx="1" fill="currentColor" stroke="none"/>',
  prev: '<path d="M6 5v14"/><path d="M18 5.5v13L9 12z" fill="currentColor" stroke-width="1.2"/>',
  next: '<path d="M18 5v14"/><path d="M6 5.5v13L15 12z" fill="currentColor" stroke-width="1.2"/>',
  split: '<path d="M12 3v18"/><path d="M8 7l-4 5 4 5M16 7l4 5-4 5"/>',
  trash: '<path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5M14 11v5"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 000 11H13"/>',
  crop: '<path d="M6 2v16h16"/><path d="M2 6h16v16"/>',
  flipH: '<path d="M12 3v18" stroke-dasharray="2 2.5"/><path d="M9 7L3 17h6zM15 7l6 10h-6z"/>',
  flipV: '<path d="M3 12h18" stroke-dasharray="2 2.5"/><path d="M7 9L17 3v6zM7 15l10 6v-6z"/>',
  rotate: '<path d="M20 12a8 8 0 11-2.4-5.7"/><path d="M20 4v6h-6"/>',
  text: '<path d="M5 6.5V4h14v2.5M12 4v16M9 20h6"/>',
  music: '<path d="M9 18V5.5l11-2.2v12.5"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="15.8" r="3"/>',
  sticker: '<path d="M20.5 12A8.5 8.5 0 1112 3.5"/><path d="M12 3.5c0 4.7 3.8 8.5 8.5 8.5"/><path d="M8.5 14.8c1.8 1.8 4.4 2 6.4.6"/><circle cx="9" cy="10" r=".6" fill="currentColor"/>',
  effects: '<path d="M10.5 3l1.9 5.1L17.5 10l-5.1 1.9L10.5 17l-1.9-5.1L3.5 10l5.1-1.9z"/><path d="M18 14l.9 2.1L21 17l-2.1.9L18 20l-.9-2.1L15 17l2.1-.9z"/>',
  transition: '<path d="M3.5 5.5l8.5 6.5-8.5 6.5zM20.5 5.5L12 12l8.5 6.5z"/>',
  filter: '<circle cx="9" cy="9.5" r="5.5"/><circle cx="15" cy="9.5" r="5.5"/><circle cx="12" cy="15" r="5.5"/>',
  adjust: '<path d="M4 6.5h9M17 6.5h3M4 12h3M11 12h9M4 17.5h11M19 17.5h1"/><circle cx="15" cy="6.5" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17.5" r="2"/>',
  media: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M10 9.3v5.4l4.6-2.7z" fill="currentColor"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="8.5" cy="9" r="1.8"/><path d="M3.5 17l5-5 4 4 3-3 5 5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  upload: '<path d="M12 15V3.5M7 8l5-5 5 5"/><path d="M4 15v3.5A2.5 2.5 0 006.5 21h11a2.5 2.5 0 002.5-2.5V15"/>',
  download: '<path d="M12 3.5V15M7 10l5 5 5-5"/><path d="M4 15v3.5A2.5 2.5 0 006.5 21h11a2.5 2.5 0 002.5-2.5V15"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
  zoomIn: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M20.5 20.5l-5.2-5.2M7.8 10.5h5.4M10.5 7.8v5.4"/>',
  zoomOut: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M20.5 20.5l-5.2-5.2M7.8 10.5h5.4"/>',
  fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/><path d="M9 12h6"/>',
  magnet: '<path d="M5 4h4v7.5a3 3 0 006 0V4h4v7.5a7 7 0 01-14 0z"/><path d="M5 8h4M15 8h4"/>',
  snap: '<path d="M4 4v16"/><path d="M8 12h12"/><path d="M16 8l4 4-4 4"/>',
  link: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M3 3l18 18"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7.5a4 4 0 018 0V11"/>',
  unlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7.5a4 4 0 017.6-1.8"/>',
  volume: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12"/>',
  mute: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5"/>',
  kf: '<path d="M12 3.5l8.5 8.5-8.5 8.5L3.5 12z"/>',
  kfPrev: '<path d="M15 6l-6 6 6 6"/>',
  kfNext: '<path d="M9 6l6 6-6 6"/>',
  freeze: '<path d="M12 2.5v19M3.8 7.2l16.4 9.6M3.8 16.8l16.4-9.6"/><path d="M9 4.5l3 2 3-2M9 19.5l3-2 3 2"/>',
  speed: '<path d="M3.5 17.5a8.5 8.5 0 1117 0"/><path d="M12 15l4.5-5"/><circle cx="12" cy="15.5" r="1.2" fill="currentColor"/>',
  mask: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="12" cy="12" r="5"/>',
  chroma: '<path d="M12 3s6.5 6.6 6.5 11.3a6.5 6.5 0 01-13 0C5.5 9.6 12 3 12 3z"/><path d="M9 14.5a3 3 0 003 3"/>',
  anim: '<circle cx="15" cy="12" r="5.5"/><path d="M2.5 9h4.5M3.5 12h4M2.5 15h4.5"/>',
  copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M15.5 8.5V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7.5a2 2 0 002 2h2.5"/>',
  paste: '<rect x="5" y="4.5" width="14" height="16.5" rx="2"/><path d="M9 4.5V3h6v1.5M9 10h6M9 14h4"/>',
  full: '<path d="M3.5 9V3.5H9M20.5 9V3.5H15M3.5 15v5.5H9M20.5 15v5.5H15"/>',
  ratio: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 9.5v5M17 9.5v5"/>',
  canvas: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21"/>',
  cc: '<rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M10.5 10.2a2.4 2.4 0 100 3.6M17 10.2a2.4 2.4 0 100 3.6"/>',
  save: '<path d="M5 3.5h11l3.5 3.5v12A1.5 1.5 0 0118 20.5H6A1.5 1.5 0 014.5 19V5A1.5 1.5 0 015 3.5z"/><path d="M8 3.5v5h7.5v-5M8 20.5v-7h8v7"/>',
  folder: '<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  more: '<circle cx="5.5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="18.5" cy="12" r="1.3" fill="currentColor"/>',
  marker: '<path d="M6 21V4h11l-2.5 4 2.5 4H6"/>',
  trimL: '<path d="M14 4v16"/><path d="M10 8l-4 4 4 4"/><path d="M18 6v12" stroke-dasharray="2 2.5"/>',
  trimR: '<path d="M10 4v16"/><path d="M14 8l4 4-4 4"/><path d="M6 6v12" stroke-dasharray="2 2.5"/>',
  wave: '<path d="M3 12h2.5l2-5.5 3 11 3-8.5 2 3h5.5"/>',
  replace: '<path d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  overlay: '<rect x="2.5" y="4" width="19" height="16" rx="2.5"/><rect x="11.5" y="10.5" width="7" height="6" rx="1.2" fill="currentColor"/>',
  opacity: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 010 17z" fill="currentColor"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20.5 20.5l-4.8-4.8"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.3a2.6 2.6 0 115 1c-.9.8-2.5 1.4-2.5 3.2M12 17h.01"/>',
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01M7.5 14h9"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
  beat: '<path d="M2.5 12h4l2.5-6 4 12 2.5-6h6"/>',
  ai: '<path d="M10 3l1.6 4.4L16 9l-4.4 1.6L10 15l-1.6-4.4L4 9l4.4-1.6z"/><path d="M17.5 13.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"/>',
  sfx: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 7l2-2M17 17l2 2M18 12h3"/>',
  record: '<circle cx="12" cy="12" r="6" fill="currentColor"/>',
  stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor"/>',
  bg: '<rect x="3" y="3" width="18" height="18" rx="2.5"/><rect x="7" y="7" width="10" height="10" rx="1"/>',
  shape: '<rect x="3.5" y="12.5" width="8" height="8" rx="1.5"/><circle cx="16.5" cy="16.5" r="4"/><path d="M12 3l4.5 7.5h-9z"/>',
  duplicate: '<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M15.5 8.5V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7.5a2 2 0 002 2h2.5"/><path d="M14.5 11.5v6M11.5 14.5h6"/>',
  srt: '<path d="M6 3.5h8l4.5 4.5v12.5H6z"/><path d="M14 3.5V8h4.5M9 13h6M9 16.5h4"/>',
  scissors: '<circle cx="6" cy="6.5" r="2.8"/><circle cx="6" cy="17.5" r="2.8"/><path d="M8.3 8.2L20 18M8.3 15.8L20 6"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.2"/><rect x="13" y="4" width="7" height="7" rx="1.2"/><rect x="4" y="13" width="7" height="7" rx="1.2"/><rect x="13" y="13" width="7" height="7" rx="1.2"/>',
  reverse: '<path d="M20 7H6.5M10 3.5L6.5 7l3.5 3.5"/><path d="M4 17h13.5M14 13.5l3.5 3.5-3.5 3.5"/>',
  install: '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M12 7v7M9 11l3 3 3-3M10.5 18.5h3"/>',
  chevD: '<path d="M6 9l6 6 6-6"/>',
  chevR: '<path d="M9 6l6 6-6 6"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z"/>',
  dot: '<circle cx="12" cy="12" r="3" fill="currentColor"/>',
};
function icon(name, cls) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('class', 'ic' + (cls ? ' ' + cls : ''));
  s.innerHTML = ICONS[name] || ICONS.dot;
  return s;
}
function setIcon(el, name, label) {
  if (!el) return;
  el.innerHTML = '';
  el.append(icon(name));
  if (label) el.append(h('span', null, label));
}

/* ---------------- toast, dialog, menu konteks ---------------- */
function toast(msg, kind, ms = 2600) {
  const el = h('div', { class: 'toast' + (kind === 'err' ? ' err' : '') }, msg);
  $('#toast-root').append(el);
  setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 320); }, ms);
}

function modal({ title, body, buttons, wide, dismiss = true, onOpen }) {
  return new Promise(resolve => {
    const root = $('#modal-root');
    let done = false;
    const close = v => { if (done) return; done = true; bg.remove(); document.removeEventListener('keydown', onKey, true); resolve(v); };
    const foot = h('div', { class: 'm-f' });
    (buttons || [{ label: 'Tutup', value: null }]).forEach(b => {
      const btn = h('button', { class: 'btn ' + (b.cls || ''), type: 'button' }, b.label);
      btn.onclick = async () => {
        if (b.onClick) { const r = await b.onClick(); if (r === false) return; }
        close(b.value !== undefined ? b.value : b.label);
      };
      foot.append(btn);
    });
    const box = h('div', { class: 'modal' + (wide ? ' wide' : ''), dataset: dismiss ? null : { nodismiss: '1' } },
      h('div', { class: 'm-h' }, h('span', null, title || ''), dismiss ? h('button', { class: 'icon-btn', type: 'button', onclick: () => close(null) }, icon('close')) : null),
      h('div', { class: 'm-b' }, body),
      buttons === false ? null : foot);
    const bg = h('div', { class: 'mbg' }, box);
    if (dismiss) bg.addEventListener('pointerdown', e => { if (e.target === bg) close(null); });
    const onKey = e => {
      if (e.key === 'Escape' && dismiss) { e.stopPropagation(); close(null); }
      e.stopPropagation();
    };
    document.addEventListener('keydown', onKey, true);
    root.append(bg);
    box.close = close;
    if (onOpen) onOpen(box, close);
    const f = box.querySelector('input:not([type=range]),textarea');
    if (f && !isTouch()) setTimeout(() => f.focus(), 30);
  });
}
async function confirmDlg(title, msg, okLabel = 'Ya', danger) {
  const r = await modal({ title, body: h('div', { class: 'hint', style: { fontSize: '13px' } }, msg), buttons: [{ label: 'Batal', value: false, cls: 'ghost' }, { label: okLabel, value: true, cls: danger ? 'danger' : 'accent' }] });
  return r === true;
}
async function promptDlg(title, value = '', placeholder = '') {
  const inp = h('input', { class: 'inp', value, placeholder });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.closest('.modal').close(inp.value); });
  const r = await modal({ title, body: inp, buttons: [{ label: 'Batal', value: null, cls: 'ghost' }, { label: 'Simpan', cls: 'accent', onClick: () => { inp.closest('.modal').close(inp.value); return false; } }] });
  return r;
}
let _ctx = null;
function ctxMenu(x, y, items) {
  closeCtx();
  const m = h('div', { class: 'ctx' });
  for (const it of items) {
    if (!it) continue;
    if (it.sep) { m.append(h('hr')); continue; }
    const b = h('button', { type: 'button', class: it.danger ? 'dng' : '', disabled: it.disabled }, it.icon ? icon(it.icon) : null, h('span', null, it.label), it.key ? h('span', { class: 'k' }, it.key) : null);
    b.onclick = () => { closeCtx(); it.action && it.action(); };
    m.append(b);
  }
  document.body.append(m);
  const r = m.getBoundingClientRect();
  m.style.left = clamp(x, 6, innerWidth - r.width - 6) + 'px';
  m.style.top = clamp(y, 6, innerHeight - r.height - 6) + 'px';
  _ctx = m;
  setTimeout(() => document.addEventListener('pointerdown', ctxOutside, true), 0);
}
function ctxOutside(e) { if (_ctx && !_ctx.contains(e.target)) closeCtx(); }
function closeCtx() { if (_ctx) { _ctx.remove(); _ctx = null; } document.removeEventListener('pointerdown', ctxOutside, true); }

/* ---------------- unduh / simpan file ---------------- */
function blobToB64(b) { return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1] || ''); fr.onerror = rej; fr.readAsDataURL(b); }); }
async function androidSave(blob, name) {
  const A = window.KLMAndroid;
  const r = A.saveBegin(name, blob.type || 'application/octet-stream');
  if (r !== 'ok') throw new Error(r);
  const CH = 1536 * 1024;
  for (let o = 0; o < blob.size; o += CH) A.saveChunk(await blobToB64(blob.slice(o, o + CH)));
  return A.saveEnd();
}
async function saveBlob(blob, name, opts = {}) {
  if (window.KLMAndroid) {
    try { const where = await androidSave(blob, name); toast('Tersimpan: ' + where, null, 3500); return true; }
    catch (e) { toast('Gagal menyimpan: ' + e.message, 'err', 4000); return false; }
  }
  if (opts.picker && window.showSaveFilePicker && !isTouch()) {
    try {
      const ext = name.split('.').pop();
      const h2 = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: ext.toUpperCase(), accept: { [blob.type || 'application/octet-stream']: ['.' + ext] } }] });
      const w = await h2.createWritable(); await w.write(blob); await w.close();
      return true;
    } catch (e) { if (e && e.name === 'AbortError') return false; }
  }
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return true;
}
function pickFiles(accept, multiple = true) {
  return new Promise(res => {
    const inp = $('#file-input');
    inp.value = ''; inp.accept = accept || ''; inp.multiple = multiple;
    let fired = false;
    inp.onchange = () => { fired = true; res(Array.from(inp.files || [])); };
    window.addEventListener('focus', () => setTimeout(() => { if (!fired && !(inp.files && inp.files.length)) res([]); }, 1200), { once: true });
    inp.click();
  });
}

/* ---------------- kontrol UI ---------------- */
const UI = {
  section(title, body, o = {}) {
    const sec = h('div', { class: 'sec' + (o.collapsed ? ' collapsed' : '') });
    const head = h('div', { class: 'sec-h' }, h('span', null, title), h('span', { class: 'sec-x' }, o.extra || null, o.noCollapse ? null : icon('chevD', 'chev')));
    if (!o.noCollapse) head.addEventListener('click', e => { if (e.target.closest('.sec-x button,.sec-x .toggle')) return; sec.classList.toggle('collapsed'); });
    sec.append(head, h('div', { class: 'sec-b' }, body));
    return sec;
  },
  row(label, ...ctl) { return h('div', { class: 'row' }, label != null ? h('span', { class: 'lbl' }, label) : null, ...ctl); },
  fmt(v, step) { const d = step >= 1 ? 0 : step >= .1 ? 1 : 2; return (+v).toFixed(d); },
  /* o: label,min,max,step,value,unit,onStart,onInput,onChange,def,kf:{state()->'none'|'has'|'at', toggle()} ,scale */
  slider(o) {
    const step = o.step ?? 1, sc = o.scale || 1;
    const range = h('input', { type: 'range', min: o.min, max: o.max, step, value: o.value * sc });
    const num = h('input', { type: 'number', class: 'num', min: o.min, max: o.max, step, value: UI.fmt(o.value * sc, step) });
    const setFill = () => { const p = (range.value - o.min) / (o.max - o.min) * 100; range.style.setProperty('--p', p + '%'); };
    let active = false;
    const start = () => { if (!active) { active = true; o.onStart && o.onStart(); } };
    range.addEventListener('input', () => { start(); num.value = UI.fmt(range.value, step); setFill(); o.onInput && o.onInput(+range.value / sc); });
    range.addEventListener('change', () => { active = false; o.onChange && o.onChange(+range.value / sc); });
    num.addEventListener('change', () => {
      const v = clamp(parseFloat(num.value) || 0, o.min, o.max);
      num.value = UI.fmt(v, step); range.value = v; setFill();
      start(); o.onInput && o.onInput(v / sc); active = false; o.onChange && o.onChange(v / sc);
    });
    num.addEventListener('keydown', e => e.stopPropagation());
    setFill();
    const wrap = h('div', { class: 'ctl-slider' }, range, num);
    let kfb = null;
    if (o.kf) {
      kfb = h('button', { class: 'kf-btn', type: 'button', title: 'Keyframe' }, icon('kf'));
      const upd = () => { const s = o.kf.state(); kfb.classList.toggle('has', s !== 'none'); kfb.classList.toggle('at', s === 'at'); };
      kfb.onclick = () => { o.kf.toggle(); upd(); };
      upd(); kfb._upd = upd;
      wrap.append(kfb);
    }
    if (o.def != null) {
      const rb = h('button', { class: 'rst-btn', type: 'button', title: 'Atur ulang' }, icon('rotate'));
      rb.onclick = () => { start(); range.value = o.def * sc; num.value = UI.fmt(o.def * sc, step); setFill(); o.onInput && o.onInput(o.def); active = false; o.onChange && o.onChange(o.def); };
      wrap.append(rb);
    }
    const row = UI.row(o.label, wrap);
    row._set = v => { range.value = v * sc; num.value = UI.fmt(v * sc, step); setFill(); kfb && kfb._upd(); };
    row.classList.add('srow');
    return row;
  },
  select(options, value, onChange) {
    const s = h('select', { class: 'selc' });
    for (const o of options) {
      if (o.group) { const g = h('optgroup', { label: o.group }); o.items.forEach(i => g.append(h('option', { value: i.value }, i.label))); s.append(g); }
      else s.append(h('option', { value: o.value }, o.label));
    }
    s.value = value;
    s.addEventListener('change', () => onChange(s.value));
    return s;
  },
  seg(options, value, onChange) {
    const w = h('div', { class: 'seg' });
    for (const o of options) {
      const b = h('button', { type: 'button', class: o.value === value ? 'on' : '', title: o.title || '' }, o.icon ? icon(o.icon) : null, o.label || null);
      b.onclick = () => { $$('button', w).forEach(x => x.classList.remove('on')); b.classList.add('on'); onChange(o.value); };
      w.append(b);
    }
    return w;
  },
  toggle(on, onChange) {
    const t = h('div', { class: 'toggle' + (on ? ' on' : ''), role: 'switch' });
    t.onclick = e => { e.stopPropagation(); t.classList.toggle('on'); onChange(t.classList.contains('on')); };
    return t;
  },
  color(value, onInput, onChange) {
    const i = h('input', { type: 'color', value: value || '#ffffff' });
    let started = false;
    i.addEventListener('input', () => { onInput(i.value, !started); started = true; });
    i.addEventListener('change', () => { started = false; onChange && onChange(i.value); });
    return h('label', { class: 'color', style: { background: value } }, i);
  },
  swatches(colors, value, onPick) {
    const w = h('div', { class: 'swatches' });
    colors.forEach(c => {
      const s = h('div', { class: 'sw' + (c === value ? ' on' : ''), style: { background: c }, title: c });
      s.onclick = () => { $$('.sw', w).forEach(x => x.classList.remove('on')); s.classList.add('on'); onPick(c); };
      w.append(s);
    });
    return w;
  },
  btn(label, iconName, onClick, cls = '') {
    return h('button', { class: 'btn sm ' + cls, type: 'button', onclick: onClick }, iconName ? icon(iconName) : null, label);
  },
  cats(list, active, onPick) {
    const w = h('div', { class: 'cats' });
    list.forEach(c => {
      const b = h('button', { class: 'cat' + (c === active ? ' on' : ''), type: 'button' }, c);
      b.onclick = () => { $$('.cat', w).forEach(x => x.classList.remove('on')); b.classList.add('on'); onPick(c); };
      w.append(b);
    });
    return w;
  },
};

/* ---------------- WAV encoder ---------------- */
function encodeWav(buffer) {
  const ch = buffer.numberOfChannels, sr = buffer.sampleRate, len = buffer.length;
  const data = new DataView(new ArrayBuffer(44 + len * ch * 2));
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) data.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); data.setUint32(4, 36 + len * ch * 2, true); ws(8, 'WAVE'); ws(12, 'fmt ');
  data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, ch, true);
  data.setUint32(24, sr, true); data.setUint32(28, sr * ch * 2, true); data.setUint16(32, ch * 2, true); data.setUint16(34, 16, true);
  ws(36, 'data'); data.setUint32(40, len * ch * 2, true);
  const chans = []; for (let c = 0; c < ch; c++) chans.push(buffer.getChannelData(c));
  let o = 44;
  for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++) {
    const s = clamp(chans[c][i], -1, 1);
    data.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2;
  }
  return new Blob([data.buffer], { type: 'audio/wav' });
}
