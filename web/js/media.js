'use strict';
/* =========================================================
   KLM Cut — media: impor, probe, thumbnail, waveform, font
   ========================================================= */
function once(el, ev, ms = 8000) {
  return new Promise((res, rej) => {
    const t = setTimeout(() => { cleanup(); res(false); }, ms);
    const ok = () => { cleanup(); res(true); };
    const er = () => { cleanup(); rej(new Error(ev + ' gagal')); };
    const cleanup = () => { clearTimeout(t); el.removeEventListener(ev, ok); el.removeEventListener('error', er); };
    el.addEventListener(ev, ok); el.addEventListener('error', er);
  });
}
function seekVideo(v, t) {
  return new Promise(res => {
    let done = false;
    const fin = () => { if (done) return; done = true; v.removeEventListener('seeked', fin); res(); };
    v.addEventListener('seeked', fin);
    v.currentTime = t;
    setTimeout(fin, 2000);
  });
}
function canvasToBlob(c, type = 'image/jpeg', q = .75) { return new Promise(r => c.toBlob(b => r(b), type, q)); }

const Media = {
  rt: {},
  queue: [], working: false,
  kind(f) {
    const t = (f.type || '').toLowerCase(), n = (f.name || '').toLowerCase();
    if (/\.klmcut$/.test(n)) return 'project';
    if (/\.(srt|vtt)$/.test(n)) return 'srt';
    if (/\.(ttf|otf|woff2?)$/.test(n) || t.startsWith('font/')) return 'font';
    if (t.startsWith('video/') || /\.(mp4|m4v|mov|webm|mkv|avi|3gp|ogv|mpeg|mpg)$/.test(n)) return 'video';
    if (t.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg|avif|ico)$/.test(n)) return 'image';
    if (t.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|oga|opus|flac|weba|amr)$/.test(n)) return 'audio';
    return null;
  },
  url(id) { const r = this.rt[id]; return r && r.url; },
  get(id) { return this.rt[id]; },

  async importFiles(files, opts = {}) {
    const out = [];
    for (const f of files) {
      const k = this.kind(f);
      if (k === 'font') { await Fonts.importFile(f); continue; }
      if (k === 'srt') { await Captions.importSrt(f); continue; }
      if (k === 'project') { toast('Buka file proyek dari Beranda'); continue; }
      if (!k) { toast('Format tidak didukung: ' + f.name, 'err'); continue; }
      try { out.push(await this.addBlob(f, f.name, k)); }
      catch (e) { console.error(e); toast('Gagal mengimpor ' + f.name + ': ' + e.message, 'err', 4000); }
    }
    if (out.length) {
      Store.saveSoon();
      App.onMediaChanged();
      if (opts.toast !== false) toast(out.length + ' media diimpor');
    }
    return out;
  },
  async addBlob(blob, name, kind) {
    const m = { id: uid('m'), name: name || 'media', type: kind, mime: blob.type, size: blob.size, created: Date.now(), duration: 0, w: 0, h: 0, hasAudio: kind !== 'image' };
    const rt = { blob, url: URL.createObjectURL(blob) };
    this.rt[m.id] = rt;
    try {
      if (kind === 'video') await this.probeVideo(m, rt);
      else if (kind === 'image') await this.probeImage(m, rt);
      else await this.probeAudio(m, rt);
    } catch (e) { URL.revokeObjectURL(rt.url); delete this.rt[m.id]; throw e; }
    await DB.put('blobs', blob, m.id);
    await Store.addMediaKey(P().id, m.id);
    P().media.push(m);
    this.enqueue(m);
    return m;
  },
  async probeVideo(m, rt) {
    const v = document.createElement('video');
    v.preload = 'metadata'; v.muted = true; v.playsInline = true; v.src = rt.url;
    const ok = await once(v, 'loadedmetadata', 15000).catch(() => false);
    if (!ok) throw new Error('video tidak bisa dibaca browser ini');
    let d = v.duration;
    if (!isFinite(d) || !d) {
      v.currentTime = 1e7;
      await once(v, 'durationchange', 4000).catch(() => { });
      await sleep(80);
      d = v.duration; if (!isFinite(d)) d = v.currentTime || 10;
    }
    m.duration = d; m.w = v.videoWidth; m.h = v.videoHeight;
    if (!m.w) { m.type = 'audio'; }
    v.removeAttribute('src'); v.load();
  },
  async probeImage(m, rt) {
    const img = new Image(); img.decoding = 'async'; img.src = rt.url;
    try { await img.decode(); } catch (e) { throw new Error('gambar tidak bisa dibaca'); }
    m.w = img.naturalWidth || 512; m.h = img.naturalHeight || 512; m.duration = 0; m.hasAudio = false;
    rt.img = this.fitImage(img, m.w, m.h);
  },
  fitImage(img, w, h) {
    const max = Renderer.maxTex || 4096;
    if (w <= max && h <= max && !/svg/.test(img.src)) return img;
    const s = Math.min(1, max / Math.max(w, h));
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c;
  },
  async probeAudio(m, rt) {
    const a = document.createElement('audio'); a.preload = 'metadata'; a.src = rt.url;
    const ok = await once(a, 'loadedmetadata', 15000).catch(() => false);
    if (!ok) throw new Error('audio tidak bisa dibaca');
    let d = a.duration;
    if (!isFinite(d) || !d) { a.currentTime = 1e7; await once(a, 'durationchange', 4000).catch(() => { }); d = isFinite(a.duration) ? a.duration : 10; }
    m.duration = d; m.hasAudio = true;
  },

  /* ----- antrian pembuatan thumbnail & waveform ----- */
  enqueue(m) { this.queue.push(m); this.work(); },
  async work() {
    if (this.working) return; this.working = true;
    while (this.queue.length) {
      const m = this.queue.shift(); const rt = this.rt[m.id]; if (!rt) continue;
      const der = {};
      try {
        if (m.type === 'video') await this.genThumbs(m, rt, der);
        if (m.type === 'image') await this.genPoster(m, rt, der);
        if (m.type !== 'image') await this.genPeaks(m, rt, der);
        der.hasAudio = m.hasAudio;
        await DB.put('derived', der, m.id);
      } catch (e) { console.warn('derived', e); }
      App.onMediaDerived(m.id);
    }
    this.working = false;
  },
  async genThumbs(m, rt, der) {
    const v = document.createElement('video'); v.muted = true; v.preload = 'auto'; v.playsInline = true; v.src = rt.url;
    await once(v, 'loadeddata', 15000).catch(() => { });
    const n = Math.max(1, Math.min(60, Math.ceil(m.duration / Math.max(.5, m.duration / 60))));
    const interval = m.duration / n;
    const th = 72, tw = clamp(Math.round(th * (m.w / Math.max(1, m.h))), 40, 128);
    const c = document.createElement('canvas'); c.width = n * tw; c.height = th;
    const g = c.getContext('2d'); g.fillStyle = '#111'; g.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < n; i++) {
      await seekVideo(v, Math.min(Math.max(0, m.duration - .05), (i + .5) * interval));
      try { g.drawImage(v, i * tw, 0, tw, th); } catch (e) { }
      if (i === 0 && !rt.thumbs) { const b0 = await canvasToBlob(c); rt.thumbs = { url: URL.createObjectURL(b0), n, tw, th, interval, partial: true }; }
    }
    v.removeAttribute('src'); v.load();
    const blob = await canvasToBlob(c, 'image/jpeg', .72);
    if (rt.thumbs && rt.thumbs.url) URL.revokeObjectURL(rt.thumbs.url);
    rt.thumbs = { url: URL.createObjectURL(blob), n, tw, th, interval };
    der.thumbs = { blob, n, tw, th, interval };
  },
  async genPoster(m, rt, der) {
    const th = 72, tw = clamp(Math.round(th * (m.w / Math.max(1, m.h))), 40, 128);
    const c = document.createElement('canvas'); c.width = tw; c.height = th;
    c.getContext('2d').drawImage(rt.img, 0, 0, tw, th);
    const blob = await canvasToBlob(c, 'image/jpeg', .8);
    rt.thumbs = { url: URL.createObjectURL(blob), n: 1, tw, th, interval: 1e9 };
    der.thumbs = { blob, n: 1, tw, th, interval: 1e9 };
  },
  async genPeaks(m, rt, der) {
    if (rt.blob.size > 450e6 || m.duration > 3600) return;
    let ab;
    try {
      const buf = await rt.blob.arrayBuffer();
      const ac = new OfflineAudioContext(1, 1, 8000);
      ab = await ac.decodeAudioData(buf);
    } catch (e) { if (m.type === 'video') m.hasAudio = false; return; }
    const pps = 50, n = Math.max(1, Math.ceil(ab.duration * pps)), per = ab.length / n;
    const peaks = new Float32Array(n); let mx = 0;
    for (let ch = 0; ch < ab.numberOfChannels; ch++) {
      const d = ab.getChannelData(ch);
      for (let i = 0; i < n; i++) {
        let p = peaks[i]; const a = Math.floor(i * per), b = Math.min(d.length, Math.floor((i + 1) * per));
        for (let j = a; j < b; j += 2) { const v = Math.abs(d[j]); if (v > p) p = v; }
        peaks[i] = p; if (p > mx) mx = p;
      }
    }
    m.hasAudio = mx > .003;
    rt.peaks = peaks; rt.pps = pps;
    der.peaks = peaks.buffer; der.pps = pps;
  },

  /* ----- muat media proyek dari IndexedDB ----- */
  async ensureLoaded(p) {
    const tasks = [];
    for (const m of p.media) {
      if (this.rt[m.id]) continue;
      tasks.push((async () => {
        const blob = await DB.get('blobs', m.id);
        if (!blob) { this.rt[m.id] = { missing: true }; return; }
        const rt = { blob, url: URL.createObjectURL(blob) };
        this.rt[m.id] = rt;
        if (m.type === 'image') {
          const img = new Image(); img.src = rt.url;
          try { await img.decode(); rt.img = this.fitImage(img, m.w || img.naturalWidth, m.h || img.naturalHeight); } catch (e) { rt.missing = true; }
        }
        const der = await DB.get('derived', m.id);
        if (der) {
          if (der.thumbs) rt.thumbs = { url: URL.createObjectURL(der.thumbs.blob), n: der.thumbs.n, tw: der.thumbs.tw, th: der.thumbs.th, interval: der.thumbs.interval };
          if (der.peaks) { rt.peaks = new Float32Array(der.peaks); rt.pps = der.pps; }
        } else this.enqueue(m);
      })());
    }
    await Promise.all(tasks);
    await Fonts.loadProject(p);
  },
  releaseAll() {
    for (const id in this.rt) {
      const r = this.rt[id];
      if (r.url) URL.revokeObjectURL(r.url);
      if (r.thumbs && r.thumbs.url) URL.revokeObjectURL(r.thumbs.url);
    }
    this.rt = {}; this.queue = []; this.decoded = {};
  },
  /* gaya CSS untuk menampilkan thumbnail media pada waktu t (detik media) */
  thumbStyle(id, t, h) {
    const r = this.rt[id]; if (!r || !r.thumbs) return null;
    const T = r.thumbs; const idx = clamp(Math.floor(t / T.interval), 0, T.n - 1);
    const s = h / T.th, w = T.tw * s;
    return { url: T.url, w, pos: `${-idx * w}px 0`, size: `${T.n * w}px ${h}px` };
  },
  poster(id) { const r = this.rt[id]; if (!r) return null; if (r.thumbs) return r.thumbs.url; return null; },

  /* ----- decode audio penuh (untuk ekspor WAV & teks otomatis) ----- */
  decoded: {},
  async decode(id, sr = 48000) {
    const key = id + '@' + sr;
    if (this.decoded[key]) return this.decoded[key];
    const r = this.rt[id]; if (!r || !r.blob) return null;
    try {
      const ac = new OfflineAudioContext(2, 1, sr);
      const ab = await ac.decodeAudioData(await r.blob.arrayBuffer());
      this.decoded[key] = ab; return ab;
    } catch (e) { return null; }
  },
  async removeFromProject(id) {
    const p = P();
    const used = p.clips.filter(c => c.mediaId === id);
    if (used.length && !(await confirmDlg('Hapus media?', `Media ini dipakai ${used.length} klip di timeline. Klip tersebut juga akan dihapus.`, 'Hapus', true))) return;
    Hist.save();
    p.clips = p.clips.filter(c => c.mediaId !== id);
    p.media = p.media.filter(m => m.id !== id);
    if (p.bg.mediaId === id) { p.bg.mediaId = null; if (p.bg.type === 'image') p.bg.type = 'color'; }
    for (const c of used) { S.sel.delete(c.id); Engine.dropClip(c.id); }
    removeEmptyTracks();
    App.changed({ tl: true, insp: true });
    App.onMediaChanged();
  },
};

/* ---------------- font ---------------- */
const Fonts = {
  loaded: new Set(['Arial', 'Arial Black', 'Impact', 'Georgia', 'Times New Roman', 'Verdana', 'Trebuchet MS', 'Courier New', 'Comic Sans MS', 'Tahoma']),
  pending: {},
  css(family) { return `"${family}", "Segoe UI", Roboto, Arial, sans-serif`; },
  ensure(family) {
    if (!family || this.loaded.has(family)) return Promise.resolve();
    if (this.pending[family]) return this.pending[family];
    const f = FONTS.find(x => x.n === family);
    const p = (async () => {
      if (f && f.g) {
        const fam = family.replace(/ /g, '+');
        const href = `https://fonts.googleapis.com/css2?family=${fam}${f.w ? ':wght@400;700' : ''}&display=swap`;
        if (!document.querySelector(`link[data-font="${family}"]`)) document.head.append(h('link', { rel: 'stylesheet', href, 'data-font': family }));
        await sleep(30);
        try {
          await Promise.race([Promise.all([document.fonts.load(`400 40px "${family}"`), f.w ? document.fonts.load(`700 40px "${family}"`) : null]), sleep(6000)]);
        } catch (e) { }
      }
      this.loaded.add(family);
      Comp.invalidateText();
      Engine.requestRender();
    })();
    this.pending[family] = p;
    return p;
  },
  async importFile(file) {
    const family = file.name.replace(/\.(ttf|otf|woff2?)$/i, '').replace(/[^\w\- ]+/g, ' ').trim() || 'Font Saya';
    const id = uid('m');
    await DB.put('blobs', file, id);
    await Store.addMediaKey(P().id, id);
    try {
      const ff = new FontFace(family, await file.arrayBuffer());
      await ff.load(); document.fonts.add(ff); this.loaded.add(family);
      P().fonts = P().fonts || [];
      if (!P().fonts.find(x => x.family === family)) P().fonts.push({ family, mediaId: id });
      Store.saveSoon();
      toast('Font "' + family + '" ditambahkan');
      App.refreshPanels();
    } catch (e) { toast('Font tidak valid', 'err'); }
  },
  async loadProject(p) {
    for (const f of (p.fonts || [])) {
      if (this.loaded.has(f.family)) continue;
      const b = await DB.get('blobs', f.mediaId); if (!b) continue;
      try { const ff = new FontFace(f.family, await b.arrayBuffer()); await ff.load(); document.fonts.add(ff); this.loaded.add(f.family); } catch (e) { }
    }
    const used = new Set(p.clips.filter(c => c.type === 'text').map(c => c.style.font));
    await Promise.all([...used].map(f => this.ensure(f)));
  },
  list() {
    const custom = (P() && P().fonts || []).map(f => ({ n: f.family, c: 'Font Saya' }));
    return [...custom, ...FONTS];
  },
};
