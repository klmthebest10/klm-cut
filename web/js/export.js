'use strict';
/* =========================================================
   KLM Cut — ekspor (video, audio WAV, frame PNG), mixer audio offline,
   subtitle (SRT & teks otomatis AI)
   ========================================================= */
const AudioMix = {
  async render(o = {}) {
    const p = P(); const sr = o.sr || 48000, ch = o.ch || 2;
    const from = o.from || 0, to = o.to != null ? o.to : projDuration();
    const len = Math.max(1, Math.ceil((to - from) * sr));
    const ctx = new OfflineAudioContext(ch, len, sr);
    let any = false;
    for (const c of p.clips) {
      if (c.type !== 'video' && c.type !== 'audio') continue;
      const tr = trackById(c.trackId); if (!tr || tr.muted || c.muted) continue;
      if (!hasMediaAudio(c)) continue;
      const end = c.start + c.dur; if (end <= from || c.start >= to) continue;
      const buf = await Media.decode(c.mediaId, sr); if (!buf) continue;
      any = true;
      const spd = c.speed || 1;
      const src = ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = c.curve ? Engine.speedAt(c, Math.max(c.start, from)) : spd;
      const v = buildVoice(ctx, c.voice || 'none');
      const g = ctx.createGain();
      src.connect(v.input); v.output.connect(g); g.connect(ctx.destination);
      const st = Math.max(c.start, from), et = Math.min(end, to);
      const dyn = c.fadeIn > 0 || c.fadeOut > 0 || (c.kf && c.kf.volume && c.kf.volume.length);
      if (!dyn) g.gain.value = c.volume == null ? 1 : c.volume;
      else {
        g.gain.setValueAtTime(Engine.clipGain(c, st, null), Math.max(0, st - from));
        for (let t = st; t < et; t += .02) g.gain.linearRampToValueAtTime(Engine.clipGain(c, Math.min(t, end - 1e-4), null), Math.max(0, t - from));
      }
      const offset = Engine.mediaTime(c, st);
      if (offset >= buf.duration) continue;
      if (c.curve) for (let t = st; t < et; t += .05) src.playbackRate.linearRampToValueAtTime(Engine.speedAt(c, t), Math.max(0, t - from));
      src.start(Math.max(0, st - from), offset, Math.min(Engine.mediaTime(c, et) - offset, buf.duration - offset));
    }
    const out = await ctx.startRendering();
    out._silent = !any;
    return out;
  },
};

const Exporter = {
  last: { res: 1080, fps: 30, q: 'high', fmt: 'mp4', audio: true, silent: true },
  mimeFor(fmt) {
    const mp4 = ['video/mp4;codecs=avc1.640033,mp4a.40.2', 'video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1.4d0028,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4;codecs=avc1', 'video/mp4'];
    const webm = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9', 'video/webm'];
    if (!window.MediaRecorder) return null;
    const list = fmt === 'mp4' ? [...mp4, ...webm] : [...webm, ...mp4];
    return list.find(t => MediaRecorder.isTypeSupported(t)) || null;
  },
  bitrate(res, fps, q) {
    const base = { 480: 3, 720: 6, 1080: 12, 1440: 22, 2160: 40 }[res] || 12;
    const qm = { low: .5, mid: .8, high: 1.2, max: 2 }[q] || 1;
    return Math.round(base * qm * (fps > 30 ? 1.5 : 1) * 1e6);
  },
  async open() {
    const p = P(); if (!p) return;
    if (!projDuration()) { toast('Timeline masih kosong'); return; }
    Engine.pause();
    const s = Object.assign({}, this.last, { res: Math.min(this.last.res, 2160), fps: p.fps });
    const mp4ok = (this.mimeFor('mp4') || '').includes('mp4');
    if (!mp4ok) s.fmt = 'webm';
    const nm = h('input', { class: 'inp', value: p.name.replace(/[\\/:*?"<>|]+/g, ' ').trim() });
    const est = h('span', { class: 'hint' });
    const upd = () => {
      const sc = s.res / Math.min(p.width, p.height);
      const W = Math.round(p.width * sc / 2) * 2, H = Math.round(p.height * sc / 2) * 2;
      const mb = this.bitrate(s.res, s.fps, s.q) / 8 / 1e6 * projDuration();
      est.textContent = `${W}×${H} · ${s.fps} fps · perkiraan ±${mb < 1 ? mb.toFixed(1) : Math.round(mb)} MB · durasi ${fmtDur(projDuration())}`;
    };
    upd();
    const body = h('div', { class: 'sec-b', style: { padding: 0 } },
      h('div', { class: 'exp-prev' }, h('img', { src: Renderer.thumbnail(480) || '' })),
      UI.row('Nama file', nm),
      UI.row('Resolusi', UI.select(RESOLUTIONS.map(r => ({ value: r.v, label: r.n })), String(s.res), v => { s.res = +v; upd(); })),
      UI.row('Frame/detik', UI.select(FPS_LIST.map(f => ({ value: f, label: f + ' fps' })), String(s.fps), v => { s.fps = +v; upd(); })),
      UI.row('Kualitas', UI.seg([{ value: 'low', label: 'Hemat' }, { value: 'mid', label: 'Sedang' }, { value: 'high', label: 'Tinggi' }, { value: 'max', label: 'Maks' }], s.q, v => { s.q = v; upd(); })),
      UI.row('Format', UI.seg([{ value: 'mp4', label: 'MP4' + (mp4ok ? '' : ' (tidak didukung)') }, { value: 'webm', label: 'WebM' }], s.fmt, v => { s.fmt = v; })),
      UI.row('Sertakan audio', h('div', { class: 'grow' }), UI.toggle(s.audio, v => s.audio = v)),
      UI.row('Senyap saat ekspor', h('div', { class: 'grow' }), UI.toggle(s.silent, v => s.silent = v)),
      est,
      h('p', { class: 'hint box' }, 'Ekspor berjalan secepat pemutaran video. Biarkan tab/aplikasi tetap terbuka dan layar menyala sampai selesai.'),
      h('div', { class: 'btn-row' },
        UI.btn('Audio saja (WAV)', 'music', () => { $('.modal').close(null); this.exportWav(nm.value); }),
        UI.btn('Frame ini (PNG)', 'image', () => { $('.modal').close(null); this.exportFrame(); }),
        UI.btn('File proyek', 'save', () => { $('.modal').close(null); App.exportProjectFile(); })));
    const r = await modal({ title: 'Ekspor video', body, buttons: [{ label: 'Batal', value: null, cls: 'ghost' }, { label: 'Ekspor', value: 'go', cls: 'accent' }] });
    if (r !== 'go') return;
    s.name = nm.value || 'video';
    this.last = s;
    await this.run(s);
  },
  async run(s) {
    if (s.fmt === 'mp4' && window.VideoEncoder && window.VideoFrame) {
      const sc = s.res / Math.min(P().width, P().height);
      const W = Math.round(P().width * sc / 2) * 2, H = Math.round(P().height * sc / 2) * 2;
      const cfg = await this.videoConfig(W, H, s);
      if (cfg) return this.runWC(s, cfg, W, H);
    }
    return this.runMR(s);
  },
  async videoConfig(W, H, s) {
    const px = W * H;
    const lv = px <= 921600 ? '1F' : px <= 2228224 ? '28' : px <= 3686400 ? '32' : '33';
    for (const pr of ['6400', '4D00', '42E0']) {
      const cfg = { codec: 'avc1.' + pr + lv, width: W, height: H, bitrate: this.bitrate(s.res, s.fps, s.q), framerate: s.fps, avc: { format: 'avc' } };
      try { const r = await VideoEncoder.isConfigSupported(cfg); if (r.supported) return cfg; } catch (e) { }
    }
    return null;
  },
  async encodeAudio(buf) {
    if (!window.AudioEncoder || !window.AudioData) return null;
    const sr = buf.sampleRate, ch = buf.numberOfChannels;
    let cfg = null, kind = null;
    for (const [codec, k] of [['mp4a.40.2', 'aac'], ['opus', 'opus']]) {
      const c = { codec, sampleRate: sr, numberOfChannels: ch, bitrate: 192000 };
      try { const r = await AudioEncoder.isConfigSupported(c); if (r.supported) { cfg = c; kind = k; break; } } catch (e) { }
    }
    if (!cfg) return null;
    const chunks = []; let desc = null, err = null;
    const ae = new AudioEncoder({
      output: (chunk, meta) => {
        if (!desc && meta && meta.decoderConfig && meta.decoderConfig.description) { const d = meta.decoderConfig.description; desc = d instanceof ArrayBuffer ? new Uint8Array(d.slice(0)) : new Uint8Array(d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength)); }
        const data = new Uint8Array(chunk.byteLength); chunk.copyTo(data);
        chunks.push({ data, dur: Math.round((chunk.duration || 0) * sr / 1e6) || (kind === 'aac' ? 1024 : 960) });
      },
      error: e => { err = e; },
    });
    ae.configure(cfg);
    const block = Math.round(sr / 10);
    for (let off = 0; off < buf.length; off += block) {
      const n = Math.min(block, buf.length - off);
      const data = new Float32Array(n * ch);
      for (let c = 0; c < ch; c++) data.set(buf.getChannelData(c).subarray(off, off + n), c * n);
      ae.encode(new AudioData({ format: 'f32-planar', sampleRate: sr, numberOfFrames: n, numberOfChannels: ch, timestamp: Math.round(off * 1e6 / sr), data }));
      if (ae.encodeQueueSize > 30) await sleep(1);
      if (err) break;
    }
    await ae.flush(); ae.close();
    if (err || !chunks.length) return null;
    let preSkip = 312;
    if (kind === 'opus' && desc && desc.length >= 12) preSkip = desc[10] | (desc[11] << 8);
    return { kind, sr, ch, config: desc, preSkip, chunks, bitrate: 192000 };
  },
  /* ekspor dengan WebCodecs: frame tepat waktu, audio dirender offline (tanpa jeda/tersendat) */
  async runWC(s, cfg, W, H) {
    const p = P(), dur = projDuration(), fps = s.fps;
    App.select([]);
    let cancelled = false, wakeLock = null;
    const bar = h('i'), pct = h('b', null, '0%'), eta = h('b', null, '—'), spd = h('b', null, '—'), stat = h('div', { class: 'hint' }, 'Menyiapkan…');
    const body = h('div', { class: 'sec-b', style: { padding: 0 } }, h('div', { class: 'progress' }, bar), h('div', { class: 'stat' }, 'Kemajuan', pct), h('div', { class: 'stat' }, 'Sisa waktu', eta), h('div', { class: 'stat' }, 'Kecepatan', spd), h('div', { class: 'stat' }, 'Ukuran', h('b', null, `${W}×${H} · ${fps} fps · MP4 (H.264)`)), stat);
    let closeProg;
    modal({ title: 'Mengekspor…', body, dismiss: false, buttons: [{ label: 'Batalkan', value: 'cancel', cls: 'danger', onClick: () => { cancelled = true; } }], onOpen: (box, close) => { closeProg = close; } });
    try { if (navigator.wakeLock) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { }
    if (window.KLMAndroid) try { KLMAndroid.keepScreen(true); } catch (e) { }
    let audio = null, failed = null;
    try {
      if (s.audio) {
        stat.textContent = 'Menyusun & meng-encode audio…';
        const buf = await AudioMix.render({ sr: 48000, ch: 2 });
        if (!buf._silent) audio = await this.encodeAudio(buf);
        if (!buf._silent && !audio) toast('Encoder audio tidak tersedia — video diekspor tanpa suara', 'err', 4000);
      }
    } catch (e) { console.error(e); }
    if (cancelled) { closeProg && closeProg(); return; }
    const vchunks = []; let avcC = null;
    const enc = new VideoEncoder({
      output: (chunk, meta) => {
        if (!avcC && meta && meta.decoderConfig && meta.decoderConfig.description) { const d = meta.decoderConfig.description; avcC = d instanceof ArrayBuffer ? new Uint8Array(d.slice(0)) : new Uint8Array(d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength)); }
        const data = new Uint8Array(chunk.byteLength); chunk.copyTo(data);
        vchunks.push({ pts: chunk.timestamp, key: chunk.type === 'key', data });
      },
      error: e => { failed = e; console.error(e); },
    });
    enc.configure(cfg);
    Engine.exporting = true; Engine.offlineAudio = true;
    Renderer.resize(W, H);
    Comp.invalidateText(); Comp.invalidate();
    await Fonts.loadProject(p);
    Engine.ensureAudio();
    const total = Math.max(1, Math.round(dur * fps));
    let fi = 0;
    const capture = t => {
      while (fi < total && fi / fps <= t + 1e-6 && !failed) {
        const vf = new VideoFrame(Renderer.canvas, { timestamp: Math.round(fi * 1e6 / fps), duration: Math.round(1e6 / fps) });
        enc.encode(vf, { keyFrame: fi % (fps * 2) === 0 }); vf.close(); fi++;
      }
    };
    stat.textContent = 'Memuat frame pertama…';
    await Engine.renderAt(0, 6000);
    capture(0);
    let last = performance.now(), ema = 1000 / 60, lastAdj = last, rate = 1;
    const t0 = performance.now();
    Engine.setRate(1);
    Engine.onFrame = t => {
      const now = performance.now(); ema = ema * .85 + (now - last) * .15; last = now;
      capture(t);
      if (now - lastAdj > 400) {
        lastAdj = now;
        let target = clamp((1000 / fps) / ema * .92, .06, fps > 30 ? 1 : 2);
        if (enc.encodeQueueSize > 6) target *= .6;
        if (Math.abs(target - rate) / rate > .12) { rate = target; Engine.setRate(rate); }
      }
    };
    Engine.onWait = w => { stat.textContent = w ? 'Menunggu media dimuat…' : 'Merender video…'; };
    stat.textContent = 'Merender video…';
    const done = new Promise(res => { Engine.endAt = dur; Engine.onEnd = res; });
    Engine.play();
    const iv = setInterval(() => {
      const f = clamp(fi / total, 0, 1);
      bar.style.width = (f * 100) + '%'; pct.textContent = Math.round(f * 100) + '%';
      const el = (performance.now() - t0) / 1000;
      if (f > .02) eta.textContent = fmtDur(el / f - el);
      spd.textContent = (S.time / Math.max(.1, el)).toFixed(2) + 'x waktu nyata';
      if ((cancelled || failed) && Engine.playing) Engine.pause();
    }, 250);
    await Promise.race([done, new Promise(r => { const k = setInterval(() => { if (cancelled || failed) { clearInterval(k); r(); } }, 200); })]);
    Engine.onFrame = null;
    if (!cancelled && !failed) capture(dur);
    clearInterval(iv);
    Engine.pause(); Engine.endAt = null; Engine.onEnd = null; Engine.onWait = null; Engine.setRate(1);
    let blob = null;
    if (!cancelled && !failed) {
      stat.textContent = 'Menyelesaikan file…';
      try { await enc.flush(); } catch (e) { failed = e; }
    }
    try { enc.close(); } catch (e) { }
    Engine.exporting = false; Engine.offlineAudio = false;
    Comp.invalidateText(); Preview.layout();
    if (wakeLock) try { wakeLock.release(); } catch (e) { }
    if (window.KLMAndroid) try { KLMAndroid.keepScreen(false); } catch (e) { }
    if (!cancelled && !failed) {
      try { blob = MP4Mux.build({ w: W, h: H, fps, avcC, chunks: vchunks }, audio); } catch (e) { failed = e; console.error(e); }
    }
    if (closeProg) closeProg('done');
    if (cancelled) { toast('Ekspor dibatalkan'); return; }
    if (failed || !blob) { toast('Ekspor MP4 gagal (' + (failed && failed.message || 'encoder') + '), mencoba cara lain…', 'err', 4000); return this.runMR(s); }
    this.result(blob, (s.name || 'video') + '.mp4', false);
  },
  async runMR(s) {
    const p = P(), dur = projDuration();
    const mime = this.mimeFor(s.fmt);
    if (!mime) { toast('Browser ini tidak mendukung perekaman video. Coba Chrome/Edge terbaru.', 'err', 5000); return; }
    const sc = s.res / Math.min(p.width, p.height);
    const W = Math.round(p.width * sc / 2) * 2, H = Math.round(p.height * sc / 2) * 2;
    App.select([]);
    let cancelled = false, wakeLock = null;
    const bar = h('i'), pct = h('b', null, '0%'), eta = h('b', null, '—'), stat = h('div', { class: 'hint' }, 'Menyiapkan…');
    const body = h('div', { class: 'sec-b', style: { padding: 0 } }, h('div', { class: 'progress' }, bar), h('div', { class: 'stat' }, 'Kemajuan', pct), h('div', { class: 'stat' }, 'Sisa waktu', eta), h('div', { class: 'stat' }, 'Ukuran', h('b', null, `${W}×${H} · ${s.fps} fps`)), stat);
    let closeProg;
    const prog = modal({ title: 'Mengekspor…', body, dismiss: false, buttons: [{ label: 'Batalkan', value: 'cancel', cls: 'danger', onClick: () => { cancelled = true; } }], onOpen: (box, close) => { closeProg = close; } });
    void prog;
    try { if (navigator.wakeLock) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { }
    if (window.KLMAndroid) try { KLMAndroid.keepScreen(true); } catch (e) { }
    Engine.exporting = true;
    const prevQ = S.settings.quality;
    Renderer.resize(W, H);
    Comp.invalidateText(); Comp.invalidate();
    await Fonts.loadProject(p);
    Engine.ensureAudio();
    const ctx = Engine.ctx;
    const dest = ctx.createMediaStreamDestination();
    Engine.master.connect(dest);
    if (s.silent) try { Engine.master.disconnect(ctx.destination); } catch (e) { }
    const vtrack = Renderer.canvas.captureStream(s.fps).getVideoTracks()[0];
    const tracks = [vtrack]; if (s.audio) tracks.push(...dest.stream.getAudioTracks());
    const rec = new MediaRecorder(new MediaStream(tracks), { mimeType: mime, videoBitsPerSecond: this.bitrate(s.res, s.fps, s.q), audioBitsPerSecond: 192000 });
    const chunks = [];
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    const stopped = new Promise(r => rec.onstop = r);
    stat.textContent = 'Memuat frame pertama…';
    await Engine.renderAt(0, 6000);
    const t0 = performance.now();
    Engine.onWait = w => { try { if (w && rec.state === 'recording') rec.pause(); else if (!w && rec.state === 'paused') rec.resume(); } catch (e) { } stat.textContent = w ? 'Menunggu media dimuat…' : 'Merekam video…'; };
    rec.start(1000);
    stat.textContent = 'Merekam video…';
    const done = new Promise(res => { Engine.endAt = dur; Engine.onEnd = res; });
    Engine.play();
    const iv = setInterval(() => {
      const f = clamp(S.time / dur, 0, 1);
      bar.style.width = (f * 100) + '%'; pct.textContent = Math.round(f * 100) + '%';
      const el = (performance.now() - t0) / 1000;
      if (f > .02) eta.textContent = fmtDur(el / f - el);
      if (cancelled && Engine.playing) Engine.pause();
    }, 250);
    await Promise.race([done, new Promise(r => { const k = setInterval(() => { if (cancelled) { clearInterval(k); r(); } }, 200); })]);
    clearInterval(iv);
    Engine.pause(); Engine.endAt = null; Engine.onEnd = null; Engine.onWait = null;
    await sleep(300);
    if (rec.state !== 'inactive') rec.stop();
    await stopped;
    vtrack.stop();
    try { Engine.master.disconnect(dest); } catch (e) { }
    if (s.silent) Engine.master.connect(ctx.destination);
    Engine.exporting = false;
    S.settings.quality = prevQ;
    Comp.invalidateText();
    Preview.layout();
    if (wakeLock) try { wakeLock.release(); } catch (e) { }
    if (window.KLMAndroid) try { KLMAndroid.keepScreen(false); } catch (e) { }
    if (closeProg) closeProg('done');
    if (cancelled) { toast('Ekspor dibatalkan'); return; }
    const blob = new Blob(chunks, { type: mime.split(';')[0] });
    const ext = mime.includes('mp4') ? 'mp4' : 'webm';
    this.result(blob, (s.name || 'video') + '.' + ext, s.fmt === 'mp4' && ext !== 'mp4');
  },
  async result(blob, name, fellBack) {
    this._savedAndroid = false;
    const url = URL.createObjectURL(blob);
    const vid = h('video', { src: url, controls: true, playsinline: true, style: { width: '100%', maxHeight: '46vh', borderRadius: '10px', background: '#000' } });
    const file = new File([blob], name, { type: blob.type });
    const canShare = navigator.canShare && navigator.canShare({ files: [file] });
    const body = h('div', { class: 'sec-b', style: { padding: 0 } }, vid,
      h('div', { class: 'stat' }, 'File', h('b', null, name)), h('div', { class: 'stat' }, 'Ukuran', h('b', null, fmtBytes(blob.size))),
      fellBack ? h('p', { class: 'hint box' }, 'Browser ini belum bisa membuat MP4, jadi hasilnya WebM. WebM bisa diputar di Chrome, VLC, dan diunggah ke YouTube.') : null);
    await modal({
      title: 'Ekspor selesai 🎉', body, wide: true, buttons: [
        window.KLMAndroid ? { label: 'Bagikan', cls: 'ghost', onClick: async () => { if (!this._savedAndroid) { await saveBlob(blob, name); this._savedAndroid = true; } try { KLMAndroid.shareLast(); } catch (e) { } return false; } } : null,
        canShare && !window.KLMAndroid ? { label: 'Bagikan', cls: 'ghost', onClick: async () => { try { await navigator.share({ files: [file], title: name }); } catch (e) { } return false; } } : null,
        { label: window.KLMAndroid ? 'Simpan ke galeri' : 'Simpan video', cls: 'accent', onClick: async () => { const ok = await saveBlob(blob, name, { picker: true }); if (ok) { this._savedAndroid = true; if (!window.KLMAndroid) toast('Video disimpan'); } return false; } },
        { label: 'Tutup', value: null, cls: 'ghost' },
      ].filter(Boolean),
    });
    URL.revokeObjectURL(url);
  },
  async exportWav(name) {
    if (!projDuration()) return;
    toast('Menyusun audio…', null, 1500);
    try {
      const buf = await AudioMix.render({ sr: 48000, ch: 2 });
      if (buf._silent) { toast('Tidak ada audio di timeline', 'err'); return; }
      await saveBlob(encodeWav(buf), (name || P().name) + '.wav', { picker: true });
    } catch (e) { console.error(e); toast('Gagal ekspor audio: ' + e.message, 'err'); }
  },
  async exportFrame() {
    const p = P();
    const prev = [Renderer.W, Renderer.H];
    Engine.exporting = true;
    Renderer.resize(p.width, p.height); Comp.invalidateText();
    await Engine.renderAt(S.time);
    const blob = await new Promise(r => Renderer.canvas.toBlob(r, 'image/png'));
    Engine.exporting = false;
    Comp.invalidateText(); Preview.layout();
    void prev;
    if (blob) await saveBlob(blob, `${p.name} ${fmtTC(S.time, p.fps).replace(/:/g, '-')}.png`, { picker: true });
  },
};

/* =========================================================
   Subtitle
   ========================================================= */
const Captions = {
  parse(txt) {
    const out = [];
    const toS = s => { const m = s.trim().replace(',', '.').match(/(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)/); if (!m) return null; return (+(m[1] || 0)) * 3600 + (+m[2]) * 60 + parseFloat(m[3]); };
    for (const block of txt.replace(/\r/g, '').split(/\n\s*\n/)) {
      const lines = block.split('\n').filter(l => l.trim() !== '' && !/^WEBVTT/.test(l));
      const ti = lines.findIndex(l => l.includes('-->'));
      if (ti < 0) continue;
      const [a, b] = lines[ti].split('-->');
      const s = toS(a), e = toS(b.split(' ').filter(Boolean)[0] || b);
      const text = lines.slice(ti + 1).join('\n').replace(/<[^>]+>/g, '').trim();
      if (s != null && e != null && text) out.push({ start: s, end: Math.max(e, s + .3), text });
    }
    return out;
  },
  makeClips(cues, st) {
    if (!cues.length) return 0;
    Hist.save();
    const tr = addTrack('text');
    for (const q of cues) {
      const c = newClip('text', { text: q.text, style: makeTextStyle(st || CAPTION_STYLE), start: q.start, dur: Math.max(.2, q.end - q.start), y: .36, cap: true });
      c.trackId = overlaps(tr.id, c.start, clipEnd(c)) ? freeTrackFor('text', c.start, clipEnd(c)).id : tr.id;
      P().clips.push(c);
    }
    removeEmptyTracks();
    App.changed({ tl: true, insp: true });
    Panels.refresh();
    return cues.length;
  },
  async importSrt(file) {
    const n = this.makeClips(this.parse(await file.text()));
    toast(n ? n + ' baris subtitle diimpor' : 'Tidak ada subtitle yang terbaca', n ? null : 'err');
  },
  exportSrt() {
    const caps = P().clips.filter(c => c.cap || c.type === 'text').filter(c => c.type === 'text').sort((a, b) => a.start - b.start);
    const use = caps.some(c => c.cap) ? caps.filter(c => c.cap) : caps;
    if (!use.length) { toast('Belum ada subtitle/teks'); return; }
    const ts = t => { const ms = Math.round(t * 1000); const hh = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60, r = ms % 1000; return `${String(hh).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(r).padStart(3, '0')}`; };
    const out = use.map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(clipEnd(c))}\n${c.text}\n`).join('\n');
    saveBlob(new Blob([out], { type: 'text/plain' }), P().name + '.srt');
  },
  addLine() { App.addTextClip(CAPTION_STYLE, 'Subtitle', { y: .36, cap: true, dur: 2 }); },
  split(chunks) {
    const out = [];
    for (const ch of chunks) {
      const text = (ch.text || '').trim(); if (!text) continue;
      let [a, b] = ch.timestamp || [0, null];
      if (b == null || b <= a) b = a + Math.max(1.5, text.length * .07);
      const words = text.split(/\s+/);
      const groups = []; let cur = [];
      for (const w of words) { cur.push(w); if (cur.join(' ').length > 38 || /[.!?]$/.test(w) && cur.length > 3) { groups.push(cur.join(' ')); cur = []; } }
      if (cur.length) groups.push(cur.join(' '));
      const total = groups.reduce((s, g) => s + g.length, 0) || 1;
      let t = a;
      for (const g of groups) { const d = (b - a) * g.length / total; out.push({ start: t, end: t + d, text: g }); t += d; }
    }
    return out;
  },
  async auto(opts) {
    if (!P().clips.some(c => (c.type === 'video' || c.type === 'audio') && hasMediaAudio(c))) { toast('Belum ada audio/video bersuara di timeline'); return; }
    const bar = h('i'), stat = h('div', { class: 'hint' }, 'Menyiapkan audio…');
    let close;
    modal({ title: 'Membuat subtitle otomatis', body: h('div', { class: 'sec-b', style: { padding: 0 } }, h('div', { class: 'progress' }, bar), stat), dismiss: false, buttons: false, onOpen: (b, c) => close = c });
    try {
      const buf = await AudioMix.render({ sr: 16000, ch: 1 });
      if (buf._silent) throw new Error('tidak ada audio');
      bar.style.width = '8%';
      stat.textContent = 'Memuat model AI (sekali saja, butuh internet)…';
      const T = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3');
      const model = 'Xenova/whisper-' + (opts.model || 'base');
      const files = {};
      const progress = d => {
        if (d && d.status === 'progress' && d.total) {
          files[d.file] = [d.loaded, d.total];
          let L = 0, Tt = 0; for (const k in files) { L += files[k][0]; Tt += files[k][1]; }
          bar.style.width = (8 + 60 * L / Tt) + '%';
          stat.textContent = `Mengunduh model… ${fmtBytes(L)} / ${fmtBytes(Tt)}`;
        }
      };
      let asr;
      try { asr = await T.pipeline('automatic-speech-recognition', model, { progress_callback: progress, device: navigator.gpu ? 'webgpu' : 'wasm' }); }
      catch (e) { asr = await T.pipeline('automatic-speech-recognition', model, { progress_callback: progress }); }
      bar.style.width = '72%';
      stat.textContent = 'Mengenali ucapan… (bisa beberapa menit untuk video panjang)';
      const o = { return_timestamps: true, chunk_length_s: 30, stride_length_s: 5, task: 'transcribe' };
      if (opts.lang && opts.lang !== 'auto') o.language = opts.lang;
      const res = await asr(buf.getChannelData(0), o);
      bar.style.width = '100%';
      const cues = this.split(res.chunks || [{ timestamp: [0, buf.duration], text: res.text }]);
      close && close();
      const n = this.makeClips(cues);
      toast(n ? n + ' baris subtitle dibuat' : 'Tidak ada ucapan yang terdeteksi', n ? null : 'err', 4000);
    } catch (e) {
      console.error(e);
      close && close();
      toast('Teks otomatis gagal: ' + (e && e.message ? e.message : e) + '. Pastikan online saat pertama kali.', 'err', 6000);
    }
  },
};
