'use strict';
/* =========================================================
   KLM Cut — fitur Pro: AI (hapus latar, reframe, teks ke suara),
   video mundur, stabilisasi, warna otomatis, tata letak, audio pro, templat
   ========================================================= */
const TF_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3';
const MP_VER = '0.10.14';
const MP_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VER}`;
const MP_MODEL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';

/* ---------------- segmentasi orang (hapus latar) ---------------- */
const Seg = {
  seg: null, loading: null, failed: false, ts: 0, cache: {}, notified: false,
  async load() {
    if (this.seg) return this.seg;
    if (this.loading) return this.loading;
    if (!this.notified) { this.notified = true; toast('Memuat AI hapus latar (sekali saja, butuh internet)…', null, 3500); }
    this.loading = (async () => {
      let vision = null, err = null;
      for (const u of [MP_BASE + '/vision_bundle.mjs', MP_BASE + '/+esm']) { try { vision = await import(u); break; } catch (e) { err = e; } }
      if (!vision) throw err || new Error('modul AI gagal dimuat');
      const fileset = await vision.FilesetResolver.forVisionTasks(MP_BASE + '/wasm');
      const make = delegate => vision.ImageSegmenter.createFromOptions(fileset, { baseOptions: { modelAssetPath: MP_MODEL, delegate }, runningMode: 'VIDEO', outputCategoryMask: false, outputConfidenceMasks: true });
      try { this.seg = await make('GPU'); } catch (e) { this.seg = await make('CPU'); }
      toast('AI hapus latar siap', null, 1500);
      return this.seg;
    })();
    try { return await this.loading; }
    catch (e) { this.loading = null; this.failed = true; toast('AI hapus latar gagal dimuat: ' + (e.message || e) + '. Pastikan online.', 'err', 5000); throw e; }
  },
  run(src) {
    const ts = this.ts = Math.max(this.ts + 1, performance.now());
    const res = this.seg.segmentForVideo(src, ts);
    const ms = (res && res.confidenceMasks) || [];
    if (!ms.length) { if (res && res.close) res.close(); return null; }
    const m = ms[0], w = m.width, hh = m.height, f = m.getAsFloat32Array();
    const inv = ms.length > 1; // model multikelas: indeks 0 = latar
    const u8 = new Uint8Array(w * hh);
    for (let i = 0; i < u8.length; i++) u8[i] = (inv ? 1 - f[i] : f[i]) * 255;
    if (res.close) res.close(); else ms.forEach(x => x.close && x.close());
    return { data: u8, w, h: hh };
  },
  mask(c, el, ft) {
    if (!this.seg) {
      if (!this.failed && !this.loading) this.load().then(() => { Comp.invalidate(); Engine.requestRender(); }).catch(() => { });
      return this.cache[c.id] || null;
    }
    const e = this.cache[c.id];
    const fk = c.mediaId + ':' + (ft == null ? 'busy' : (+ft).toFixed(3));
    if (e && (e.fk === fk || ft == null)) return e;
    if (el instanceof HTMLVideoElement && el.readyState < 2) return e || null;
    try {
      const r = this.run(el); if (!r) return e || null;
      r.fk = fk; r.ver = (e ? e.ver : 0) + 1;
      this.cache[c.id] = r;
      return r;
    } catch (err) { console.warn('seg', err); return e || null; }
  },
};

/* ---------------- teks ke suara (model di perangkat) ---------------- */
const TTS = {
  LANGS: [{ value: 'ind', label: 'Indonesia' }, { value: 'eng', label: 'Inggris' }, { value: 'zlm', label: 'Melayu' }, { value: 'jav', label: 'Jawa' }, { value: 'sun', label: 'Sunda' }, { value: 'ara', label: 'Arab' }, { value: 'kor', label: 'Korea' }],
  pipes: {},
  async pipe(lang, onProg) {
    if (this.pipes[lang]) return this.pipes[lang];
    const T = await import(TF_URL);
    let err;
    for (const id of ['Xenova/mms-tts-' + lang, 'onnx-community/mms-tts-' + lang]) {
      try { const p = await T.pipeline('text-to-speech', id, { progress_callback: onProg }); this.pipes[lang] = p; return p; } catch (e) { err = e; }
    }
    throw err || new Error('model suara tidak tersedia');
  },
  async make(text, lang, at, rate = 1) {
    text = (text || '').trim(); if (!text) { toast('Tulis teksnya dulu'); return; }
    const bar = h('i'), stat = h('div', { class: 'hint' }, 'Memuat model suara (sekali saja, butuh internet)…');
    let close; modal({ title: 'Teks ke suara', body: h('div', { class: 'sec-b', style: { padding: 0 } }, h('div', { class: 'progress' }, bar), stat), dismiss: false, buttons: false, onOpen: (b, c) => close = c });
    try {
      const files = {};
      const p = await this.pipe(lang, d => { if (d && d.status === 'progress' && d.total) { files[d.file] = [d.loaded, d.total]; let L = 0, Tt = 0; for (const k in files) { L += files[k][0]; Tt += files[k][1]; } bar.style.width = (70 * L / Tt) + '%'; stat.textContent = `Mengunduh model… ${fmtBytes(L)} / ${fmtBytes(Tt)}`; } });
      stat.textContent = 'Membuat suara…'; bar.style.width = '75%';
      const parts = text.split(/(?<=[.!?。])\s+|\n+/).map(x => x.trim()).filter(Boolean);
      const chunks = []; let sr = 16000;
      for (let i = 0; i < parts.length; i++) {
        const o = await p(parts[i]); sr = o.sampling_rate; chunks.push(o.audio);
        bar.style.width = (75 + 25 * (i + 1) / parts.length) + '%';
      }
      const gap = Math.round(sr * .25);
      const total = chunks.reduce((s, a) => s + a.length + gap, 0);
      const out = new Float32Array(total); let o = 0;
      for (const a of chunks) { out.set(a, o); o += a.length + gap; }
      close && close();
      const shim = { numberOfChannels: 1, sampleRate: sr, length: out.length, getChannelData: () => out };
      const m = await Media.addBlob(encodeWav(shim), 'Suara: ' + text.slice(0, 24) + '.wav', 'audio');
      App.onMediaChanged();
      const c = App.addAudioClip(m.id, at != null ? at : S.time);
      if (c && rate !== 1) { Act.setSpeed(c, rate); App.changed({ tl: true }); }
      toast('Suara dibuat dan ditambahkan ke timeline');
    } catch (e) {
      console.error(e); close && close();
      toast('Teks ke suara gagal: ' + (e.message || e) + '. Coba bahasa Inggris atau pastikan online.', 'err', 6000);
    }
  },
};

/* ---------------- utilitas frame video ---------------- */
async function withVideo(mediaId, fn) {
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = Media.url(mediaId);
  await once(v, 'loadeddata', 15000).catch(() => { });
  try { return await fn(v); } finally { v.removeAttribute('src'); v.load(); }
}
function sampleStats(src, w = 64) {
  const sw = src.videoWidth || src.naturalWidth || src.width, sh = src.videoHeight || src.naturalHeight || src.height;
  const hh = Math.max(4, Math.round(w * sh / sw));
  const cv = h('canvas', { width: w, height: hh }); const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(src, 0, 0, w, hh);
  const d = g.getImageData(0, 0, w, hh).data;
  let n = 0, sL = 0, sL2 = 0, sR = 0, sB = 0, sS = 0; const hist = new Uint32Array(64);
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255, gg = d[i + 1] / 255, b = d[i + 2] / 255;
    const l = .2126 * r + .7152 * gg + .0722 * b;
    sL += l; sL2 += l * l; sR += r; sB += b; sS += Math.max(r, gg, b) - Math.min(r, gg, b); hist[Math.min(63, l * 64 | 0)]++; n++;
  }
  const mean = sL / n, std = Math.sqrt(Math.max(0, sL2 / n - mean * mean));
  const pct = q => { let acc = 0; for (let i = 0; i < 64; i++) { acc += hist[i]; if (acc >= n * q) return i / 63; } return 1; };
  return { mean, std, warm: (sR - sB) / n, sat: sS / n, p2: pct(.02), p98: pct(.98) };
}
async function clipStats(c) {
  const m = mediaById(c.mediaId); if (!m) return null;
  if (m.type === 'image') { const r = Media.get(m.id); return r && r.img ? sampleStats(r.img) : null; }
  const lt = S.time >= c.start && S.time < clipEnd(c) ? S.time : c.start + c.dur / 2;
  return withVideo(m.id, async v => { await seekVideo(v, clamp(Engine.mediaTime(c, lt), 0, m.duration - .05)); return sampleStats(v); });
}

/* ---------------- FFT & pengolahan audio ---------------- */
function fft(re, im, inv) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = 2 * Math.PI / len * (inv ? 1 : -1), wr = Math.cos(ang), wi = Math.sin(ang), half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k, b = a + half;
        const br = re[b] * cr - im[b] * ci, bi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - br; im[b] = im[a] - bi; re[a] += br; im[a] += bi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
  if (inv) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}
function denoiseChannel(x, strength = 1) {
  const N = 2048, H = 512, B = N / 2 + 1, len = x.length;
  const win = new Float32Array(N); for (let i = 0; i < N; i++) win[i] = .5 - .5 * Math.cos(2 * Math.PI * i / N);
  const frames = Math.ceil((len + N) / H);
  const energy = new Float32Array(frames);
  for (let f = 0; f < frames; f++) { let e = 0; const o = f * H - N; for (let i = 0; i < N; i += 4) { const v = x[o + i] || 0; e += v * v; } energy[f] = e; }
  const order = Array.from(energy.keys()).sort((a, b) => energy[a] - energy[b]);
  const quiet = order.slice(0, Math.max(4, Math.floor(frames * .1)));
  const noise = new Float32Array(B);
  const re = new Float64Array(N), im = new Float64Array(N);
  for (const f of quiet) {
    const o = f * H - N;
    for (let i = 0; i < N; i++) { re[i] = (x[o + i] || 0) * win[i]; im[i] = 0; }
    fft(re, im, false);
    for (let k = 0; k < B; k++) noise[k] += Math.hypot(re[k], im[k]) / quiet.length;
  }
  const out = new Float32Array(len + N), prev = new Float32Array(B).fill(1);
  const alpha = 1.4 + strength * 1.2, floor = .06;
  for (let f = 0; f < frames; f++) {
    const o = f * H - N;
    for (let i = 0; i < N; i++) { re[i] = (x[o + i] || 0) * win[i]; im[i] = 0; }
    fft(re, im, false);
    for (let k = 0; k < B; k++) {
      const mag = Math.hypot(re[k], im[k]) + 1e-9;
      let g = Math.max(floor, 1 - alpha * noise[k] / mag);
      g = .55 * g + .45 * prev[k]; prev[k] = g;
      re[k] *= g; im[k] *= g;
      if (k > 0 && k < N / 2) { re[N - k] = re[k]; im[N - k] = -im[k]; }
    }
    fft(re, im, true);
    for (let i = 0; i < N; i++) { const p = o + i; if (p >= 0 && p < len) out[p] += re[i] * win[i] / 1.5; }
  }
  return out.subarray(0, len);
}
async function clipAudioSegment(c, sr = 48000) {
  const buf = await Media.decode(c.mediaId, sr); if (!buf) return null;
  const span = Engine.mediaTime(c, clipEnd(c)) - c.in;
  const a = Math.max(0, Math.floor(c.in * sr)), b = Math.min(buf.length, Math.ceil((c.in + span) * sr));
  const ch = [];
  for (let i = 0; i < buf.numberOfChannels; i++) ch.push(buf.getChannelData(i).slice(a, b));
  return { ch, sr, len: b - a };
}

/* =========================================================
   Aksi Pro
   ========================================================= */
const Pro = {
  /* ---------- hapus latar ---------- */
  setCutout(c, on, mode) {
    Hist.save();
    c.cut = Object.assign({ on: false, mode: 'cut', th: .5, soft: .12, inv: false, blur: .8 }, c.cut || {}, { on });
    if (mode) c.cut.mode = mode;
    if (on) Seg.load().then(() => { Comp.invalidate(); Engine.requestRender(); }).catch(() => { });
    App.changed({ insp: true });
  },
  async autoReframe(c) {
    if (!c || c.type !== 'video') { toast('Pilih klip video'); return; }
    let seg; try { seg = await Seg.load(); } catch (e) { return; }
    const m = mediaById(c.mediaId), p = P();
    const prog = this.progress('Bingkai ulang otomatis', 'Menganalisis posisi objek…');
    try {
      const step = .5, pts = [];
      await withVideo(m.id, async v => {
        for (let lt = 0; lt <= c.dur + 1e-3; lt += step) {
          if (prog.cancelled) return;
          await seekVideo(v, clamp(Engine.mediaTime(c, c.start + lt), 0, m.duration - .05));
          const r = Seg.run(v); if (!r) continue;
          let sx = 0, sy = 0, sw = 0;
          for (let y = 0; y < r.h; y += 2) for (let x = 0; x < r.w; x += 2) { const w = r.data[y * r.w + x] / 255; if (w > .5) { sx += x * w; sy += y * w; sw += w; } }
          pts.push({ lt, cx: sw > 20 ? sx / sw / r.w : .5, cy: sw > 20 ? sy / sw / r.h : .5 });
          prog.set(lt / c.dur);
        }
      });
      if (prog.cancelled || !pts.length) { prog.close(); return; }
      const sm = pts.map((q, i) => { let ax = 0, ay = 0, n = 0; for (let j = Math.max(0, i - 2); j <= Math.min(pts.length - 1, i + 2); j++) { ax += pts[j].cx; ay += pts[j].cy; n++; } return { lt: q.lt, cx: ax / n, cy: ay / n }; });
      Hist.save();
      c.fit = 'fill';
      const cr = c.crop || { l: 0, t: 0, r: 0, b: 0 };
      const cw = m.w * (1 - cr.l - cr.r), ch = m.h * (1 - cr.t - cr.b);
      const fit = Math.max(p.width / cw, p.height / ch), sc = c.scale || 1;
      const dw = cw * fit * sc, dh = ch * fit * sc;
      const mxX = Math.max(0, (dw - p.width) / 2 / p.width), mxY = Math.max(0, (dh - p.height) / 2 / p.height);
      c.kf = c.kf || {};
      c.kf.x = sm.map(q => ({ t: q.lt, v: clamp(-(q.cx - .5) * dw / p.width, -mxX, mxX) }));
      c.kf.y = sm.map(q => ({ t: q.lt, v: clamp(-(q.cy - .5) * dh / p.height, -mxY, mxY) }));
      c.kfEase = 'smooth';
      prog.close();
      App.changed({ tl: true, insp: true });
      toast('Objek utama dijaga tetap di tengah bingkai');
    } catch (e) { prog.close(); toast('Gagal: ' + e.message, 'err'); }
  },
  /* ---------- video mundur ---------- */
  async reverse(c) {
    if (!c || c.type !== 'video') { toast('Pilih klip video'); return; }
    if (!window.VideoEncoder) { toast('Browser ini belum mendukung fitur video mundur (butuh Chrome/Edge terbaru)', 'err', 5000); return; }
    const m = mediaById(c.mediaId), p = P();
    const a = Math.max(0, c.in), span = Math.min(m.duration - a, Engine.mediaTime(c, clipEnd(c)) - c.in);
    if (span > 90) { toast('Klip terlalu panjang untuk dimundurkan (maks 90 detik). Potong dulu.', 'err', 4500); return; }
    const sc = Math.min(1, 1280 / Math.max(m.w, m.h));
    const W = Math.max(2, Math.round(m.w * sc / 2) * 2), H = Math.max(2, Math.round(m.h * sc / 2) * 2), fps = p.fps;
    const cfg = await Exporter.videoConfig(W, H, { res: Math.min(W, H), fps, q: 'high' });
    if (!cfg) { toast('Encoder video tidak tersedia', 'err'); return; }
    const prog = this.progress('Membuat video mundur', 'Membaca frame dari belakang…');
    try {
      const chunks = []; let avcC = null, err = null;
      const enc = new VideoEncoder({ output: (ch, meta) => { if (!avcC && meta && meta.decoderConfig && meta.decoderConfig.description) { const d = meta.decoderConfig.description; avcC = new Uint8Array(d instanceof ArrayBuffer ? d.slice(0) : d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength)); } const data = new Uint8Array(ch.byteLength); ch.copyTo(data); chunks.push({ pts: ch.timestamp, key: ch.type === 'key', data }); }, error: e => err = e });
      enc.configure(cfg);
      const cv = h('canvas', { width: W, height: H }); const g = cv.getContext('2d');
      const N = Math.max(1, Math.round(span * fps));
      await withVideo(m.id, async v => {
        for (let k = 0; k < N && !prog.cancelled && !err; k++) {
          await seekVideo(v, clamp(a + span - (k + .5) / fps, 0, m.duration - .02));
          g.drawImage(v, 0, 0, W, H);
          const vf = new VideoFrame(cv, { timestamp: Math.round(k * 1e6 / fps), duration: Math.round(1e6 / fps) });
          enc.encode(vf, { keyFrame: k % (fps * 2) === 0 }); vf.close();
          while (enc.encodeQueueSize > 8) await sleep(5);
          prog.set(k / N * .9);
        }
      });
      if (prog.cancelled) { enc.close(); prog.close(); return; }
      await enc.flush(); enc.close();
      if (err) throw err;
      let audio = null;
      if (m.hasAudio) {
        prog.text('Membalik audio…');
        const buf = await Media.decode(m.id, 48000);
        if (buf) {
          const s0 = Math.floor(a * 48000), n = Math.min(buf.length - s0, Math.round(span * 48000));
          const ab = new AudioBuffer({ length: Math.max(1, n), numberOfChannels: buf.numberOfChannels, sampleRate: 48000 });
          for (let i = 0; i < buf.numberOfChannels; i++) { const src = buf.getChannelData(i).subarray(s0, s0 + n), dst = ab.getChannelData(i); for (let j = 0; j < n; j++) dst[j] = src[n - 1 - j]; }
          audio = await Exporter.encodeAudio(ab);
        }
      }
      prog.text('Menyimpan…');
      const blob = MP4Mux.build({ w: W, h: H, fps, avcC, chunks }, audio);
      const nm = await Media.addBlob(blob, m.name.replace(/\.\w+$/, '') + ' (mundur).mp4', 'video');
      Hist.save();
      c.mediaId = nm.id; c.in = 0; c.name = nm.name; c.reversed = !c.reversed;
      Engine.dropClip(c.id);
      prog.close();
      App.onMediaChanged();
      App.changed({ tl: true, insp: true });
      toast('Video dimundurkan');
    } catch (e) { console.error(e); prog.close(); toast('Gagal memundurkan: ' + (e.message || e), 'err'); }
  },
  /* ---------- stabilisasi ---------- */
  async stabilize(c, strength = .6) {
    if (!c || c.type !== 'video') { toast('Pilih klip video'); return; }
    const m = mediaById(c.mediaId), p = P();
    const prog = this.progress('Stabilisasi video', 'Menganalisis guncangan…');
    try {
      const AW = 128, AH = Math.max(16, Math.round(AW * m.h / m.w)), sf = 15;
      const cv = h('canvas', { width: AW, height: AH }); const g = cv.getContext('2d', { willReadFrequently: true });
      const gray = () => { const d = g.getImageData(0, 0, AW, AH).data; const o = new Float32Array(AW * AH); for (let i = 0, j = 0; i < d.length; i += 4, j++) o[j] = d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11; return o; };
      const N = Math.max(2, Math.floor(c.dur * sf));
      const path = [{ lt: 0, x: 0, y: 0 }];
      let prev = null; const R = 7;
      await withVideo(m.id, async v => {
        for (let k = 0; k <= N && !prog.cancelled; k++) {
          const lt = Math.min(c.dur - .01, k / sf);
          await seekVideo(v, clamp(Engine.mediaTime(c, c.start + lt), 0, m.duration - .05));
          g.drawImage(v, 0, 0, AW, AH);
          const cur = gray();
          if (prev) {
            let best = 1e18, bx = 0, by = 0;
            for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
              let sad = 0;
              for (let y = R + 4; y < AH - R - 4; y += 2) for (let x = R + 4; x < AW - R - 4; x += 2) sad += Math.abs(cur[y * AW + x] - prev[(y + dy) * AW + x + dx]);
              if (sad < best) { best = sad; bx = dx; by = dy; }
            }
            const l = path[path.length - 1];
            path.push({ lt, x: l.x + bx, y: l.y + by });
          }
          prev = cur;
          prog.set(k / N);
        }
      });
      if (prog.cancelled) { prog.close(); return; }
      const win = Math.max(2, Math.round(sf * (.4 + strength * 1.6)));
      const sm = path.map((q, i) => { let ax = 0, ay = 0, n = 0; for (let j = Math.max(0, i - win); j <= Math.min(path.length - 1, i + win); j++) { ax += path[j].x; ay += path[j].y; n++; } return { x: ax / n, y: ay / n }; });
      let maxOff = 0;
      const corr = path.map((q, i) => { const cx = (q.x - sm[i].x) / AW, cy = (q.y - sm[i].y) / AH; maxOff = Math.max(maxOff, Math.abs(cx), Math.abs(cy)); return { lt: q.lt, cx, cy }; });
      Hist.save();
      const zoom = 1 + Math.min(.25, maxOff * 2 + .04);
      const cr = c.crop || { l: 0, t: 0, r: 0, b: 0 };
      const cw = m.w * (1 - cr.l - cr.r), ch = m.h * (1 - cr.t - cr.b);
      const fit = c.fit === 'fill' ? Math.max(p.width / cw, p.height / ch) : Math.min(p.width / cw, p.height / ch);
      if (c.kf) { delete c.kf.scale; } else c.kf = {};
      c.scale = (c.scale || 1) * zoom;
      const dw = cw * fit * c.scale, dh = ch * fit * c.scale;
      const bx = c.x || 0, by = c.y || 0;
      c.kf.x = corr.map(q => ({ t: q.lt, v: bx + q.cx * dw / p.width }));
      c.kf.y = corr.map(q => ({ t: q.lt, v: by + q.cy * dh / p.height }));
      c.kfEase = 'linear';
      c.stab = strength;
      prog.close();
      App.changed({ tl: true, insp: true });
      toast('Video distabilkan (zoom ' + Math.round(zoom * 100) + '%)');
    } catch (e) { console.error(e); prog.close(); toast('Stabilisasi gagal: ' + e.message, 'err'); }
  },
  removeStab(c) { if (!c.stab) return; Hist.save(); if (c.kf) { delete c.kf.x; delete c.kf.y; } c.scale = 1; c.stab = 0; App.changed({ tl: true, insp: true }); },
  /* ---------- warna otomatis & samakan warna ---------- */
  async autoColor(c) {
    if (!c || !(c.type === 'video' || c.type === 'image')) { toast('Pilih klip video/foto'); return; }
    const s = await clipStats(c); if (!s) return;
    Hist.save();
    const a = c.adj = c.adj || {};
    a.exp = Math.round(clamp(Math.log2(.47 / Math.max(.03, s.mean)) * .7, -1, 1) * 100);
    a.con = Math.round(clamp((.21 / Math.max(.05, s.std) - 1) * .5, -.4, .45) * 100);
    a.temp = Math.round(clamp(-s.warm * 1.6, -.45, .45) * 100);
    a.sat = Math.round(clamp((.3 / Math.max(.05, s.sat) - 1) * .45, -.35, .45) * 100);
    a.hl = s.p98 > .96 ? -25 : 0; a.sh = s.p2 < .04 ? 18 : 0;
    App.changed({ insp: true });
    toast('Warna disesuaikan otomatis');
  },
  async matchColor(c, ref) {
    if (!c || !ref) return;
    const [a, b] = [await clipStats(c), await clipStats(ref)]; if (!a || !b) return;
    Hist.save();
    const adj = c.adj = Object.assign({}, c.adj || {});
    adj.exp = Math.round(clamp(Math.log2(Math.max(.03, b.mean) / Math.max(.03, a.mean)), -1, 1) * 100);
    adj.con = Math.round(clamp(b.std / Math.max(.03, a.std) - 1, -.5, .5) * 100);
    adj.temp = Math.round(clamp((b.warm - a.warm) * 1.8, -.6, .6) * 100);
    adj.sat = Math.round(clamp(b.sat / Math.max(.03, a.sat) - 1, -.6, .6) * 100);
    if (ref.filter && !c.filter) c.filter = deepClone(ref.filter);
    App.changed({ insp: true });
    toast('Warna disamakan dengan klip acuan');
  },
  /* ---------- sensor area ---------- */
  censor(c) {
    if (!c || !(c.type === 'video' || c.type === 'image')) { toast('Pilih klip video/foto'); return; }
    Hist.save();
    const n = deepClone(c); n.id = uid('c'); n.trans = null; n.anim = {}; n.name = 'Sensor';
    if ('muted' in n) n.muted = true;
    n.mask = { type: 'rect', x: .5, y: .4, w: .28, h: .22, rot: 0, feather: .04, invert: false, round: .3 };
    n.fx = [{ id: 'pixelate', int: .55, speed: 1 }];
    n.cut = null;
    n.trackId = (() => { const t = freeTrackFor(n.type, n.start, clipEnd(n), null); return t.kind === 'main' ? addTrack('video').id : t.id; })();
    P().clips.push(n);
    App.select([n.id]);
    App.changed({ tl: true, insp: true });
    Act.openInspector('mask');
    toast('Atur posisi & ukuran kotak sensor di bagian Masker');
  },
  /* ---------- tata letak layar terbagi ---------- */
  LAYOUTS: {
    '2h': [[0, 0, .5, 1], [.5, 0, .5, 1]],
    '2v': [[0, 0, 1, .5], [0, .5, 1, .5]],
    '3h': [[0, 0, 1 / 3, 1], [1 / 3, 0, 1 / 3, 1], [2 / 3, 0, 1 / 3, 1]],
    '3v': [[0, 0, 1, 1 / 3], [0, 1 / 3, 1, 1 / 3], [0, 2 / 3, 1, 1 / 3]],
    '4': [[0, 0, .5, .5], [.5, 0, .5, .5], [0, .5, .5, .5], [.5, .5, .5, .5]],
    'pip': [null, [.6, .6, .36, .36]],
  },
  layout(kind) {
    let cs = Act.sel().filter(c => c.type === 'video' || c.type === 'image').sort((a, b) => a.start - b.start);
    const cells = this.LAYOUTS[kind];
    if (cs.length < 2) { toast('Pilih 2–4 klip video/foto (Shift+klik) lalu pilih tata letak'); return; }
    cs = cs.slice(0, cells.length);
    Hist.save();
    const p = P(), W = p.width, H = p.height, t0 = cs[0].start;
    cs.forEach((c, i) => {
      if (i > 0) {
        c.start = t0;
        let t = freeTrackFor(c.type, t0, t0 + c.dur, null);
        if (t.kind === 'main') t = addTrack('video');
        c.trackId = t.id;
      }
      const cell = cells[i]; if (!cell) return;
      const m = mediaById(c.mediaId); if (!m) return;
      const cw = cell[2] * W, chh = cell[3] * H, cx = (cell[0] + cell[2] / 2) * W, cy = (cell[1] + cell[3] / 2) * H;
      const ar = cw / chh, sar = m.w / m.h;
      if (sar > ar) { const k = ar / sar; c.crop = { l: (1 - k) / 2, r: (1 - k) / 2, t: 0, b: 0 }; } else { const k = sar / ar; c.crop = { l: 0, r: 0, t: (1 - k) / 2, b: (1 - k) / 2 }; }
      const cw0 = m.w * (1 - c.crop.l - c.crop.r), ch0 = m.h * (1 - c.crop.t - c.crop.b);
      c.fit = 'fit';
      const fit = Math.min(W / cw0, H / ch0);
      c.scale = cw / (cw0 * fit); c.x = (cx - W / 2) / W; c.y = (cy - H / 2) / H; c.rotation = 0;
      if (c.kf) ['x', 'y', 'scale', 'rotation'].forEach(k => delete c.kf[k]);
    });
    compactMain(); removeEmptyTracks();
    App.changed({ tl: true, insp: true });
    toast('Tata letak diterapkan');
  },
  /* ---------- sinkron ketukan ---------- */
  beatSync() {
    const marks = (P().markers || []).map(m => m.t).filter(t => t > .05).sort((a, b) => a - b);
    if (marks.length < 2) { toast('Butuh penanda ketukan. Pilih klip musik → "Deteksi ketukan" dulu.'); return; }
    const mt = mainTrack(); const arr = clipsOn(mt.id); if (!arr.length) return;
    Hist.save();
    const bounds = [0, ...marks];
    arr.forEach((c, k) => {
      if (k + 1 >= bounds.length) return;
      let d = bounds[k + 1] - bounds[k];
      if (c.type === 'video') { const m = mediaById(c.mediaId); d = Math.min(d, (m.duration - c.in) / clipAvgSpeed(c)); }
      c.dur = Math.max(1 / P().fps, d);
    });
    compactMain();
    App.changed({ tl: true, insp: true });
    toast('Klip utama disesuaikan dengan ketukan');
  },
  /* ---------- kecilkan musik otomatis (ducking) ---------- */
  autoDuck(c) {
    if (!c || c.type !== 'audio') { toast('Pilih klip musik'); return; }
    const others = P().clips.filter(x => x !== c && !x.muted && ((x.type === 'audio') || (x.type === 'video' && hasMediaAudio(x))));
    const peakAt = (x, t) => { const r = Media.get(x.mediaId); if (!r || !r.peaks) return 0; const i = Math.floor(Engine.mediaTime(x, t) * r.pps); return (r.peaks[i] || 0) * (x.volume == null ? 1 : x.volume); };
    const act = [];
    for (let t = c.start; t < clipEnd(c); t += .1) act.push(others.some(x => t >= x.start && t < clipEnd(x) && peakAt(x, t) > .07));
    const iv = []; let st = -1;
    act.forEach((a, i) => { if (a && st < 0) st = i; if ((!a || i === act.length - 1) && st >= 0) { iv.push([st * .1, (a ? i + 1 : i) * .1]); st = -1; } });
    const merged = [];
    for (const v of iv) { const l = merged[merged.length - 1]; if (l && v[0] - l[1] < .6) l[1] = v[1]; else merged.push(v.slice()); }
    const ivs = merged.filter(v => v[1] - v[0] > .3);
    if (!ivs.length) { toast('Tidak ada suara lain yang terdeteksi di bawah musik ini'); return; }
    Hist.save();
    const base = c.volume == null ? 1 : c.volume, duck = base * .22;
    const kf = [{ t: 0, v: base }];
    for (const [a, b] of ivs) {
      const p0 = Math.max(kf[kf.length - 1].t + .01, a - .3);
      if (p0 < a) kf.push({ t: p0, v: base });
      kf.push({ t: Math.max(p0 + .01, a), v: duck }, { t: b, v: duck }, { t: Math.min(c.dur, b + .4), v: base });
    }
    c.kf = c.kf || {}; c.kf.volume = kf.filter(k => k.t <= c.dur).sort((x, y) => x.t - y.t);
    App.changed({ tl: true, insp: true });
    toast(`Musik dikecilkan otomatis di ${ivs.length} bagian`);
  },
  /* ---------- audio pro: kurangi bising / hapus vokal / fokus vokal ---------- */
  async processAudio(c, kind) {
    if (!c || !(c.type === 'audio' || (c.type === 'video' && hasMediaAudio(c)))) { toast('Pilih klip audio atau video bersuara'); return; }
    const names = { denoise: 'Kurangi bising', novocal: 'Hapus vokal', vocal: 'Fokus vokal' };
    const prog = this.progress(names[kind], 'Membaca audio…');
    try {
      const seg = await clipAudioSegment(c, 48000);
      if (!seg || !seg.len) throw new Error('audio tidak terbaca');
      await sleep(30);
      let out = seg.ch;
      if (kind === 'denoise') {
        prog.text('Menghapus bising latar…');
        out = []; for (let i = 0; i < seg.ch.length; i++) { out.push(denoiseChannel(seg.ch[i], 1)); prog.set((i + 1) / seg.ch.length); await sleep(10); }
      } else if (kind === 'novocal') {
        if (seg.ch.length < 2) throw new Error('butuh audio stereo');
        const L = seg.ch[0], R = seg.ch[1], o = new Float32Array(seg.len);
        for (let i = 0; i < seg.len; i++) o[i] = (L[i] - R[i]) * .9;
        out = [o, o];
      } else {
        prog.text('Memisahkan suara vokal…');
        const M = new Float32Array(seg.len), L = seg.ch[0], R = seg.ch[1] || seg.ch[0];
        for (let i = 0; i < seg.len; i++) M[i] = (L[i] + R[i]) * .5;
        const ctx = new OfflineAudioContext(1, seg.len, seg.sr);
        const b = ctx.createBuffer(1, seg.len, seg.sr); b.copyToChannel(M, 0);
        const s = ctx.createBufferSource(); s.buffer = b;
        const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 140;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 6500;
        const pk = ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 2500; pk.gain.value = 4;
        s.connect(hp).connect(lp).connect(pk).connect(ctx.destination); s.start();
        const r = await ctx.startRendering();
        const v = denoiseChannel(r.getChannelData(0), .6);
        out = [v, v];
      }
      let peak = 0; for (const ch of out) for (let i = 0; i < ch.length; i += 7) peak = Math.max(peak, Math.abs(ch[i]));
      if (peak > .99) out.forEach(ch => { for (let i = 0; i < ch.length; i++) ch[i] *= .97 / peak; });
      const shim = { numberOfChannels: out.length, sampleRate: seg.sr, length: seg.len, getChannelData: i => out[i] };
      const m0 = mediaById(c.mediaId);
      const nm = await Media.addBlob(encodeWav(shim), (m0 ? m0.name.replace(/\.\w+$/, '') : 'audio') + ' (' + names[kind].toLowerCase() + ').wav', 'audio');
      Hist.save();
      if (c.type === 'audio') { c.mediaId = nm.id; c.in = 0; Engine.dropClip(c.id); }
      else {
        const a = newClip('audio', { mediaId: nm.id, start: c.start, dur: c.dur, in: 0, speed: c.speed, curve: c.curve ? deepClone(c.curve) : undefined, volume: c.volume, fadeIn: c.fadeIn, fadeOut: c.fadeOut, voice: c.voice, name: nm.name });
        a.trackId = freeTrackFor('audio', a.start, clipEnd(a)).id;
        P().clips.push(a); c.muted = true;
      }
      prog.close();
      App.onMediaChanged();
      App.changed({ tl: true, insp: true });
      toast(names[kind] + ' selesai');
    } catch (e) { console.error(e); prog.close(); toast(names[kind] + ' gagal: ' + e.message, 'err', 4500); }
  },
  /* ---------- kurva kecepatan ---------- */
  setCurve(c, pts, id) {
    const oldSpan = c.dur * clipAvgSpeed(c);
    if (pts) { c.curve = { id: id || 'custom', pts: pts.map(v => clamp(v, .1, 10)) }; }
    else { c.curve = null; }
    const m = mediaById(c.mediaId);
    let nd = oldSpan / clipAvgSpeed(c);
    if (m && m.duration) nd = Math.min(nd, (m.duration - c.in) / clipAvgSpeed(c));
    const ratio = nd / c.dur;
    c.dur = Math.max(1 / P().fps, nd);
    if (c.kf) for (const k in c.kf) c.kf[k].forEach(f => f.t *= ratio);
    compactMain(); Comp.invalidate();
  },
  /* ---------- dialog progres ---------- */
  progress(title, text) {
    const bar = h('i'), stat = h('div', { class: 'hint' }, text || '');
    const o = { cancelled: false };
    let closeFn;
    modal({ title, body: h('div', { class: 'sec-b', style: { padding: 0 } }, h('div', { class: 'progress' }, bar), stat), dismiss: false, buttons: [{ label: 'Batal', cls: 'ghost', onClick: () => { o.cancelled = true; } }], onOpen: (b, c) => closeFn = c });
    o.set = f => { bar.style.width = clamp(f * 100, 0, 100) + '%'; };
    o.text = t => { stat.textContent = t; };
    o.close = () => closeFn && closeFn();
    return o;
  },
};

/* =========================================================
   Templat proyek (desain sendiri)
   ========================================================= */
const TEMPLATES = [
  { id: 'vlog', n: 'Vlog Pembuka', ratio: '16:9', slots: 4, dur: 2.5, bg: 'linear-gradient(135deg,#ff9f1f,#ff4e50)', ic: '🎬', build: T => {
    T.mainAll('crosszoom', .5);
    T.text('VLOG HARIAN', 0, 2.6, { font: 'Bebas Neue', size: 160, bold: false, ls: 8, shadow: { on: true, color: '#000000', blur: 22, x: 0, y: 6, a: .7 } }, { anim: { in: { id: 'zoomIn', dur: .6 }, out: { id: 'fade', dur: .4 } } });
    T.sticker({ type: 'shape', v: 'bar', color: '#e11d48', aw: 2.4, ah: .32 }, 3, 3, { x: -.28, y: .33, anim: { in: { id: 'slideL', dur: .4 }, out: { id: 'slideL', dur: .4 } } });
    T.text('Hari pertama di kota baru', 3, 3, { size: 44, align: 'left' }, { x: -.28, y: .33, anim: { in: { id: 'fade', dur: .5 } } });
    T.effect('lightleak', 0, 2.2, .8); T.filter('filmklasik', 0, T.total(), .8);
  } },
  { id: 'slide', n: 'Slideshow Kenangan', ratio: '16:9', slots: 6, dur: 2.6, bg: 'linear-gradient(135deg,#c4a484,#6b4f3a)', ic: '📸', build: T => {
    T.mainAll('fade', .8, c => { c.fx = [{ id: 'kenburns', int: .7, speed: 1 }]; c.fit = 'fill'; });
    T.filter('kenangan', 0, T.total(), .9);
    T.text('Kenangan Kita', 0, 3, { font: 'Dancing Script', size: 130, shadow: { on: true, color: '#000000', blur: 18, x: 0, y: 4, a: .6 } }, { anim: { in: { id: 'blurIn', dur: .8 }, out: { id: 'fade', dur: .6 } } });
    T.text('Terima kasih', T.total() - 2.4, 2.4, { font: 'Playfair Display', italic: true, size: 90 }, { anim: { in: { id: 'fade', dur: .8 } } });
  } },
  { id: 'promo', n: 'Promo Produk', ratio: '9:16', slots: 4, dur: 2, bg: 'linear-gradient(135deg,#ffc93c,#ff7a1a)', ic: '🛍️', build: T => {
    T.mainAll('pushU', .4, c => { c.fit = 'fill'; });
    T.sticker({ type: 'svg', v: 'sale' }, 0, T.total(), { y: -.3, scale: 1.1, anim: { in: { id: 'bounce', dur: .5 }, loop: { id: 'pulse', speed: 1.2 } } });
    T.text('PROMO SPESIAL', .2, T.total() - .2, { font: 'Anton', size: 120, bold: false, color: '#ffd400', stroke: { on: true, color: '#000000', w: 10 } }, { y: .2, anim: { in: { id: 'bounce', dur: .5 } } });
    T.text('Hanya minggu ini!', .6, T.total() - .6, { size: 54, color: '#17130a', bg: { on: true, color: '#ffffff', a: 1, r: 40, p: 20 } }, { y: .31, anim: { in: { id: 'slideU', dur: .4 } } });
    T.cuts().forEach(t => T.effect('zoomPunch', t, .6, 1));
  } },
  { id: 'raya', n: 'Ucapan Hari Raya', ratio: '9:16', slots: 3, dur: 3, bg: 'linear-gradient(135deg,#14532d,#0f766e)', ic: '🌙', build: T => {
    T.project(p => { p.bg = Object.assign(p.bg, { type: 'blur', blur: .7 }); });
    T.mainAll('dipWhite', .8, c => { c.scale = .86; c.y = -.04; });
    T.sticker({ type: 'svg', v: 'crescent' }, 0, T.total(), { y: -.36, x: -.2, scale: .7, anim: { loop: { id: 'float', speed: .8 } } });
    T.sticker({ type: 'svg', v: 'lantern' }, 0, T.total(), { y: -.3, x: .25, scale: .6, anim: { loop: { id: 'swing', speed: .6 } } });
    T.text('تقبل الله منا ومنكم', .3, T.total() - .3, { font: 'Amiri', size: 84, color: '#f9d77e', bold: false, shadow: { on: true, color: '#000000', blur: 14, x: 0, y: 4, a: .7 } }, { y: .22, anim: { in: { id: 'fade', dur: 1 } } });
    T.text('Selamat Hari Raya\nMohon Maaf Lahir & Batin', .8, T.total() - .8, { size: 52, shadow: { on: true, color: '#000000', blur: 12, x: 0, y: 3, a: .6 } }, { y: .33, anim: { in: { id: 'slideU', dur: .6 } } });
    T.effect('sparkle', 0, T.total(), .7);
  } },
  { id: 'quote', n: 'Story Kutipan', ratio: '9:16', slots: 1, dur: 7, bg: 'linear-gradient(135deg,#334155,#0f172a)', ic: '💬', build: T => {
    T.mainAll(null, 0, c => { c.fit = 'fill'; });
    T.filter('moody', 0, T.total(), 1); T.effect('vignette', 0, T.total(), .8);
    T.text('Langkah kecil hari ini,\nhasil besar esok hari.', .4, T.total() - .4, { font: 'Playfair Display', italic: true, size: 66, shadow: { on: true, color: '#000000', blur: 16, x: 0, y: 4, a: .7 } }, { anim: { in: { id: 'typewriter', dur: 2.2 }, out: { id: 'fade', dur: .6 } } });
    T.text('— @akunanda', 2.8, T.total() - 3.2, { size: 40, color: '#ffc93c' }, { y: .14, anim: { in: { id: 'fade', dur: .6 } } });
  } },
  { id: 'sport', n: 'Highlight Olahraga', ratio: '16:9', slots: 5, dur: 1.6, bg: 'linear-gradient(135deg,#1d4ed8,#111827)', ic: '⚽', build: T => {
    T.mainAll('glitch', .3, c => { c.fit = 'fill'; });
    T.filter('dramatis', 0, T.total(), .9);
    T.effect('shake', 0, T.total(), .5); T.effect('rgbsplit', 0, 1.6, 1);
    T.text('HIGHLIGHT', 0, 1.8, { font: 'Bebas Neue', size: 200, bold: false, ls: 10, color: '#ffffff', shadow: { on: true, color: '#1d4ed8', blur: 0, x: 8, y: 8, a: 1 } }, { anim: { in: { id: 'zoomOut', dur: .35 }, out: { id: 'zoomIn', dur: .3 } } });
  } },
  { id: 'wedding', n: 'Undangan Pernikahan', ratio: '16:9', slots: 4, dur: 3, bg: 'linear-gradient(135deg,#f9a8d4,#fde68a)', ic: '💍', build: T => {
    T.mainAll('dipWhite', 1, c => { c.fx = [{ id: 'kenburns', int: .5, speed: 1 }]; c.fit = 'fill'; });
    T.filter('pink', 0, T.total(), .7); T.effect('sparkle', 0, T.total(), .6);
    T.text('Andi & Sari', .2, 3.6, { font: 'Great Vibes', size: 150, bold: false, shadow: { on: true, color: '#000000', blur: 16, x: 0, y: 4, a: .5 } }, { anim: { in: { id: 'blurIn', dur: 1 }, out: { id: 'fade', dur: .6 } } });
    T.text('Ahad, 12 Juli 2026', 1, 2.8, { font: 'Playfair Display', size: 50 }, { y: .15, anim: { in: { id: 'fade', dur: .8 } } });
  } },
  { id: 'ultah', n: 'Ulang Tahun', ratio: '1:1', slots: 4, dur: 2.5, bg: 'linear-gradient(135deg,#ec4899,#8b5cf6)', ic: '🎂', build: T => {
    T.mainAll('circleOpen', .6, c => { c.fit = 'fill'; });
    T.effect('confetti', 0, T.total(), .9);
    T.text('Selamat Ulang Tahun!', .2, T.total() - .2, { font: 'Lilita One', size: 100, bold: false, color: '#ffffff', stroke: { on: true, color: '#be185d', w: 10 } }, { y: .3, anim: { in: { id: 'bounce', dur: .6 }, loop: { id: 'pulse', speed: 1 } } });
    T.sticker({ type: 'emoji', v: '🎂' }, .4, T.total() - .4, { x: -.32, y: -.32, scale: .55, anim: { loop: { id: 'swing', speed: 1 } } });
    T.sticker({ type: 'emoji', v: '🎉' }, .4, T.total() - .4, { x: .32, y: -.32, scale: .55, anim: { loop: { id: 'swing', speed: 1.2 } } });
  } },
];
const Templates = {
  async use(tpl) {
    const files = await pickFiles('video/*,image/*', true);
    if (App.view === 'editor') await App.closeProject();
    await App.newProject({ ratio: tpl.ratio, noPick: true, silent: true });
    let ms = files.length ? await Media.importFiles(files.slice(0, 24), { toast: false }) : [];
    ms = ms.filter(m => m.type !== 'audio');
    if (!ms.length) ms = [await this.placeholder(tpl)];
    Hist.save();
    const p = P();
    const ids = []; for (let i = 0; i < tpl.slots; i++) ids.push(ms[i % ms.length].id);
    if (ms.length > tpl.slots) for (let i = tpl.slots; i < ms.length; i++) ids.push(ms[i].id);
    const mt = mainTrack();
    let total = 0;
    const T = {
      total: () => total,
      cuts: () => clipsOn(mt.id).slice(1).map(c => c.start),
      project: fn => fn(p),
      mainAll: (trans, tdur, each) => {
        let t = 0;
        ids.forEach((id, i) => {
          const m = mediaById(id);
          const d = m.type === 'video' ? Math.min(m.duration, tpl.dur) : tpl.dur;
          const c = newClip(m.type, { mediaId: id, start: t, dur: d, name: m.name, trackId: mt.id });
          if (trans && i > 0) c.trans = { id: trans, dur: tdur };
          if (each) each(c);
          p.clips.push(c); t += d;
        });
        total = t;
      },
      text: (text, start, dur, st, o = {}) => {
        const c = newClip('text', { text, style: makeTextStyle(st), start, dur, x: o.x || 0, y: o.y || 0, anim: o.anim || {} });
        c.trackId = freeTrackFor('text', start, start + dur).id; p.clips.push(c); Fonts.ensure(c.style.font); return c;
      },
      sticker: (sk, start, dur, o = {}) => {
        const c = newClip('sticker', { sk, start, dur, x: o.x || 0, y: o.y || 0, scale: o.scale || 1, anim: o.anim || {} });
        c.trackId = freeTrackFor('sticker', start, start + dur).id; p.clips.push(c); return c;
      },
      effect: (id, start, dur, int) => { const c = newClip('effect', { fxId: id, start, dur, int }); c.trackId = freeTrackFor('effect', start, start + dur).id; p.clips.push(c); },
      filter: (id, start, dur, int) => { const c = newClip('filter', { filterId: id, start, dur, int }); c.trackId = freeTrackFor('filter', start, start + dur).id; p.clips.push(c); },
    };
    tpl.build(T);
    p.name = tpl.n + ' ' + new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
    $('#proj-name').value = p.name;
    App.changed({ tl: true, insp: true, ratio: true });
    TL.fit();
    Engine.seek(0);
    toast(files.length ? 'Templat diterapkan — ganti teks sesuai kebutuhan' : 'Templat dibuat dengan gambar contoh. Ganti media lewat klik kanan → Ganti media.', null, 4500);
  },
  async placeholder(tpl) {
    const p = P(); const c = document.createElement('canvas'); c.width = Math.min(1280, p.width); c.height = Math.round(c.width * p.height / p.width);
    const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, c.width, c.height);
    const cols = (tpl.bg.match(/#[0-9a-f]{6}/gi) || ['#333333', '#111111']);
    gr.addColorStop(0, cols[0]); gr.addColorStop(1, cols[1] || cols[0]); g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = 'rgba(255,255,255,.85)'; g.font = `700 ${Math.round(c.width / 22)}px sans-serif`; g.textAlign = 'center'; g.fillText('Ganti dengan foto/video Anda', c.width / 2, c.height * .62);
    return Media.addBlob(await canvasToBlob(c, 'image/jpeg', .9), 'Contoh ' + tpl.n + '.jpg', 'image');
  },
  gallery(root, onPick) {
    const grid = h('div', { class: 'tiles lg' });
    for (const t of TEMPLATES) {
      const th = h('div', { class: 'th', style: { background: t.bg, aspectRatio: t.ratio === '9:16' ? '9/12' : t.ratio === '1:1' ? '1/1' : '16/10' } }, h('span', { class: 'emo' }, t.ic), h('span', { class: 'badge' }, t.ratio + ' · ' + t.slots + ' media'));
      const tile = h('div', { class: 'tile' }, th, h('div', { class: 'nm' }, t.n));
      tile.onclick = () => { if (onPick) onPick(); this.use(t); };
      grid.append(tile);
    }
    root.append(grid);
  },
  async open() {
    const body = h('div');
    body.append(h('p', { class: 'hint' }, 'Pilih templat, lalu pilih foto/video Anda. Semua teks & efek bisa diubah setelahnya.'));
    let close;
    this.gallery(body, () => close && close());
    modal({ title: 'Templat', body, wide: true, buttons: [{ label: 'Tutup', cls: 'ghost', value: null }], onOpen: (b, c) => close = c });
  },
};
