'use strict';
/* =========================================================
   KLM Cut — penyimpanan (IndexedDB), model proyek, riwayat undo/redo
   ========================================================= */
const DB = {
  db: null,
  open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('klm-cut', 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        d.createObjectStore('projects', { keyPath: 'id' });
        d.createObjectStore('blobs');
        d.createObjectStore('derived');
        d.createObjectStore('kv');
      };
      r.onsuccess = () => { this.db = r.result; res(); };
      r.onerror = () => rej(r.error);
    });
  },
  req(store, mode, fn) {
    return new Promise((res, rej) => {
      const tx = this.db.transaction(store, mode);
      const st = tx.objectStore(store);
      const rq = fn(st);
      tx.oncomplete = () => res(rq && rq.result);
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error);
    });
  },
  get(s, k) { return this.req(s, 'readonly', st => st.get(k)); },
  put(s, v, k) { return this.req(s, 'readwrite', st => k === undefined ? st.put(v) : st.put(v, k)); },
  del(s, k) { return this.req(s, 'readwrite', st => st.delete(k)); },
  all(s) { return this.req(s, 'readonly', st => st.getAll()); },
};

/* ---------------- state global ---------------- */
const S = {
  project: null,
  sel: new Set(),
  selCut: null,          // id klip yang punya transisi terpilih (transisi masuk)
  time: 0,
  playing: false,
  magnet: true,
  snap: true,
  clipboard: null,
  settings: { imgDur: 4, textDur: 3, quality: 'auto', autosave: true, defaultRatio: 'original' },
};
const P = () => S.project;

/* ---------------- model proyek ---------------- */
const TRACK_ACCEPT = { main: ['video', 'image'], video: ['video', 'image'], text: ['text', 'sticker'], effect: ['effect', 'filter', 'adjust'], audio: ['audio'] };
const TRACK_NAMES = { main: 'Utama', video: 'Hamparan', text: 'Teks', effect: 'Efek', audio: 'Audio' };
function trackKindFor(type) {
  if (type === 'video' || type === 'image') return 'video';
  if (type === 'text' || type === 'sticker') return 'text';
  if (type === 'audio') return 'audio';
  return 'effect';
}
function computeSize(ratio, res, orig) {
  let a, b;
  if (ratio === 'original') { if (orig && orig.w && orig.h) { a = orig.w; b = orig.h; } else { a = 16; b = 9; } }
  else [a, b] = ratio.split(':').map(Number);
  let W, H;
  if (a >= b) { H = res; W = res * a / b; } else { W = res; H = res * b / a; }
  return { W: Math.max(2, Math.round(W / 2) * 2), H: Math.max(2, Math.round(H / 2) * 2) };
}
function newProject(o = {}) {
  const d = new Date();
  const p = {
    id: uid('p'), v: 1,
    name: o.name || ('Proyek ' + d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })),
    created: Date.now(), modified: Date.now(),
    ratio: o.ratio || 'original', res: o.res || 1080, fps: o.fps || 30, orig: o.orig || null,
    width: 1920, height: 1080,
    bg: { type: 'color', color: '#000000', blur: .6, mediaId: null },
    tracks: [{ id: uid('t'), kind: 'main', name: 'Utama' }],
    clips: [], media: [], markers: [], fonts: [],
    thumb: null, duration: 0,
  };
  if (!o.ratio && !o.orig && innerWidth < 900) p.orig = { w: 9, h: 16 };
  applySize(p);
  return p;
}
function applySize(p) { const s = computeSize(p.ratio, p.res, p.orig); p.width = s.W; p.height = s.H; }
function trackById(id) { return P().tracks.find(t => t.id === id); }
function clipById(id) { return P() && P().clips.find(c => c.id === id); }
function mediaById(id) { return P() && P().media.find(m => m.id === id); }
function clipEnd(c) { return c.start + c.dur; }
function clipsOn(tid) { return P().clips.filter(c => c.trackId === tid).sort((a, b) => a.start - b.start); }
function projDuration(p = P()) { let d = 0; if (!p) return 0; for (const c of p.clips) d = Math.max(d, c.start + c.dur); return d; }
function mainTrack(p = P()) { return p.tracks.find(t => t.kind === 'main'); }
function isVisual(c) { return c.type !== 'audio'; }
function hasMediaAudio(c) { if (c.type !== 'video' && c.type !== 'audio') return false; const m = mediaById(c.mediaId); return !!m && m.hasAudio !== false; }

function addTrack(kind, opts = {}) {
  const p = P();
  const t = { id: uid('t'), kind, name: TRACK_NAMES[kind] };
  if (opts.after) {
    const i = p.tracks.indexOf(opts.after);
    p.tracks.splice(i + 1, 0, t);
  } else if (opts.before) {
    const i = p.tracks.indexOf(opts.before);
    p.tracks.splice(Math.max(0, i), 0, t);
  } else if (kind === 'audio') p.tracks.push(t);
  else {
    // trek visual baru di atas trek visual tertinggi dengan urutan: video < text < effect
    const order = { main: 0, video: 1, text: 2, effect: 3 };
    let idx = 0;
    p.tracks.forEach((x, i) => { if (x.kind !== 'audio' && order[x.kind] <= order[kind]) idx = i + 1; });
    p.tracks.splice(idx, 0, t);
  }
  return t;
}
function overlaps(tid, start, end, excludeIds) {
  return P().clips.some(c => c.trackId === tid && !(excludeIds && excludeIds.has(c.id)) && c.start < end - 1e-4 && c.start + c.dur > start + 1e-4);
}
function freeTrackFor(type, start, end, prefer) {
  const kind = trackKindFor(type);
  const p = P();
  if (prefer && TRACK_ACCEPT[prefer.kind].includes(type) && !overlaps(prefer.id, start, end)) return prefer;
  const cands = p.tracks.filter(t => (t.kind === kind) && !t.locked);
  for (const t of cands) if (!overlaps(t.id, start, end)) return t;
  return addTrack(kind);
}
function removeEmptyTracks() {
  const p = P();
  p.tracks = p.tracks.filter(t => t.kind === 'main' || p.clips.some(c => c.trackId === t.id));
}
function compactMain() {
  if (!S.magnet) return;
  const mt = mainTrack(); if (!mt) return;
  let t = 0;
  for (const c of clipsOn(mt.id)) { c.start = t; t += c.dur; }
}
function defaultVisual() {
  return { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, flipH: false, flipV: false, crop: { l: 0, t: 0, r: 0, b: 0 }, fit: 'fit', blend: 'normal', adj: {}, filter: null, fx: [], chroma: null, mask: null, anim: {}, kf: {} };
}
function newClip(type, props) {
  const c = { id: uid('c'), type, trackId: null, start: 0, dur: 3, name: '' };
  if (type === 'video' || type === 'image' || type === 'text' || type === 'sticker') Object.assign(c, defaultVisual());
  if (type === 'video' || type === 'audio') Object.assign(c, { in: 0, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, voice: 'none', keepPitch: true, muted: false });
  if (type === 'text') Object.assign(c, { text: 'Teks Anda', style: makeTextStyle(), y: 0 });
  if (type === 'effect') Object.assign(c, { fxId: 'shake', int: 1, speed: 1 });
  if (type === 'filter') Object.assign(c, { filterId: 'vivid', int: 1 });
  if (type === 'adjust') Object.assign(c, { adj: {} });
  return Object.assign(c, props || {});
}
function clipName(c) {
  if (c.type === 'text') return (c.text || '').split('\n')[0] || 'Teks';
  if (c.type === 'sticker') return c.sk.type === 'emoji' ? c.sk.v : (c.sk.type === 'shape' ? (SHAPES.find(s => s.id === c.sk.v) || {}).n : (SVG_STICKER_BY_ID[c.sk.v] || {}).n) || 'Stiker';
  if (c.type === 'effect') return (EFFECT_BY_ID[c.fxId] || {}).n || 'Efek';
  if (c.type === 'filter') return (FILTER_BY_ID[c.filterId] || {}).n || 'Filter';
  if (c.type === 'adjust') return 'Penyesuaian';
  const m = mediaById(c.mediaId); return c.name || (m ? m.name : 'Media');
}

/* ---------------- riwayat ---------------- */
const Hist = {
  undo: [], redo: [], max: 100,
  save() {
    if (!P()) return;
    this.undo.push(JSON.stringify(P()));
    if (this.undo.length > this.max) this.undo.shift();
    this.redo.length = 0;
    App.updateUndo();
  },
  restore(str) {
    const cur = P();
    const p = JSON.parse(str);
    p.id = cur.id;
    S.project = p;
    for (const id of [...S.sel]) if (!clipById(id)) S.sel.delete(id);
    if (S.selCut && !clipById(S.selCut)) S.selCut = null;
    Media.ensureLoaded(p).then(() => App.changed({ tl: true, insp: true, ratio: true }));
    App.changed({ tl: true, insp: true, ratio: true });
  },
  doUndo() { if (!this.undo.length) return; this.redo.push(JSON.stringify(P())); this.restore(this.undo.pop()); App.updateUndo(); toast('Diurungkan', null, 900); },
  doRedo() { if (!this.redo.length) return; this.undo.push(JSON.stringify(P())); this.restore(this.redo.pop()); App.updateUndo(); toast('Diulangi', null, 900); },
  reset() { this.undo = []; this.redo = []; App.updateUndo(); },
};

/* ---------------- simpan otomatis & proyek ---------------- */
const Store = {
  lastThumb: 0,
  saving: false,
  saveSoon: debounce(() => Store.saveNow(), 900),
  async saveNow() {
    const p = P(); if (!p) return;
    p.modified = Date.now();
    p.duration = projDuration(p);
    if (Date.now() - this.lastThumb > 8000 || !p.thumb) {
      const t = Renderer.thumbnail(); if (t) { p.thumb = t; this.lastThumb = Date.now(); }
    }
    App.setSaveState('saving');
    try { await DB.put('projects', JSON.parse(JSON.stringify(p))); App.setSaveState('saved'); }
    catch (e) { console.error(e); App.setSaveState('error'); }
  },
  async listProjects() { return (await DB.all('projects')).sort((a, b) => b.modified - a.modified); },
  async addMediaKey(pid, mid) {
    const k = 'pm:' + pid; const arr = (await DB.get('kv', k)) || [];
    if (!arr.includes(mid)) { arr.push(mid); await DB.put('kv', arr, k); }
  },
  async deleteProject(id) {
    const keys = (await DB.get('kv', 'pm:' + id)) || [];
    for (const m of keys) { await DB.del('blobs', m); await DB.del('derived', m); }
    await DB.del('kv', 'pm:' + id);
    await DB.del('projects', id);
  },
  async duplicateProject(id) {
    const p = await DB.get('projects', id); if (!p) return;
    const np = deepClone(p); np.id = uid('p'); np.name = p.name + ' (salinan)'; np.created = np.modified = Date.now();
    const map = {};
    for (const m of np.media) {
      const nid = uid('m'); map[m.id] = nid;
      const b = await DB.get('blobs', m.id); if (b) await DB.put('blobs', b, nid);
      const d = await DB.get('derived', m.id); if (d) await DB.put('derived', d, nid);
      m.id = nid; await this.addMediaKey(np.id, nid);
    }
    remapMedia(np, map);
    await DB.put('projects', np);
  },
  /* format file proyek: "KLMCUT01" + uint32 panjang JSON + JSON + blob media berurutan */
  async exportFile(p) {
    const parts = []; const meta = { project: p, blobs: [] };
    let off = 0;
    for (const m of p.media) {
      const b = await DB.get('blobs', m.id); if (!b) continue;
      meta.blobs.push({ id: m.id, off, size: b.size, type: b.type }); parts.push(b); off += b.size;
    }
    const json = new TextEncoder().encode(JSON.stringify(meta));
    const head = new Uint8Array(12); head.set(new TextEncoder().encode('KLMCUT01'), 0);
    new DataView(head.buffer).setUint32(8, json.length, true);
    return new Blob([head, json, ...parts], { type: 'application/octet-stream' });
  },
  async importFile(file) {
    const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    if (new TextDecoder().decode(head.slice(0, 8)) !== 'KLMCUT01') throw new Error('Bukan file proyek KLM Cut');
    const len = new DataView(head.buffer).getUint32(8, true);
    const meta = JSON.parse(await file.slice(12, 12 + len).text());
    const base = 12 + len;
    const p = meta.project; p.id = uid('p'); p.modified = Date.now();
    const map = {};
    for (const b of meta.blobs) {
      const nid = uid('m'); map[b.id] = nid;
      const blob = file.slice(base + b.off, base + b.off + b.size, b.type);
      await DB.put('blobs', new Blob([blob], { type: b.type }), nid);
      await this.addMediaKey(p.id, nid);
    }
    p.media.forEach(m => { if (map[m.id]) m.id = map[m.id]; });
    remapMedia(p, map);
    await DB.put('projects', p);
    return p;
  },
};
function remapMedia(p, map) {
  for (const c of p.clips) if (c.mediaId && map[c.mediaId]) c.mediaId = map[c.mediaId];
  if (p.bg && p.bg.mediaId && map[p.bg.mediaId]) p.bg.mediaId = map[p.bg.mediaId];
  if (p.fonts) p.fonts.forEach(f => { if (map[f.mediaId]) f.mediaId = map[f.mediaId]; });
}
