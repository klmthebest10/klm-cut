'use strict';
/* =========================================================
   KLM Cut — aplikasi: beranda, editor, aksi edit, HP, pintasan, boot
   ========================================================= */
const Act = {
  sel() { return [...S.sel].map(clipById).filter(Boolean); },
  one() { const s = this.sel(); return s.length === 1 ? s[0] : null; },
  lt(c) { return clamp(S.time - c.start, 0, c.dur); },
  /* ----- keyframe ----- */
  setProp(c, prop, v) {
    const arr = c.kf && c.kf[prop];
    if (arr && arr.length) {
      const lt = this.lt(c), eps = .5 / P().fps;
      const k = arr.find(f => Math.abs(f.t - lt) < eps);
      if (k) k.v = v; else { arr.push({ t: lt, v }); arr.sort((a, b) => a.t - b.t); }
    } else c[prop] = v;
  },
  kfState(c, prop) {
    const arr = c.kf && c.kf[prop]; if (!arr || !arr.length) return 'none';
    const lt = this.lt(c), eps = .5 / P().fps;
    return arr.some(f => Math.abs(f.t - lt) < eps) ? 'at' : 'has';
  },
  toggleKf(c, prop) {
    c.kf = c.kf || {};
    const lt = this.lt(c), eps = .5 / P().fps;
    const arr = c.kf[prop] || [];
    const i = arr.findIndex(f => Math.abs(f.t - lt) < eps);
    if (i >= 0) { const v = arr[i].v; arr.splice(i, 1); if (!arr.length) { delete c.kf[prop]; c[prop] = v; } }
    else { arr.push({ t: lt, v: Comp.kfVal(c, prop, lt) }); arr.sort((a, b) => a.t - b.t); c.kf[prop] = arr; }
  },
  hasKf(c) { return !!(c.kf && Object.values(c.kf).some(a => a && a.length)); },
  addKeyframe(c) {
    c = c || this.one();
    if (!c || !['video', 'image', 'text', 'sticker', 'audio'].includes(c.type)) { toast('Pilih satu klip dulu'); return; }
    if (S.time < c.start || S.time > clipEnd(c)) { toast('Pindahkan playhead ke dalam klip'); return; }
    Hist.save();
    const props = c.type === 'audio' ? ['volume'] : c.type === 'video' ? ['x', 'y', 'scale', 'rotation', 'opacity', 'volume'] : ['x', 'y', 'scale', 'rotation', 'opacity'];
    for (const p of props) if (this.kfState(c, p) !== 'at') this.toggleKf(c, p);
    App.changed({ tl: true, insp: true });
    toast('Keyframe ditambahkan', null, 1200);
  },
  jumpKf(c, dir) {
    const ts = [...new Set(Object.values(c.kf || {}).flat().map(f => f.t))].sort((a, b) => a - b);
    const lt = S.time - c.start, eps = .5 / P().fps;
    const t = dir > 0 ? ts.find(x => x > lt + eps) : [...ts].reverse().find(x => x < lt - eps);
    if (t != null) Engine.seek(c.start + t); else toast('Tidak ada keyframe ' + (dir > 0 ? 'berikutnya' : 'sebelumnya'), null, 1000);
  },
  /* ----- potong / hapus ----- */
  targetsAt(t) {
    const s = this.sel().filter(c => t > c.start + 1e-3 && t < clipEnd(c) - 1e-3);
    if (s.length) return s;
    const mt = mainTrack(); const c = clipsOn(mt.id).find(c => t > c.start + 1e-3 && t < clipEnd(c) - 1e-3);
    return c ? [c] : [];
  },
  splitClip(c, t) {
    if (t <= c.start + 1e-3 || t >= clipEnd(c) - 1e-3) return null;
    const r = deepClone(c); r.id = uid('c');
    const d = t - c.start;
    const u = d / c.dur;
    if ('in' in c) r.in = Engine.mediaTime(c, t);
    if (c.curve) { const pts = c.curve.pts; c.curve = { id: 'custom', pts: Curve.resample(pts, 0, u) }; r.curve = { id: 'custom', pts: Curve.resample(pts, u, 1) }; }
    r.start = t; r.dur = c.dur - d; c.dur = d;
    if (c.kf) {
      for (const k in c.kf) {
        const v = Comp.kfVal(Object.assign({}, c, { dur: c.dur + r.dur }), k, d);
        const L = c.kf[k].filter(f => f.t <= d); L.push({ t: d, v });
        const R = r.kf[k].filter(f => f.t >= d).map(f => ({ t: f.t - d, v: f.v })); R.unshift({ t: 0, v });
        c.kf[k] = L.filter((f, i, a) => i === a.findIndex(x => Math.abs(x.t - f.t) < 1e-4));
        r.kf[k] = R.filter((f, i, a) => i === a.findIndex(x => Math.abs(x.t - f.t) < 1e-4));
      }
    }
    if (c.anim) { delete c.anim.out; if (r.anim) delete r.anim.in; }
    r.trans = null;
    if ('fadeOut' in c) { r.fadeIn = 0; c.fadeOut = 0; }
    P().clips.push(r);
    return r;
  },
  split() {
    const ts = this.targetsAt(S.time);
    if (!ts.length) { toast('Arahkan playhead ke dalam klip untuk memotong'); return; }
    Hist.save();
    const nw = ts.map(c => this.splitClip(c, S.time)).filter(Boolean);
    App.select(nw.map(c => c.id));
    App.changed({ tl: true, insp: true });
  },
  trimAt(side) {
    const ts = this.targetsAt(S.time);
    if (!ts.length) { toast('Arahkan playhead ke dalam klip'); return; }
    Hist.save();
    for (const c of ts) {
      if (side === 'l') {
        const d = S.time - c.start;
        if ('in' in c) c.in = Engine.mediaTime(c, S.time);
        c.start = S.time; c.dur -= d;
        if (c.kf) for (const k in c.kf) c.kf[k].forEach(f => f.t -= d);
      } else c.dur = S.time - c.start;
    }
    compactMain();
    if (side === 'l' && S.magnet && ts.some(c => trackById(c.trackId).kind === 'main')) Engine.seek(ts[0].start);
    App.changed({ tl: true, insp: true });
  },
  del() {
    if (S.selCut) { const c = clipById(S.selCut); if (c && c.trans) { Hist.save(); c.trans = null; S.selCut = null; App.changed({ tl: true, insp: true }); } return; }
    const s = this.sel(); if (!s.length) return;
    Hist.save();
    const ids = new Set(s.map(c => c.id));
    P().clips = P().clips.filter(c => !ids.has(c.id));
    ids.forEach(id => Engine.dropClip(id));
    S.sel.clear();
    compactMain(); removeEmptyTracks();
    App.changed({ tl: true, insp: true });
  },
  duplicate() {
    const s = this.sel(); if (!s.length) return;
    Hist.save();
    const nw = [];
    for (const c of s.sort((a, b) => a.start - b.start)) {
      const n = deepClone(c); n.id = uid('c'); n.trans = null;
      const tr = trackById(c.trackId);
      if (tr.kind === 'main' && S.magnet) {
        n.start = clipEnd(c);
        for (const x of clipsOn(tr.id)) if (x.start >= clipEnd(c) - 1e-4) x.start += c.dur;
        n.trackId = tr.id;
      } else {
        n.start = clipEnd(c);
        n.trackId = freeTrackFor(c.type, n.start, clipEnd(n), tr).id;
      }
      P().clips.push(n); nw.push(n);
    }
    compactMain();
    App.select(nw.map(c => c.id));
    App.changed({ tl: true, insp: true });
  },
  copy() { const s = this.sel(); if (!s.length) return; const t0 = Math.min(...s.map(c => c.start)); S.clipboard = s.map(c => Object.assign(deepClone(c), { _off: c.start - t0 })); toast(s.length + ' klip disalin', null, 1000); },
  cut() { this.copy(); this.del(); },
  paste() {
    if (!S.clipboard || !S.clipboard.length) return;
    Hist.save();
    const nw = [];
    for (const src of S.clipboard) {
      if (src.mediaId && !mediaById(src.mediaId)) continue;
      const n = deepClone(src); delete n._off; n.id = uid('c'); n.trans = null;
      n.start = S.time + src._off;
      const tr = trackById(src.trackId);
      if (tr && tr.kind === 'main' && S.magnet) {
        const arr = clipsOn(tr.id); let idx = arr.findIndex(x => S.time < x.start + x.dur / 2); if (idx < 0) idx = arr.length;
        arr.splice(idx, 0, n); n.trackId = tr.id; P().clips.push(n);
        let t = 0; for (const x of arr) { x.start = t; t += x.dur; }
      } else { n.trackId = freeTrackFor(n.type, n.start, clipEnd(n), tr).id; P().clips.push(n); }
      nw.push(n);
    }
    App.select(nw.map(c => c.id));
    App.changed({ tl: true, insp: true });
  },
  async freeze() {
    const c = this.sel().find(x => x.type === 'video') || this.targetsAt(S.time).find(x => x.type === 'video');
    if (!c || S.time < c.start || S.time >= clipEnd(c)) { toast('Pilih klip video & posisikan playhead di frame yang ingin dibekukan'); return; }
    const m = mediaById(c.mediaId);
    await Engine.renderAt(S.time);
    const el = Engine.clipEl(c).el;
    const s = Math.min(1, 1920 / Math.max(m.w, m.h));
    const cv = document.createElement('canvas'); cv.width = Math.round(m.w * s); cv.height = Math.round(m.h * s);
    try { cv.getContext('2d').drawImage(el, 0, 0, cv.width, cv.height); } catch (e) { toast('Gagal mengambil frame', 'err'); return; }
    const blob = await canvasToBlob(cv, 'image/jpeg', .92);
    const im = await Media.addBlob(blob, 'Beku ' + fmtTC(S.time, P().fps).replace(/:/g, '.') + '.jpg', 'image');
    Hist.save();
    const t = S.time, FD = 3;
    const right = this.splitClip(c, t);
    const tr = trackById(c.trackId);
    for (const x of P().clips) if (x.trackId === tr.id && x !== c && x.start >= t - 1e-4) x.start += FD;
    const f = newClip('image', { mediaId: im.id, start: t, dur: FD, trackId: tr.id, name: im.name });
    for (const k of ['x', 'y', 'scale', 'rotation', 'opacity', 'flipH', 'flipV', 'crop', 'fit', 'blend', 'adj', 'filter', 'mask', 'chroma']) if (c[k] !== undefined) f[k] = deepClone(c[k]);
    P().clips.push(f);
    void right;
    compactMain();
    App.onMediaChanged();
    App.select([f.id]);
    App.changed({ tl: true, insp: true });
    toast('Frame dibekukan 3 detik');
  },
  mirror(c) { const s = c ? [c] : this.sel().filter(x => x.flipH !== undefined); if (!s.length) return; Hist.save(); s.forEach(x => x.flipH = !x.flipH); App.changed({ insp: true }); },
  rotate90(c) {
    const s = c ? [c] : this.sel().filter(x => x.rotation !== undefined); if (!s.length) return;
    Hist.save(); s.forEach(x => { const r = Comp.kfVal(x, 'rotation', this.lt(x)); this.setProp(x, 'rotation', ((Math.round(r / 90) * 90 + 90 + 180) % 360) - 180); });
    App.changed({ insp: true });
  },
  extractAudio(c) {
    c = c || this.sel().find(x => x.type === 'video');
    if (!c || c.type !== 'video') { toast('Pilih klip video'); return; }
    if (!hasMediaAudio(c)) { toast('Video ini tidak memiliki audio'); return; }
    Hist.save();
    const a = newClip('audio', { mediaId: c.mediaId, start: c.start, dur: c.dur, in: c.in, speed: c.speed, curve: c.curve ? deepClone(c.curve) : null, volume: c.volume, fadeIn: c.fadeIn, fadeOut: c.fadeOut, voice: c.voice, keepPitch: c.keepPitch, name: clipName(c) + ' (audio)' });
    if (c.kf && c.kf.volume) a.kf = { volume: deepClone(c.kf.volume) };
    a.trackId = freeTrackFor('audio', a.start, clipEnd(a)).id;
    P().clips.push(a);
    c.muted = true;
    App.select([a.id]);
    App.changed({ tl: true, insp: true });
    toast('Audio dipisahkan ke trek audio');
  },
  setSpeed(c, v) {
    v = clamp(v, .1, 16);
    if (c.curve) Pro.setCurve(c, null);
    const old = c.speed || 1; const span = c.dur * old;
    const m = mediaById(c.mediaId);
    c.speed = v;
    let nd = span / v;
    if (m && m.duration) nd = Math.min(nd, (m.duration - c.in) / v);
    const ratio = nd / c.dur;
    c.dur = Math.max(1 / P().fps, nd);
    if (c.kf) for (const k in c.kf) c.kf[k].forEach(f => f.t *= ratio);
    c.fadeIn = Math.min(c.fadeIn || 0, c.dur); c.fadeOut = Math.min(c.fadeOut || 0, c.dur);
    compactMain();
    Comp.invalidate();
  },
  setRatio(id) {
    const p = P(); Hist.save();
    p.ratio = id;
    if (id === 'original') {
      const first = clipsOn(mainTrack().id).find(c => c.type === 'video' || c.type === 'image');
      const m = first && mediaById(first.mediaId);
      p.orig = m ? { w: m.w, h: m.h } : (p.orig || { w: 16, h: 9 });
    }
    applySize(p);
    App.changed({ ratio: true, insp: true });
    if (App.sheetPanel) App.reopenSheet();
  },
  addMarker() {
    const p = P(); p.markers = p.markers || [];
    Hist.save();
    const ex = p.markers.find(m => Math.abs(m.t - S.time) < 1 / p.fps);
    if (ex) p.markers = p.markers.filter(m => m !== ex);
    else p.markers.push({ t: S.time, color: ['#ffc93c', '#5aa8ff', '#3ddc97', '#ff5d62', '#c084fc'][p.markers.length % 5] });
    App.changed({ tl: true });
  },
  addClipFx(c, id) {
    c.fx = c.fx || [];
    if (c.fx.some(f => f.id === id)) { toast('Efek sudah ada di klip ini'); return; }
    Hist.save(); c.fx.push({ id, int: 1, speed: 1 });
    App.changed({ insp: true });
    toast('Efek "' + EFFECT_BY_ID[id].n + '" diterapkan ke klip', null, 1500);
  },
  setClipFilter(c, id) {
    Hist.save(); c.filter = { id, int: c.filter ? c.filter.int : 1 };
    App.changed({ insp: true });
  },
  applyTransition(cutId, id, dur) {
    const c = clipById(cutId); if (!c) return false;
    Hist.save(); c.trans = { id, dur: dur || .6 };
    S.selCut = cutId;
    App.changed({ tl: true, insp: true });
    return true;
  },
  applyTransitionFromSelection(id, dur) {
    const c = this.one();
    if (!c || !(c.type === 'video' || c.type === 'image')) { toast('Pilih titik potong atau klip video dulu'); return false; }
    const arr = clipsOn(c.trackId);
    const next = arr.find(x => Math.abs(x.start - clipEnd(c)) < .02 && (x.type === 'video' || x.type === 'image'));
    if (next) return this.applyTransition(next.id, id, dur);
    const prev = arr.find(x => Math.abs(clipEnd(x) - c.start) < .02 && (x.type === 'video' || x.type === 'image'));
    if (prev) return this.applyTransition(c.id, id, dur);
    toast('Klip ini tidak bersebelahan dengan klip lain'); return false;
  },
  applyTransitionNear(c, id, t) {
    const arr = clipsOn(c.trackId);
    const prev = arr.find(x => Math.abs(clipEnd(x) - c.start) < .02);
    const next = arr.find(x => Math.abs(x.start - clipEnd(c)) < .02);
    if (prev && (!next || Math.abs(t - c.start) < Math.abs(t - clipEnd(c)))) return this.applyTransition(c.id, id, Panels.transDur);
    if (next) return this.applyTransition(next.id, id, Panels.transDur);
    toast('Seret transisi ke dekat titik potong antar klip');
  },
  transitionAll(id, dur) {
    Hist.save(); let n = 0;
    for (const tr of P().tracks) {
      if (tr.kind !== 'main' && tr.kind !== 'video') continue;
      const arr = clipsOn(tr.id);
      for (let i = 1; i < arr.length; i++) if (Math.abs(clipEnd(arr[i - 1]) - arr[i].start) < .02 && (arr[i].type === 'video' || arr[i].type === 'image') && (arr[i - 1].type === 'video' || arr[i - 1].type === 'image')) { arr[i].trans = { id, dur }; n++; }
    }
    App.changed({ tl: true, insp: true });
    toast(n ? `Transisi diterapkan ke ${n} potongan` : 'Belum ada potongan antar klip');
  },
  pickColor(c, cb) {
    toast('Ketuk warna pada pratinjau', null, 2500);
    if (document.body.classList.contains('is-m')) App.closeSheet();
    Preview.pick = async (px, py) => {
      const was = c.chroma && c.chroma.on; if (c.chroma) c.chroma.on = false;
      Engine.render();
      const k = Renderer.W / P().width;
      const g = h('canvas', { width: 1, height: 1 }).getContext('2d');
      g.drawImage(Renderer.canvas, Math.floor(px * k), Math.floor(py * k), 1, 1, 0, 0, 1, 1);
      const d = g.getImageData(0, 0, 1, 1).data;
      if (c.chroma) c.chroma.on = was;
      cb('#' + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, '0')).join(''));
    };
  },
  detectBeats(c) {
    const rt = Media.get(c.mediaId); if (!rt || !rt.peaks) { toast('Waveform belum siap, coba lagi sebentar'); return; }
    const pk = rt.peaks, pps = rt.pps, spd = clipAvgSpeed(c);
    const i0 = Math.floor(c.in * pps), i1 = Math.min(pk.length, Math.floor((c.in + c.dur * spd) * pps));
    const win = Math.round(pps * .8);
    const beats = []; let last = -1e9;
    for (let i = i0 + 1; i < i1; i++) {
      let sum = 0, n = 0; for (let j = Math.max(i0, i - win); j < i; j++) { sum += pk[j]; n++; }
      const avg = n ? sum / n : 0;
      if (pk[i] > avg * 1.45 && pk[i] > .15 && pk[i] >= pk[i - 1] && (i - last) / pps > .28) { beats.push(i); last = i; }
    }
    if (!beats.length) { toast('Tidak ada ketukan jelas yang terdeteksi'); return; }
    Hist.save();
    const p = P(); p.markers = p.markers || [];
    for (const i of beats) { const t = c.start + (i / pps - c.in) / spd; if (!p.markers.some(m => Math.abs(m.t - t) < .05)) p.markers.push({ t, color: '#5aa8ff' }); }
    App.changed({ tl: true });
    toast(beats.length + ' ketukan ditandai — klip akan menempel ke penanda');
  },
  normalize(c) {
    const rt = Media.get(c.mediaId); if (!rt || !rt.peaks) { toast('Waveform belum siap'); return; }
    let mx = 0; const i0 = Math.floor(c.in * rt.pps), i1 = Math.min(rt.peaks.length, Math.floor((c.in + c.dur * clipAvgSpeed(c)) * rt.pps));
    for (let i = i0; i < i1; i++) mx = Math.max(mx, rt.peaks[i]);
    if (mx < .01) return;
    Hist.save(); c.volume = clamp(.95 / mx, .1, 2); if (c.kf) delete c.kf.volume;
    App.changed({ tl: true, insp: true });
    toast('Volume dinormalisasi ke ' + Math.round(c.volume * 100) + '%');
  },
  async replaceMedia(c) {
    c = c || this.one(); if (!c || !c.mediaId) return;
    const f = await pickFiles(c.type === 'audio' ? 'audio/*' : 'video/*,image/*', false); if (!f.length) return;
    const ms = await Media.importFiles(f, { toast: false }); const m = ms[0]; if (!m) return;
    if ((m.type === 'audio') !== (c.type === 'audio')) { toast('Jenis media tidak cocok', 'err'); return; }
    Hist.save();
    c.mediaId = m.id; c.type = m.type; c.name = m.name; c.in = 0;
    if (m.type !== 'image' && m.duration) c.dur = Math.min(c.dur, m.duration / (c.speed || 1));
    if (m.type === 'image') { delete c.in; delete c.speed; }
    else if (!('speed' in c)) Object.assign(c, { in: 0, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, voice: 'none', keepPitch: true, muted: false });
    Engine.dropClip(c.id);
    compactMain();
    App.changed({ tl: true, insp: true });
  },
  openInspector(section) {
    const c = this.one(); if (!c) { toast('Pilih klip dulu'); return; }
    if (document.body.classList.contains('is-m')) { App.openSection(section, c); return; }
    const tabs = TABS[c.type] || []; const t = tabs.find(x => x[1].includes(section));
    if (t) { Insp.tabs[c.type] = t[0]; Insp.render(); }
  },
};

/* =========================================================
   App
   ========================================================= */
const MT_MAIN = [
  { ic: 'media', n: 'Edit', fn: () => App.mEdit() },
  { ic: 'plus', n: 'Media', fn: () => App.openPanel('media') },
  { ic: 'grid', n: 'Templat', fn: () => App.openPanel('templates') },
  { ic: 'music', n: 'Audio', fn: () => App.openPanel('audio') },
  { ic: 'text', n: 'Teks', fn: () => App.openPanel('text') },
  { ic: 'sticker', n: 'Stiker', fn: () => App.openPanel('sticker') },
  { ic: 'overlay', n: 'Hamparan', fn: () => App.openPanel('media', { mode: 'overlay', title: 'Tambah hamparan' }) },
  { ic: 'effects', n: 'Efek', fn: () => App.openPanel('effects') },
  { ic: 'transition', n: 'Transisi', fn: () => App.openPanel('transition') },
  { ic: 'filter', n: 'Filter', fn: () => App.openPanel('filter') },
  { ic: 'ratio', n: 'Format', fn: () => App.openSection('ratio') },
  { ic: 'canvas', n: 'Kanvas', fn: () => App.openSection('canvas') },
  { ic: 'adjust', n: 'Sesuaikan', fn: () => App.openPanel('adjust') },
  { ic: 'cc', n: 'Subtitle', fn: () => App.openPanel('captions') },
  { ic: 'settings', n: 'Proyek', fn: () => App.openSection('project') },
];
const MT_CLIP = {
  common: c => [
    { ic: 'split', n: 'Potong', fn: () => Act.split() },
    { ic: 'duplicate', n: 'Duplikat', fn: () => Act.duplicate() },
    { ic: 'trash', n: 'Hapus', fn: () => Act.del(), dng: true },
  ],
  video: c => [
    { ic: 'split', n: 'Potong', fn: () => Act.split() },
    { ic: 'speed', n: 'Kecepatan', fn: () => App.openSection('speed', c) },
    hasMediaAudio(c) ? { ic: 'volume', n: 'Volume', fn: () => App.openSection('audio', c) } : null,
    { ic: 'anim', n: 'Animasi', fn: () => App.openSection('anim', c) },
    { ic: 'trash', n: 'Hapus', fn: () => Act.del(), dng: true },
    { ic: 'effects', n: 'Efek', fn: () => { Panels.target = 'clip'; App.openPanel('effects'); } },
    { ic: 'filter', n: 'Filter', fn: () => { Panels.target = 'clip'; App.openPanel('filter'); } },
    { ic: 'adjust', n: 'Sesuaikan', fn: () => App.openSection('adjust', c) },
    { ic: 'overlay', n: 'Posisi', fn: () => App.openSection('transform', c) },
    { ic: 'opacity', n: 'Opasitas', fn: () => App.openSection('opacity', c) },
    { ic: 'crop', n: 'Crop', fn: () => App.openSection('crop', c) },
    { ic: 'mask', n: 'Masker', fn: () => App.openSection('mask', c) },
    { ic: 'chroma', n: 'Kunci Warna', fn: () => App.openSection('chroma', c) },
    { ic: 'transition', n: 'Transisi', fn: () => App.openPanel('transition') },
    c.type === 'video' && hasMediaAudio(c) ? { ic: 'wave', n: 'Pisah Audio', fn: () => Act.extractAudio(c) } : null,
    c.type === 'video' && hasMediaAudio(c) ? { ic: 'sfx', n: 'Ubah Suara', fn: () => App.openSection('voice', c) } : null,
    c.type === 'video' ? { ic: 'freeze', n: 'Bekukan', fn: () => Act.freeze() } : null,
    { ic: 'ai', n: 'Hapus Latar', fn: () => App.openSection('ai', c) },
    { ic: 'sticker', n: 'Retouch', fn: () => App.openSection('retouch', c) },
    { ic: 'filter', n: 'Warna AI', fn: () => App.openSection('autocolor', c) },
    c.type === 'video' ? { ic: 'reverse', n: 'Mundur', fn: () => Pro.reverse(c) } : null,
    c.type === 'video' ? { ic: 'anim', n: 'Stabilkan', fn: () => Pro.stabilize(c, .6) } : null,
    { ic: 'mask', n: 'Sensor', fn: () => Pro.censor(c) },
    c.type === 'video' && hasMediaAudio(c) ? { ic: 'wave', n: 'Audio Pro', fn: () => App.openSection('audiopro', c) } : null,
    { ic: 'flipH', n: 'Cermin', fn: () => Act.mirror(c) },
    { ic: 'rotate', n: 'Putar', fn: () => Act.rotate90(c) },
    { ic: 'kf', n: 'Keyframe', fn: () => Act.addKeyframe(c) },
    { ic: 'replace', n: 'Ganti', fn: () => Act.replaceMedia(c) },
    { ic: 'clipfx', n: 'Efek Klip', fn: () => App.openSection('clipfx', c) },
    { ic: 'duplicate', n: 'Duplikat', fn: () => Act.duplicate() },
  ],
  text: c => [
    { ic: 'edit', n: 'Edit', fn: () => App.openSection('text', c) },
    { ic: 'text', n: 'Gaya', fn: () => App.openSection('textstyle', c) },
    { ic: 'mic', n: 'Bacakan', fn: () => App.openSection('tts', c) },
    { ic: 'anim', n: 'Animasi', fn: () => App.openSection('anim', c) },
    { ic: 'overlay', n: 'Posisi', fn: () => App.openSection('transform', c) },
    { ic: 'opacity', n: 'Opasitas', fn: () => App.openSection('opacity', c) },
    { ic: 'kf', n: 'Keyframe', fn: () => Act.addKeyframe(c) },
    ...MT_CLIP.common(c),
  ],
  sticker: c => [
    { ic: 'sticker', n: 'Stiker', fn: () => App.openSection('sticker', c) },
    { ic: 'anim', n: 'Animasi', fn: () => App.openSection('anim', c) },
    { ic: 'overlay', n: 'Posisi', fn: () => App.openSection('transform', c) },
    { ic: 'opacity', n: 'Opasitas', fn: () => App.openSection('opacity', c) },
    { ic: 'kf', n: 'Keyframe', fn: () => Act.addKeyframe(c) },
    ...MT_CLIP.common(c),
  ],
  audio: c => [
    { ic: 'volume', n: 'Volume', fn: () => App.openSection('audio', c) },
    { ic: 'split', n: 'Potong', fn: () => Act.split() },
    { ic: 'speed', n: 'Kecepatan', fn: () => App.openSection('speed', c) },
    { ic: 'sfx', n: 'Ubah Suara', fn: () => App.openSection('voice', c) },
    { ic: 'beat', n: 'Ketukan', fn: () => Act.detectBeats(c) },
    { ic: 'wave', n: 'Audio Pro', fn: () => App.openSection('audiopro', c) },
    { ic: 'volume', n: 'Ducking', fn: () => Pro.autoDuck(c) },
    { ic: 'kf', n: 'Keyframe', fn: () => Act.addKeyframe(c) },
    { ic: 'replace', n: 'Ganti', fn: () => Act.replaceMedia(c) },
    { ic: 'duplicate', n: 'Duplikat', fn: () => Act.duplicate() },
    { ic: 'trash', n: 'Hapus', fn: () => Act.del(), dng: true },
  ],
  effect: c => [{ ic: 'effects', n: 'Atur Efek', fn: () => App.openSection('effectclip', c) }, ...MT_CLIP.common(c)],
  filter: c => [{ ic: 'filter', n: 'Atur Filter', fn: () => App.openSection('filterclip', c) }, ...MT_CLIP.common(c)],
  adjust: c => [{ ic: 'adjust', n: 'Atur', fn: () => App.openSection('adjustclip', c) }, ...MT_CLIP.common(c)],
};
MT_CLIP.image = MT_CLIP.video;

const App = {
  view: 'home', sheetPanel: null, mode: null, installEvt: null,
  async boot() {
    try { await DB.open(); } catch (e) { toast('Penyimpanan browser tidak tersedia — proyek tidak tersimpan', 'err', 6000); }
    try { const st = await DB.get('kv', 'settings'); if (st) Object.assign(S.settings, st); } catch (e) { }
    this.setupIcons();
    Renderer.init($('#pv-canvas'));
    Engine.init();
    Preview.init();
    TL.init($('#timeline'));
    this.bind();
    this.setMode(true);
    addEventListener('resize', debounce(() => this.setMode(), 120));
    this.setupPwa();
    await Home.render();
    await this.handleIncoming();
    this.desktopLink();
    this.androidLink();
    const m = location.hash.match(/#p=([\w]+)/);
    if (m) this.openProject(m[1]);
  },
  setupIcons() {
    setIcon($('#btn-back'), 'home'); setIcon($('#btn-undo'), 'undo'); setIcon($('#btn-redo'), 'redo');
    setIcon($('#btn-m-undo'), 'undo'); setIcon($('#btn-m-redo'), 'redo');
    setIcon($('#btn-help'), 'keyboard'); setIcon($('#btn-export'), 'upload', 'Ekspor');
    setIcon($('#btn-prev'), 'prev'); setIcon($('#btn-next'), 'next'); setIcon($('#btn-play'), 'play');
    setIcon($('#btn-snap'), 'image'); setIcon($('#btn-full'), 'full');
    setIcon($('#sheet-back'), 'chevD'); setIcon($('#sheet-ok'), 'check');
    setIcon($('#btn-home-settings'), 'settings'); setIcon($('#btn-install'), 'install', 'Pasang aplikasi');
    $('.nc-ico').append(icon('plus'));
    $$('[data-ico]').forEach(e => e.append(icon(e.dataset.ico)));
    $('.pe-ico').append(icon('media'));
    $('#sel-ratio').innerHTML = RATIOS.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
  },
  setMode(force) {
    const m = innerWidth < 900;
    const changed = m !== this.mode;
    this.mode = m;
    document.body.classList.toggle('is-m', m);
    if (!changed && !force) { if (P()) { TL.render(); Preview.layout(); } return; }
    if (!P()) return;
    TL.renderBar(); TL.render(); Insp.render(); Preview.layout();
    if (!m) { Panels.init(); this.closeSheet(); } else this.renderMToolbar();
  },
  bind() {
    $('#btn-new').onclick = () => this.newProject();
    $('#btn-open-file').onclick = async () => { const f = await pickFiles('.klmcut', false); if (f[0]) this.importProjectFile(f[0]); };
    $('#btn-quick-ratio').onclick = () => this.newProjectDialog();
    $('#btn-quick-help').onclick = () => this.showHelp();
    $('#btn-quick-tpl').onclick = () => Templates.open();
    $('#btn-home-settings').onclick = () => this.settingsDlg();
    $('#proj-search').oninput = () => Home.render();
    $('#btn-back').onclick = () => this.closeProject();
    $('#btn-undo').onclick = $('#btn-m-undo').onclick = () => Hist.doUndo();
    $('#btn-redo').onclick = $('#btn-m-redo').onclick = () => Hist.doRedo();
    $('#btn-play').onclick = () => Engine.toggle();
    $('#btn-prev').onclick = () => this.step(-1);
    $('#btn-next').onclick = () => this.step(1);
    $('#btn-export').onclick = () => Exporter.open();
    $('#btn-m-res').onclick = () => Exporter.open();
    $('#btn-help').onclick = () => this.showHelp();
    $('#btn-menu').onclick = e => this.fileMenu(e);
    $('#btn-snap').onclick = () => Exporter.exportFrame();
    $('#btn-full').onclick = () => { const el = $('#preview'); if (document.fullscreenElement) document.exitFullscreen(); else if (el.requestFullscreen) el.requestFullscreen().catch(() => { }); else toast('Layar penuh tidak didukung'); };
    document.addEventListener('fullscreenchange', () => setTimeout(() => Preview.layout(), 60));
    $('#btn-empty-import').onclick = () => { if (this.mode) this.openPanel('media'); else { Panels.show('media'); $('.dropzone') && $('.dropzone').click(); } };
    $('#sel-ratio').onchange = e => Act.setRatio(e.target.value);
    $('#sel-quality').value = S.settings.quality;
    $('#sel-quality').onchange = e => { S.settings.quality = e.target.value; this.saveSettings(); Preview.applyQuality(); };
    const nm = $('#proj-name');
    nm.addEventListener('change', () => { if (P()) { P().name = nm.value.trim() || P().name; nm.value = P().name; Store.saveSoon(); } });
    nm.addEventListener('keydown', e => { if (e.key === 'Enter') nm.blur(); e.stopPropagation(); });
    $('#sheet-ok').onclick = () => this.closeSheet();
    $('#sheet-back').onclick = () => this.closeSheet();
    // pengubah tinggi timeline
    const rz = $('#tl-resizer');
    rz.addEventListener('pointerdown', e => {
      e.preventDefault(); rz.classList.add('drag');
      const y0 = e.clientY, h0 = $('#timeline').getBoundingClientRect().height;
      const mv = ev => { const nh = clamp(h0 - (ev.clientY - y0), 150, innerHeight - 260); document.documentElement.style.setProperty('--tl-h', nh + 'px'); };
      const up = () => { rz.classList.remove('drag'); removeEventListener('pointermove', mv); removeEventListener('pointerup', up); TL.render(); };
      addEventListener('pointermove', mv); addEventListener('pointerup', up);
    });
    // seret & lepas file global
    let dragDepth = 0;
    addEventListener('dragenter', e => { if (Array.from(e.dataTransfer.types).includes('Files')) { dragDepth++; $('#drop-hint').classList.remove('hidden'); } });
    addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('#drop-hint').classList.add('hidden'); });
    addEventListener('dragover', e => { if (Array.from(e.dataTransfer.types).includes('Files')) e.preventDefault(); });
    addEventListener('drop', async e => {
      dragDepth = 0; $('#drop-hint').classList.add('hidden');
      const files = Array.from(e.dataTransfer.files || []); if (!files.length) return;
      e.preventDefault();
      await this.receiveFiles(files);
    });
    addEventListener('keydown', e => this.onKey(e));
    addEventListener('beforeunload', () => { if (P()) Store.saveNow(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && P()) { Store.saveNow(); if (Engine.playing && !Engine.exporting) Engine.pause(); } });
  },
  async receiveFiles(files) {
    const proj = files.find(f => /\.klmcut$/i.test(f.name));
    if (proj) { await this.importProjectFile(proj); return; }
    if (this.view !== 'editor') { await this.newProject({ silent: true }); }
    const ms = await Media.importFiles(files);
    if (this.view === 'editor' && ms.length && !P().clips.length) for (const m of ms) this.addMediaClip(m.id, {});
  },
  async handleIncoming() {
    const q = new URLSearchParams(location.search);
    if (q.has('share') && 'caches' in window) {
      try {
        const cache = await caches.open('klm-share');
        const keys = await cache.keys(); const files = [];
        for (const k of keys) { const r = await cache.match(k); const b = await r.blob(); files.push(new File([b], decodeURIComponent(k.url.split('/').pop()).replace(/^\d+-/, ''), { type: b.type })); await cache.delete(k); }
        history.replaceState(null, '', location.pathname);
        if (files.length) await this.receiveFiles(files);
      } catch (e) { console.warn(e); }
    }
    if (q.has('new')) { history.replaceState(null, '', location.pathname); await this.newProject(); }
    if ('launchQueue' in window) {
      launchQueue.setConsumer(async params => {
        if (!params.files || !params.files.length) return;
        const files = await Promise.all(params.files.map(f => f.getFile()));
        await this.receiveFiles(files);
      });
    }
  },
  /* mode aplikasi Windows (.exe): detak ke peluncur & terima file "Buka dengan" */
  async desktopLink() {
    if (!/^https?:/.test(location.protocol)) return;
    try { const r = await fetch('__klmcut', { cache: 'no-store' }); if (!r.ok || (await r.text()).trim() !== 'klmcut') return; } catch (e) { return; }
    this.isDesktopExe = true;
    const ping = async () => {
      try {
        const j = await (await fetch('__ping', { cache: 'no-store' })).json();
        if (j.pending > 0 && !this._pulling) {
          this._pulling = true;
          const list = await (await fetch('__pending', { cache: 'no-store' })).json();
          const files = [];
          for (const it of list) { const r = await fetch(it.url, { cache: 'no-store' }); if (!r.ok) continue; const b = await r.blob(); files.push(new File([b], it.name, { type: b.type })); }
          await fetch('__done', { cache: 'no-store' });
          if (files.length) await this.receiveFiles(files);
          this._pulling = false;
        }
      } catch (e) { this._pulling = false; }
    };
    ping(); setInterval(ping, 4000);
  },
  /* Android: terima file dari menu Bagikan / Buka dengan */
  androidLink() {
    const A = window.KLMAndroid; if (!A) return;
    const pull = async () => {
      if (this._apull) return; this._apull = true;
      try {
        const list = JSON.parse(A.takeShared() || '[]'); const files = [];
        for (const it of list) { const r = await fetch(it.url, { cache: 'no-store' }); if (!r.ok) continue; const b = await r.blob(); files.push(new File([b], it.name, { type: it.mime || b.type })); }
        if (files.length) await this.receiveFiles(files);
      } catch (e) { console.warn('android share', e); }
      this._apull = false;
    };
    window.KLMShared = pull; pull();
  },
  /* tombol kembali (Android / riwayat) */
  back() {
    const mb = $$('#modal-root .mbg').pop();
    if (mb) { const m = mb.querySelector('.modal'); if (m && m.close && !m.dataset.nodismiss) m.close(null); return 'handled'; }
    if (_ctx) { closeCtx(); return 'handled'; }
    if (this.sheetPanel) { this.closeSheet(); return 'handled'; }
    if (this.view === 'editor') {
      if (S.sel.size || S.selCut) { this.select([]); return 'handled'; }
      if (Engine.playing) { Engine.pause(); return 'handled'; }
      this.closeProject(); return 'handled';
    }
    return 'exit';
  },
  setupPwa() {
    window.KLMBack = () => this.back();
    if (window.KLMAndroid) {
      document.body.classList.add('is-android');
      $('#btn-install').classList.add('hidden');
      return;
    }
    if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW', e));
    addEventListener('beforeinstallprompt', e => { e.preventDefault(); this.installEvt = e; $('#btn-install').classList.remove('hidden'); });
    $('#btn-install').onclick = async () => {
      if (this.installEvt) { this.installEvt.prompt(); const r = await this.installEvt.userChoice; if (r.outcome === 'accepted') $('#btn-install').classList.add('hidden'); this.installEvt = null; }
      else modal({ title: 'Pasang KLM Cut', body: h('div', { class: 'hint', style: { fontSize: '13px', lineHeight: '1.7' } }, h('b', null, 'Android (Chrome): '), 'menu ⋮ → "Instal aplikasi" / "Tambahkan ke layar utama".', h('br'), h('b', null, 'iPhone (Safari): '), 'tombol Bagikan → "Tambah ke Layar Utama".', h('br'), h('b', null, 'PC (Chrome/Edge): '), 'ikon instal di bilah alamat, atau menu → "Instal KLM Cut".') });
    };
    addEventListener('appinstalled', () => { $('#btn-install').classList.add('hidden'); toast('KLM Cut terpasang'); });
    if (!matchMedia('(display-mode: standalone)').matches) $('#btn-install').classList.remove('hidden');
  },
  saveSettings() { DB.put('kv', S.settings, 'settings').catch(() => { }); },

  /* ---------- proyek ---------- */
  async newProject(o = {}) {
    const p = newProject(o);
    await DB.put('projects', p).catch(() => { });
    await this.openProject(p);
    if (!o.silent && !o.noPick && innerWidth < 900) this.openPanel('media');
  },
  async newProjectDialog() {
    let ratio = '16:9', res = 1080, fps = 30;
    const body = h('div', { class: 'sec-b', style: { padding: 0 } },
      UI.row('Rasio', UI.select(RATIOS.map(r => ({ value: r.id, label: r.name })), ratio, v => ratio = v)),
      UI.row('Resolusi', UI.select(RESOLUTIONS.map(r => ({ value: r.v, label: r.n })), '1080', v => res = +v)),
      UI.row('FPS', UI.select(FPS_LIST.map(f => ({ value: f, label: f + ' fps' })), '30', v => fps = +v)));
    const r = await modal({ title: 'Proyek baru', body, buttons: [{ label: 'Batal', value: null, cls: 'ghost' }, { label: 'Buat', value: 'ok', cls: 'accent' }] });
    if (r === 'ok') this.newProject({ ratio, res, fps, noPick: true });
  },
  async openProject(idOrP) {
    let p = typeof idOrP === 'string' ? await DB.get('projects', idOrP) : idOrP;
    if (!p) { toast('Proyek tidak ditemukan', 'err'); return; }
    Media.releaseAll(); Engine.dropAll(); Comp.invalidateText();
    S.project = p; S.sel.clear(); S.selCut = null; S.time = 0;
    p.tracks = p.tracks && p.tracks.length ? p.tracks : [{ id: uid('t'), kind: 'main', name: 'Utama' }];
    if (!mainTrack(p)) p.tracks.unshift({ id: uid('t'), kind: 'main', name: 'Utama' });
    p.markers = p.markers || []; p.fonts = p.fonts || [];
    Hist.reset();
    this.view = 'editor';
    $('#home').classList.add('hidden'); $('#editor').classList.remove('hidden');
    $('#proj-name').value = p.name;
    history.replaceState(null, '', '#p=' + p.id);
    this.setMode(true);
    Preview.layout();
    if (!this.mode) Panels.init();
    this.renderMToolbar();
    await Media.ensureLoaded(p);
    TL.fit();
    this.changed({ tl: true, insp: true, save: false, ratio: true });
    Panels.refresh();
    this.setSaveState('saved');
  },
  async closeProject() {
    if (!P()) return;
    Engine.pause();
    await Store.saveNow();
    Engine.dropAll(); Media.releaseAll();
    S.project = null; S.sel.clear();
    this.closeSheet();
    this.view = 'home';
    $('#editor').classList.add('hidden'); $('#home').classList.remove('hidden');
    history.replaceState(null, '', location.pathname);
    Home.render();
  },
  async importProjectFile(f) {
    try { const p = await Store.importFile(f); toast('Proyek "' + p.name + '" diimpor'); if (this.view === 'editor') await this.closeProject(); await this.openProject(p.id); }
    catch (e) { toast('Gagal membuka file proyek: ' + e.message, 'err', 4000); }
  },
  async exportProjectFile(id) {
    const p = id ? await DB.get('projects', id) : P();
    if (!p) return;
    if (!id) await Store.saveNow();
    toast('Menyiapkan file proyek…', null, 1500);
    const blob = await Store.exportFile(p);
    await saveBlob(blob, p.name.replace(/[\\/:*?"<>|]+/g, ' ') + '.klmcut', { picker: true });
  },

  /* ---------- pembaruan UI ---------- */
  changed(o = {}) {
    if (!P()) return;
    Comp.invalidate();
    if (o.ratio) { Preview.layout(); $('#sel-ratio').value = P().ratio; $('#btn-m-res').textContent = P().res >= 2160 ? '4K' : P().res >= 1440 ? '2K' : P().res + 'P'; Comp.invalidateText(); }
    if (o.tl) TL.render();
    if (o.insp) { Insp.render(); if (this.sheetPanel && this.sheetPanel.section) this.reopenSheet(); }
    this.renderMToolbar();
    Engine.requestRender();
    if (o.save !== false) Store.saveSoon();
    const empty = !P().clips.length;
    $('#pv-empty').classList.toggle('hidden', !empty);
    $('#t-dur').textContent = fmtTC(projDuration(), P().fps);
    if (S.time > projDuration()) Engine.seek(projDuration());
  },
  select(ids, keepCut) {
    S.sel = new Set(ids);
    if (!keepCut) S.selCut = null;
    TL.refreshSelection();
    Insp.render();
    Preview.updateOverlay();
    this.renderMToolbar();
    if (this.sheetPanel && this.sheetPanel.section) this.closeSheet();
  },
  selectCut(id) {
    S.sel.clear(); S.selCut = id;
    TL.render(); Insp.render(); this.renderMToolbar();
    const c = clipById(id); if (c) Engine.seek(c.start);
    this.openPanel('transition');
  },
  onTime(t, force) {
    if (!P()) return;
    $('#t-cur').textContent = fmtTC(t, P().fps);
    TL.updatePlayhead(Engine.playing);
    const now = performance.now();
    if (force || now - (this._lastInsp || 0) > 120) { this._lastInsp = now; Insp.refreshValues(); }
  },
  onPlayState() { setIcon($('#btn-play'), Engine.playing ? 'pause' : 'play'); },
  updateUndo() {
    const u = Hist.undo.length, r = Hist.redo.length;
    ['#btn-undo', '#btn-m-undo'].forEach(s => { const b = $(s); if (b) b.disabled = !u; });
    ['#btn-redo', '#btn-m-redo'].forEach(s => { const b = $(s); if (b) b.disabled = !r; });
  },
  setSaveState(s) { const el = $('#save-state'); if (el) el.textContent = s === 'saving' ? 'Menyimpan…' : s === 'error' ? 'Gagal menyimpan' : 'Tersimpan otomatis'; },
  onMediaChanged() { if (!this.mode && Panels.cur === 'media') Panels.refresh(); if (this.sheetPanel && this.sheetPanel.panel === 'media') this.reopenSheet(); },
  onMediaDerived: debounce(function () { if (!P()) return; TL.render(); if (Panels.cur === 'media' && !App.mode) Panels.refresh(); }, 300),
  refreshPanels() { Panels.refresh(); Insp.render(); },
  focusInspector(c) {
    if (c.type === 'text') {
      if (this.mode) { this.openSection('text', c); setTimeout(() => { const ta = $('#sheet-body textarea'); if (ta) { ta.focus(); ta.select(); } }, 250); }
      else { Insp.tabs.text = 'Teks'; Insp.render(); setTimeout(() => { if (Insp.textArea) { Insp.textArea.focus(); Insp.textArea.select(); } }, 30); }
    } else if (this.mode) this.renderMToolbar();
  },
  step(dir) { if (!P()) return; Engine.pause(); Engine.seek(Math.round(S.time * P().fps + dir) / P().fps); },

  /* ---------- tambah klip ---------- */
  adoptOriginal(m) {
    const p = P();
    if (p.ratio === 'original' && (m.type === 'video' || m.type === 'image') && !p.clips.some(c => c.type === 'video' || c.type === 'image')) {
      p.orig = { w: m.w, h: m.h }; applySize(p); return true;
    }
    return false;
  },
  addMediaClip(mediaId, o = {}) {
    const m = mediaById(mediaId); if (!m) return null;
    if (m.type === 'audio') return this.addAudioClip(mediaId, o.time);
    Hist.save();
    const ratio = this.adoptOriginal(m);
    const p = P();
    const dur = m.type === 'image' ? S.settings.imgDur : m.duration;
    const c = newClip(m.type, { mediaId, dur, name: m.name });
    const mt = mainTrack();
    let track;
    if (o.overlay) {
      c.start = S.time; c.scale = .7;
      track = freeTrackFor(c.type, c.start, c.start + dur, null);
      if (track.kind === 'main') track = addTrack('video');
    } else if (o.drop && o.track && TRACK_ACCEPT[o.track.kind].includes(c.type)) {
      track = o.track; c.start = o.time;
      if (track.kind === 'main' && S.magnet) { this.insertMain(c, o.time); this.finishAdd(c, ratio); return c; }
      if (overlaps(track.id, c.start, c.start + dur)) track = freeTrackFor(c.type, c.start, c.start + dur, null);
    } else if (o.drop) {
      c.start = o.time; track = freeTrackFor(c.type, c.start, c.start + dur, null);
      if (track.kind === 'main' && S.magnet && p.clips.some(x => x.trackId === mt.id)) { track = addTrack('video'); }
      else if (track.kind === 'main' && S.magnet) { this.insertMain(c, 0); this.finishAdd(c, ratio); return c; }
    } else if (o.atPlayhead) {
      const arr = clipsOn(mt.id);
      const under = arr.find(x => S.time >= x.start && S.time < clipEnd(x));
      let idx = under ? arr.indexOf(under) + (S.time - under.start > under.dur / 2 ? 1 : 0) : arr.filter(x => clipEnd(x) <= S.time + 1e-3).length;
      c.trackId = mt.id; arr.splice(idx, 0, c); p.clips.push(c);
      let t = 0; for (const x of arr) { if (S.magnet) x.start = t; t = x.start + x.dur; }
      if (!S.magnet) { c.start = idx ? clipEnd(arr[idx - 1]) : 0; for (let i = idx + 1; i < arr.length; i++) arr[i].start += c.dur; }
      this.finishAdd(c, ratio); Engine.seek(c.start); return c;
    } else {
      track = mt; const arr = clipsOn(mt.id);
      c.start = arr.length ? clipEnd(arr[arr.length - 1]) : 0;
    }
    c.trackId = track.id;
    p.clips.push(c);
    compactMain();
    this.finishAdd(c, ratio);
    return c;
  },
  insertMain(c, t) {
    const mt = mainTrack(); const arr = clipsOn(mt.id);
    let idx = arr.findIndex(x => t < x.start + x.dur / 2); if (idx < 0) idx = arr.length;
    c.trackId = mt.id; arr.splice(idx, 0, c); P().clips.push(c);
    let tt = 0; for (const x of arr) { x.start = tt; tt += x.dur; }
  },
  finishAdd(c, ratio) {
    this.select([c.id]);
    this.changed({ tl: true, insp: true, ratio });
    if (P().clips.length === 1) TL.fit();
  },
  addAudioClip(mediaId, at) {
    const m = mediaById(mediaId); if (!m) return null;
    Hist.save();
    const start = at != null ? at : S.time;
    const c = newClip('audio', { mediaId, start, dur: m.duration, name: m.name });
    c.trackId = freeTrackFor('audio', start, start + c.dur).id;
    P().clips.push(c);
    this.select([c.id]); this.changed({ tl: true, insp: true });
    return c;
  },
  addTextClip(styleOver, text, o = {}) {
    Hist.save();
    const c = newClip('text', { text: text || 'Teks Anda', style: makeTextStyle(styleOver || {}), start: S.time, dur: o.dur || S.settings.textDur, x: o.x || 0, y: o.y || 0, anim: o.anim ? deepClone(o.anim) : {}, cap: !!o.cap });
    if (projDuration() > 0 && c.start >= projDuration() - .05) c.start = Math.max(0, projDuration() - c.dur);
    c.trackId = freeTrackFor('text', c.start, clipEnd(c)).id;
    P().clips.push(c);
    Fonts.ensure(c.style.font);
    this.select([c.id]); this.changed({ tl: true, insp: true });
    Engine.seek(Math.max(S.time, c.start));
    this.focusInspector(c);
    return c;
  },
  addStickerClip(sk) {
    Hist.save();
    const c = newClip('sticker', { sk, start: S.time, dur: S.settings.textDur, scale: sk.type === 'shape' ? 1 : .8 });
    c.trackId = freeTrackFor('sticker', c.start, clipEnd(c)).id;
    P().clips.push(c);
    this.select([c.id]); this.changed({ tl: true, insp: true });
    return c;
  },
  addLayerClip(type, props) {
    Hist.save();
    const t = S.time;
    const mc = Comp.activeOn(mainTrack().id, t);
    const dur = props.dur || (mc ? Math.max(1, clipEnd(mc) - t) : 3);
    const c = newClip(type, Object.assign({ start: t, dur }, props));
    c.trackId = freeTrackFor(type, c.start, clipEnd(c)).id;
    P().clips.push(c);
    this.select([c.id]); this.changed({ tl: true, insp: true });
    return c;
  },
  addEffectClip(id, t) { if (t != null) S.time = t; return this.addLayerClip('effect', { fxId: id, dur: 3 }); },
  addFilterClip(id, t) { if (t != null) S.time = t; return this.addLayerClip('filter', { filterId: id }); },
  addAdjustClip() { return this.addLayerClip('adjust', { adj: {} }); },

  /* ---------- menu ---------- */
  clipMenu(x, y, c) {
    const v = c.type === 'video' || c.type === 'image';
    ctxMenu(x, y, [
      { label: 'Potong di playhead', icon: 'split', key: 'Ctrl+B', action: () => Act.split() },
      { label: 'Duplikat', icon: 'duplicate', key: 'Ctrl+D', action: () => Act.duplicate() },
      { label: 'Salin', icon: 'copy', key: 'Ctrl+C', action: () => Act.copy() },
      { label: 'Tempel', icon: 'paste', key: 'Ctrl+V', action: () => Act.paste(), disabled: !S.clipboard },
      { sep: true },
      c.type === 'video' ? { label: 'Bekukan frame', icon: 'freeze', action: () => Act.freeze() } : null,
      c.type === 'video' && hasMediaAudio(c) ? { label: 'Pisahkan audio', icon: 'wave', action: () => Act.extractAudio(c) } : null,
      'muted' in c ? { label: c.muted ? 'Bunyikan' : 'Bisukan', icon: c.muted ? 'volume' : 'mute', action: () => { Hist.save(); c.muted = !c.muted; this.changed({ tl: true, insp: true }); } } : null,
      c.mediaId ? { label: 'Ganti media', icon: 'replace', action: () => Act.replaceMedia(c) } : null,
      v ? { label: 'Tambah keyframe', icon: 'kf', action: () => Act.addKeyframe(c) } : null,
      v && P().bg ? { label: 'Atur sebagai latar buram', icon: 'bg', action: () => { Hist.save(); P().bg.type = 'blur'; this.changed({ insp: true }); } } : null,
      { sep: true },
      { label: 'Hapus', icon: 'trash', key: 'Del', danger: true, action: () => Act.del() },
    ]);
  },
  fileMenu(e) {
    const r = e.currentTarget.getBoundingClientRect();
    ctxMenu(r.left, r.bottom + 4, [
      { label: 'Proyek baru', icon: 'plus', action: async () => { await this.closeProject(); this.newProject(); } },
      { label: 'Impor media', icon: 'upload', key: 'Ctrl+I', action: () => this.importDialog() },
      { label: 'Simpan sekarang', icon: 'save', key: 'Ctrl+S', action: () => Store.saveNow().then(() => toast('Tersimpan')) },
      { sep: true },
      { label: 'Ekspor video', icon: 'upload', key: 'Ctrl+E', action: () => Exporter.open() },
      { label: 'Ekspor audio (WAV)', icon: 'music', action: () => Exporter.exportWav() },
      { label: 'Ambil foto frame (PNG)', icon: 'image', action: () => Exporter.exportFrame() },
      { label: 'Ekspor subtitle (SRT)', icon: 'srt', action: () => Captions.exportSrt() },
      { label: 'Simpan file proyek (.klmcut)', icon: 'save', action: () => this.exportProjectFile() },
      { sep: true },
      { label: 'Pengaturan', icon: 'settings', action: () => this.settingsDlg() },
      { label: 'Pintasan keyboard', icon: 'keyboard', action: () => this.showHelp() },
      { label: 'Kembali ke beranda', icon: 'home', action: () => this.closeProject() },
    ]);
  },
  async importDialog() {
    const f = await pickFiles('video/*,image/*,audio/*,.ttf,.otf,.woff,.woff2,.srt,.vtt');
    if (f.length) await Media.importFiles(f);
  },
  async settingsDlg() {
    const st = S.settings;
    const body = h('div', { class: 'sec-b', style: { padding: 0 } },
      UI.slider({ label: 'Durasi foto', min: 1, max: 15, step: .5, value: st.imgDur, onInput: v => st.imgDur = v }),
      UI.slider({ label: 'Durasi teks', min: 1, max: 15, step: .5, value: st.textDur, onInput: v => st.textDur = v }),
      UI.row('Pratinjau', UI.select([{ value: 'auto', label: 'Otomatis' }, { value: 'full', label: 'Penuh' }, { value: '720', label: '720p' }, { value: '480', label: '480p' }, { value: '360', label: '360p (HP lambat)' }], st.quality, v => { st.quality = v; $('#sel-quality').value = v; if (P()) Preview.applyQuality(); })),
      h('p', { class: 'hint' }, 'Semua proyek & media disimpan di perangkat ini (tidak diunggah ke server).'),
      h('div', { class: 'btn-row' }, UI.btn('Hapus semua data', 'trash', async () => {
        if (!(await confirmDlg('Hapus semua data?', 'Semua proyek dan media di aplikasi ini akan dihapus permanen.', 'Hapus semua', true))) return false;
        if (P()) await this.closeProject();
        const ps = await Store.listProjects(); for (const p of ps) await Store.deleteProject(p.id);
        toast('Semua data dihapus'); Home.render();
      }, 'danger')),
      h('p', { class: 'hint', style: { textAlign: 'center' } }, 'KLM Cut v1.0 · editor video offline'));
    await modal({ title: 'Pengaturan', body, buttons: [{ label: 'Selesai', cls: 'accent', value: null }] });
    this.saveSettings();
  },
  showHelp() {
    const k = (s) => h('span', null, ...s.split(' / ').map((x, i) => [i ? ' / ' : null, h('span', { class: 'kbd' }, x)]));
    const rows = [['Putar / jeda', 'Spasi'], ['Potong di playhead', 'Ctrl+B / S'], ['Hapus kiri / kanan playhead', 'Q / W'], ['Hapus klip', 'Delete'], ['Urungkan / ulangi', 'Ctrl+Z / Ctrl+Y'], ['Salin / tempel / potong', 'Ctrl+C / Ctrl+V / Ctrl+X'], ['Duplikat', 'Ctrl+D'], ['Pilih semua', 'Ctrl+A'], ['Mundur / maju 1 frame', '← / →'], ['Mundur / maju 1 detik', 'Shift+← / Shift+→'], ['Ke potongan sebelum / sesudah', '↑ / ↓'], ['Ke awal / akhir', 'Home / End'], ['Penanda', 'M'], ['Keyframe', 'K'], ['Perbesar / perkecil timeline', '+ / -'], ['Muat timeline', 'Shift+Z'], ['Impor media', 'Ctrl+I'], ['Ekspor', 'Ctrl+E'], ['Simpan', 'Ctrl+S'], ['Zoom timeline', 'Ctrl+scroll'], ['Skala objek di pratinjau', 'Alt+scroll']];
    const grid = h('div', { class: 'shortcuts' }); rows.forEach(([a, b]) => grid.append(h('span', null, a), k(b)));
    modal({ title: 'Pintasan & bantuan', wide: true, body: h('div', null, grid, h('p', { class: 'hint', style: { marginTop: '14px' } }, 'Seret media dari panel ke timeline, seret tepi klip untuk memangkas, seret objek di pratinjau untuk memindah/memperbesar/memutar. Di HP: tekan-tahan klip untuk memindahkannya, cubit timeline untuk zoom.')) });
  },

  /* ---------- HP: toolbar & sheet ---------- */
  renderMToolbar() {
    const bar = $('#m-toolbar'); if (!bar || !this.mode || !P()) return;
    const c = Act.one();
    let items;
    if (S.selCut) items = [{ ic: 'transition', n: 'Transisi', fn: () => this.openPanel('transition') }, { ic: 'trash', n: 'Hapus', fn: () => Act.del(), dng: true }];
    else if (c) items = (MT_CLIP[c.type] || MT_CLIP.common)(c).filter(Boolean);
    else if (S.sel.size > 1) items = [{ ic: 'grid', n: '2 Kiri-Kanan', fn: () => Pro.layout('2h') }, { ic: 'grid', n: '2 Atas-Bawah', fn: () => Pro.layout('2v') }, { ic: 'overlay', n: 'PiP', fn: () => Pro.layout('pip') }, { ic: 'grid', n: '3 Baris', fn: () => Pro.layout('3v') }, { ic: 'grid', n: 'Grid 4', fn: () => Pro.layout('4') }, { ic: 'duplicate', n: 'Duplikat', fn: () => Act.duplicate() }, { ic: 'trash', n: 'Hapus', fn: () => Act.del(), dng: true }];
    else items = MT_MAIN;
    const key = (c ? c.id + c.type : S.selCut || S.sel.size) + ':' + items.map(i => i.n).join();
    if (bar._key === key) return;
    bar._key = key;
    bar.innerHTML = '';
    if (c || S.selCut || S.sel.size > 1) bar.append(h('button', { class: 'mt back', type: 'button', onclick: () => this.select([]) }, icon('back'), h('span', null, 'Kembali')));
    for (const it of items) bar.append(h('button', { class: 'mt' + (it.dng ? ' dng' : ''), type: 'button', onclick: it.fn }, icon(it.ic === 'clipfx' ? 'effects' : it.ic), h('span', null, it.n)));
    bar.scrollLeft = 0;
  },
  mEdit() {
    const mt = mainTrack(); const arr = clipsOn(mt.id);
    const c = arr.find(x => S.time >= x.start && S.time < clipEnd(x)) || arr[0];
    if (c) this.select([c.id]); else this.openPanel('media');
  },
  openSheet(title, render, meta = {}) {
    const sh = $('#sheet');
    $('#sheet-title').textContent = title;
    const body = $('#sheet-body');
    render(body);
    sh.classList.toggle('tall', !!meta.tall);
    sh.classList.add('open'); sh.setAttribute('aria-hidden', 'false');
    this.sheetPanel = Object.assign({ title, render }, meta);
  },
  reopenSheet() {
    const sp = this.sheetPanel; if (!sp) return;
    const body = $('#sheet-body'); const st = body.scrollTop;
    if (sp.section) { const c = sp.clipId ? clipById(sp.clipId) : null; if (sp.clipId && !c) { this.closeSheet(); return; } Insp.renderSection(sp.section, c, body); }
    else sp.render(body);
    body.scrollTop = st;
  },
  closeSheet() {
    const sh = $('#sheet'); if (!sh) return;
    sh.classList.remove('open'); sh.setAttribute('aria-hidden', 'true');
    this.sheetPanel = null;
    if (Panels.audioPrev) Panels.audioPrev.pause();
  },
  openPanel(id, o = {}) {
    if (!this.mode) { Panels.show(id); return; }
    const p = PANELS.find(x => x.id === id);
    this.openSheet(o.title || (p ? p.n : id), body => Panels.render(id, body, Object.assign({ mobile: true }, o)), { panel: id, tall: ['media', 'sticker', 'text', 'audio', 'captions'].includes(id) });
  },
  openSection(key, c) {
    const titles = { transform: 'Posisi & ukuran', opacity: 'Opasitas', crop: 'Crop', mask: 'Masker', chroma: 'Kunci warna', clipfx: 'Efek klip', filter: 'Filter', adjust: 'Penyesuaian', anim: 'Animasi', speed: 'Kecepatan', audio: 'Volume', voice: 'Pengubah suara', text: 'Edit teks', textstyle: 'Gaya teks', sticker: 'Stiker', effectclip: 'Efek', filterclip: 'Filter', adjustclip: 'Penyesuaian', ratio: 'Format / rasio', canvas: 'Kanvas', project: 'Proyek', ai: 'Hapus latar & AI', retouch: 'Retouch wajah', autocolor: 'Warna AI', protools: 'Alat Pro', audiopro: 'Audio Pro', tts: 'Bacakan teks' };
    this.openSheet(titles[key] || key, body => Insp.renderSection(key, c || null, body), { section: key, clipId: c ? c.id : null, tall: ['textstyle', 'adjust', 'project', 'text', 'speed', 'ai'].includes(key) });
  },

  /* ---------- keyboard ---------- */
  onKey(e) {
    if (this.view !== 'editor' || !P()) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) { if (e.key === 'Escape') t.blur(); return; }
    if ($('#modal-root .mbg')) return;
    const k = e.key, ctrl = e.ctrlKey || e.metaKey;
    const fps = P().fps;
    const run = (fn) => { e.preventDefault(); fn(); };
    if (k === ' ') return run(() => Engine.toggle());
    if (ctrl && (k === 'z' || k === 'Z')) return run(() => e.shiftKey ? Hist.doRedo() : Hist.doUndo());
    if (ctrl && (k === 'y' || k === 'Y')) return run(() => Hist.doRedo());
    if (ctrl && (k === 'b' || k === 'B')) return run(() => Act.split());
    if (ctrl && (k === 'c' || k === 'C')) return run(() => Act.copy());
    if (ctrl && (k === 'v' || k === 'V')) return run(() => Act.paste());
    if (ctrl && (k === 'x' || k === 'X')) return run(() => Act.cut());
    if (ctrl && (k === 'd' || k === 'D')) return run(() => Act.duplicate());
    if (ctrl && (k === 'a' || k === 'A')) return run(() => this.select(P().clips.filter(c => !(trackById(c.trackId) || {}).locked).map(c => c.id)));
    if (ctrl && (k === 's' || k === 'S')) return run(() => Store.saveNow().then(() => toast('Tersimpan', null, 1000)));
    if (ctrl && (k === 'e' || k === 'E')) return run(() => Exporter.open());
    if (ctrl && (k === 'i' || k === 'I')) return run(() => this.importDialog());
    if (ctrl) return;
    if (k === 'Delete' || k === 'Backspace') return run(() => Act.del());
    if (k === 's' || k === 'S') return run(() => Act.split());
    if (k === 'q' || k === 'Q') return run(() => Act.trimAt('l'));
    if (k === 'w' || k === 'W') return run(() => Act.trimAt('r'));
    if (k === 'm' || k === 'M') return run(() => Act.addMarker());
    if (k === 'k' || k === 'K') return run(() => Act.addKeyframe());
    if (k === 'ArrowLeft') return run(() => { Engine.pause(); Engine.seek(e.shiftKey ? S.time - 1 : Math.round(S.time * fps - 1) / fps); });
    if (k === 'ArrowRight') return run(() => { Engine.pause(); Engine.seek(e.shiftKey ? S.time + 1 : Math.round(S.time * fps + 1) / fps); });
    if (k === 'ArrowUp' || k === 'ArrowDown') return run(() => {
      const pts = [...new Set([0, projDuration(), ...P().clips.flatMap(c => [c.start, clipEnd(c)])])].sort((a, b) => a - b);
      const nt = k === 'ArrowUp' ? [...pts].reverse().find(x => x < S.time - 1e-3) : pts.find(x => x > S.time + 1e-3);
      if (nt != null) Engine.seek(nt);
    });
    if (k === 'Home') return run(() => Engine.seek(0));
    if (k === 'End') return run(() => Engine.seek(projDuration()));
    if (k === '+' || k === '=') return run(() => TL.setZoom(TL.pps * 1.3));
    if (k === '-' || k === '_') return run(() => TL.setZoom(TL.pps / 1.3));
    if ((k === 'z' || k === 'Z') && e.shiftKey) return run(() => TL.fit());
    if (k === 'Escape') return run(() => this.select([]));
  },
};

/* =========================================================
   Beranda
   ========================================================= */
const Home = {
  async render() {
    let ps = [];
    try { ps = await Store.listProjects(); } catch (e) { }
    const q = ($('#proj-search').value || '').toLowerCase();
    const list = ps.filter(p => !q || p.name.toLowerCase().includes(q));
    $('#proj-count').textContent = ps.length ? `(${ps.length})` : '';
    const grid = $('#proj-grid'); grid.innerHTML = '';
    if (!list.length) grid.append(h('div', { class: 'empty-proj' }, ps.length ? 'Tidak ada proyek yang cocok.' : 'Belum ada proyek. Klik "Proyek baru" untuk mulai mengedit.'));
    for (const p of list) {
      const more = h('button', { class: 'pc-more', type: 'button', title: 'Opsi' }, icon('more'));
      const th = h('div', { class: 'pc-thumb', style: p.thumb ? { backgroundImage: `url(${p.thumb})` } : null }, p.thumb ? null : icon('media'), h('span', { class: 'dur' }, fmtDur(p.duration || 0)));
      const card = h('div', { class: 'pcard' }, th, more, h('div', { class: 'pc-info' }, h('div', { class: 'pc-name' }, p.name), h('div', { class: 'pc-meta' }, `${p.width}×${p.height} · ${fmtDate(p.modified)}`)));
      card.onclick = () => App.openProject(p.id);
      const menu = e => {
        e.preventDefault(); e.stopPropagation();
        ctxMenu(e.clientX, e.clientY, [
          { label: 'Buka', icon: 'folder', action: () => App.openProject(p.id) },
          { label: 'Ganti nama', icon: 'edit', action: async () => { const n = await promptDlg('Ganti nama proyek', p.name); if (n) { p.name = n; await DB.put('projects', p); this.render(); } } },
          { label: 'Duplikat', icon: 'duplicate', action: async () => { await Store.duplicateProject(p.id); this.render(); } },
          { label: 'Simpan file proyek', icon: 'save', action: () => App.exportProjectFile(p.id) },
          { sep: true },
          { label: 'Hapus', icon: 'trash', danger: true, action: async () => { if (await confirmDlg('Hapus proyek?', `"${p.name}" dan semua medianya akan dihapus dari perangkat ini.`, 'Hapus', true)) { await Store.deleteProject(p.id); this.render(); } } },
        ]);
      };
      more.onclick = menu; card.addEventListener('contextmenu', menu);
      grid.append(card);
    }
    if (navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then(est => { $('#home-foot').textContent = `Penyimpanan terpakai ${fmtBytes(est.usage)} dari ${fmtBytes(est.quota)} · Semua data tersimpan di perangkat ini`; }).catch(() => { });
    }
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });
  },
};

document.addEventListener('DOMContentLoaded', () => App.boot());
