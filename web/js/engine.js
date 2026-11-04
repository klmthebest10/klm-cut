'use strict';
/* =========================================================
   KLM Cut — Comp (susunan frame) & Engine (pemutaran, audio, sinkronisasi)
   ========================================================= */
const MASKS = [
  { id: 'none', n: 'Tanpa' }, { id: 'linear', n: 'Linear' }, { id: 'mirror', n: 'Cermin' }, { id: 'circle', n: 'Lingkaran' },
  { id: 'rect', n: 'Persegi' }, { id: 'heart', n: 'Hati' }, { id: 'star', n: 'Bintang' },
];
const MASK_ID = Object.fromEntries(MASKS.map((m, i) => [m.id, i]));
const KF_PROPS = ['x', 'y', 'scale', 'rotation', 'opacity', 'volume'];
const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif';

const Comp = {
  textCache: {}, stickerCache: {}, svgImgs: {}, ver: 1, cache: null,
  invalidate() { this.cache = null; },
  invalidateText() { this.textCache = {}; this.stickerCache = {}; this.ver++; },
  prepare() {
    if (this.cache) return this.cache;
    const p = P(); const byTrack = {}; const pads = {};
    for (const t of p.tracks) byTrack[t.id] = [];
    for (const c of p.clips) (byTrack[c.trackId] || (byTrack[c.trackId] = [])).push(c);
    for (const id in byTrack) {
      const arr = byTrack[id].sort((a, b) => a.start - b.start);
      for (let i = 0; i < arr.length; i++) {
        const c = arr[i], prev = arr[i - 1];
        if (c.trans && prev && Math.abs(clipEnd(prev) - c.start) < .02 && (c.type === 'video' || c.type === 'image') && (prev.type === 'video' || prev.type === 'image')) {
          const d = Math.min(c.trans.dur, prev.dur, c.dur);
          c._tr = { prev, d };
          (pads[c.id] || (pads[c.id] = [0, 0]))[0] = d / 2;
          (pads[prev.id] || (pads[prev.id] = [0, 0]))[1] = d / 2;
        } else c._tr = null;
      }
    }
    return (this.cache = { byTrack, pads });
  },
  kfVal(c, prop, lt) {
    const arr = c.kf && c.kf[prop];
    if (!arr || !arr.length) return c[prop];
    if (lt <= arr[0].t) return arr[0].v;
    const last = arr[arr.length - 1]; if (lt >= last.t) return last.v;
    for (let i = 0; i < arr.length - 1; i++) {
      const a = arr[i], b = arr[i + 1];
      if (lt >= a.t && lt <= b.t) { let p = (lt - a.t) / ((b.t - a.t) || 1); if (c.kfEase === 'smooth') p = Ease.inOut(p); return lerp(a.v, b.v, p); }
    }
    return last.v;
  },
  animMods(c, lt) {
    const m = { x: 0, y: 0, s: 1, sx: 1, r: 0, a: 1, blur: 0, chars: 1 };
    const A = c.anim || {};
    const ap = o => { if (!o) return; if (o.x) m.x += o.x; if (o.y) m.y += o.y; if (o.s != null) m.s *= o.s; if (o.sx != null) m.sx *= o.sx; if (o.r) m.r += o.r; if (o.a != null) m.a *= o.a; if (o.blur) m.blur = Math.max(m.blur, o.blur); if (o.chars != null) m.chars = Math.min(m.chars, o.chars); if (o.words != null) m.words = Math.min(m.words == null ? 1 : m.words, o.words); if (o.hl != null) m.hl = o.hl; if (o.wave != null) m.wave = o.wave; };
    if (A.in && ANIM_IN_BY[A.in.id]) { const d = Math.min(A.in.dur || .5, c.dur); if (lt < d) ap(ANIM_IN_BY[A.in.id].f(clamp(lt / d, 0, 1))); }
    if (A.out && ANIM_OUT_BY[A.out.id]) { const d = Math.min(A.out.dur || .5, c.dur); if (lt > c.dur - d) ap(ANIM_OUT_BY[A.out.id].f(clamp((lt - (c.dur - d)) / d, 0, 1))); }
    if (A.loop && ANIM_LOOP_BY[A.loop.id]) ap(ANIM_LOOP_BY[A.loop.id].f(lt, A.loop.speed || 1, c.dur));
    return m;
  },
  colorParams(adj, filter) {
    const out = {}; let any = false;
    if (adj) for (const a of ADJUSTS) { const v = adj[a.k]; if (v) { any = true; out[a.k] = a.k === 'hue' ? v / 180 : v / 100; } }
    if (filter && FILTER_BY_ID[filter.id]) {
      any = true; const fp = FILTER_BY_ID[filter.id].p, k = filter.int == null ? 1 : filter.int;
      for (const key in fp) {
        if (key === 'sT' || key === 'hT') out[key] = [fp[key][0], fp[key][1], fp[key][2], fp[key][3] * k];
        else out[key] = (out[key] || 0) + fp[key] * k;
      }
    }
    return any ? out : null;
  },
  /* ---------- kanvas teks ---------- */
  textCanvas(c, mods, rk) {
    if (typeof mods === 'number') mods = { chars: mods };
    mods = mods || {};
    const st = c.style, p = P();
    const unit = Math.min(p.width, p.height) / 1080;
    let mult = clamp(Math.round(rk * clamp(c.scale || 1, 1, 3) * 4) / 4, .25, 4);
    const full = c.text || ' ';
    const chars = mods.chars == null ? 1 : mods.chars;
    const vis = chars >= 1 ? full.length : Math.round(full.length * clamp(chars, 0, 1));
    const nWords = (full.match(/\S+/g) || []).length;
    const wordsVis = mods.words == null || mods.words >= 1 ? nWords : Math.ceil(nWords * clamp(mods.words, 0, 1) - 1e-6);
    const hlWords = mods.hl == null ? -1 : Math.ceil(nWords * mods.hl - 1e-6);
    const wave = mods.wave == null ? null : Math.round(mods.wave * 30) / 30;
    const key = JSON.stringify([full, st, vis, wordsVis, hlWords, wave, mult, unit, this.ver]);
    const cached = this.textCache[c.id];
    if (cached && cached.key === key) return cached;
    Fonts.ensure(st.font);
    const cv = (cached && cached.canvas) || document.createElement('canvas');
    let g = cv.getContext('2d');
    const draw = () => {
      const s = unit * mult, px = Math.max(2, st.size * s);
      const font = `${st.italic ? 'italic ' : ''}${st.bold ? '700' : '400'} ${px}px ${Fonts.css(st.font)}`;
      g.font = font; if ('letterSpacing' in g) g.letterSpacing = (st.ls || 0) * s + 'px';
      const lines = full.split('\n');
      const widths = lines.map(l => Math.max(1, g.measureText(l || ' ').width));
      const maxW = Math.max(...widths), lh = px * (st.lh || 1.2);
      const sw = st.stroke.on ? st.stroke.w * s : 0;
      const shPad = st.shadow.on ? (st.shadow.blur + Math.max(Math.abs(st.shadow.x), Math.abs(st.shadow.y))) * s : 0;
      const glPad = st.glow.on ? st.glow.blur * s * 1.4 : 0;
      const bgPad = st.bg.on ? st.bg.p * s : 0;
      const pad = Math.ceil(sw + Math.max(shPad, glPad) + bgPad + 4 * s + 2 + (wave != null ? px * .2 : 0));
      return { s, px, font, lines, widths, maxW, lh, sw, bgPad, pad, W: Math.ceil(maxW + pad * 2), H: Math.ceil(lines.length * lh + pad * 2) };
    };
    let d = draw();
    const max = Math.min(4096, Renderer.maxTex);
    if (d.W > max || d.H > max) { mult *= Math.min(max / d.W, max / d.H) * .98; d = draw(); }
    cv.width = d.W; cv.height = d.H;
    g = cv.getContext('2d');
    g.font = d.font; if ('letterSpacing' in g) g.letterSpacing = (st.ls || 0) * d.s + 'px';
    g.textBaseline = 'middle'; g.lineJoin = 'round'; g.miterLimit = 2; g.textAlign = 'left';
    const align = st.align || 'center';
    if (st.bg.on) {
      g.fillStyle = rgba(st.bg.color, st.bg.a);
      const bx = d.pad - d.bgPad, by = d.pad - d.bgPad, bw = d.maxW + d.bgPad * 2, bh = d.lines.length * d.lh + d.bgPad * 2;
      g.beginPath();
      if (g.roundRect) g.roundRect(bx, by, bw, bh, Math.min(st.bg.r * d.s, bh / 2)); else g.rect(bx, by, bw, bh);
      g.fill();
    }
    let fill = st.color;
    if (st.grad && st.grad.on) { const gr = g.createLinearGradient(0, d.pad, 0, d.H - d.pad); gr.addColorStop(0, st.grad.c1); gr.addColorStop(1, st.grad.c2); fill = gr; }
    const hlFill = st.hlColor || '#ffd400';
    const setShadow = () => {
      if (st.glow.on) { g.shadowColor = st.glow.color; g.shadowBlur = st.glow.blur * d.s; g.shadowOffsetX = g.shadowOffsetY = 0; }
      else if (st.shadow.on) { g.shadowColor = rgba(st.shadow.color, st.shadow.a == null ? .65 : st.shadow.a); g.shadowBlur = st.shadow.blur * d.s; g.shadowOffsetX = st.shadow.x * d.s; g.shadowOffsetY = st.shadow.y * d.s; }
    };
    const clearShadow = () => { g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetX = g.shadowOffsetY = 0; };
    // gambar per potongan (kata atau huruf) agar animasi kata/karaoke/gelombang bisa
    const perChar = wave != null || vis < full.length;
    let charIdx = 0, wordIdx = 0;
    d.lines.forEach((line, i) => {
      const y0 = d.pad + i * d.lh + d.lh / 2;
      let x = align === 'left' ? d.pad : align === 'right' ? d.W - d.pad - d.widths[i] : (d.W - d.widths[i]) / 2;
      const toks = perChar ? Array.from(line) : line.split(/(\s+)/).filter(t => t.length);
      let lineEnd = x;
      for (const tok of toks) {
        const tw = g.measureText(tok).width;
        const isSpace = !/\S/.test(tok);
        const startsWord = !isSpace && (perChar ? (charIdx === 0 || /\s/.test(full[charIdx - 1] || ' ')) : true);
        const myWord = wordIdx + (startsWord ? 0 : -1);
        const visible = charIdx < vis && (isSpace || Math.max(0, myWord) < wordsVis);
        if (visible && !isSpace) {
          const y = wave != null ? y0 + Math.sin(wave * 5 + charIdx * .55) * d.px * .14 : y0;
          const col = hlWords >= 0 && myWord < hlWords ? hlFill : fill;
          if (st.stroke.on && d.sw > 0) { setShadow(); g.strokeStyle = st.stroke.color; g.lineWidth = d.sw * 2; g.strokeText(tok, x, y); clearShadow(); }
          else setShadow();
          g.fillStyle = col; g.fillText(tok, x, y);
          if (st.glow.on) g.fillText(tok, x, y);
          clearShadow();
          lineEnd = x + tw;
        }
        if (startsWord) wordIdx++;
        charIdx += tok.length;
        x += tw;
      }
      charIdx += 1;
      if (st.underline && lineEnd > 0) {
        const lx = align === 'left' ? d.pad : align === 'right' ? d.W - d.pad - d.widths[i] : (d.W - d.widths[i]) / 2;
        if (lineEnd > lx) { g.fillStyle = fill; g.fillRect(lx, y0 + d.px * .42, lineEnd - lx, Math.max(1, d.px * .06)); }
      }
    });
    const out = { key, canvas: cv, mult, ver: (cached ? cached.ver : 0) + 1 };
    this.textCache[c.id] = out;
    return out;
  },
  /* ---------- kanvas stiker ---------- */
  svgImage(id) {
    let e = this.svgImgs[id];
    if (e) return e.ok ? e.img : null;
    const s = SVG_STICKER_BY_ID[id]; if (!s) return null;
    const img = new Image();
    e = this.svgImgs[id] = { img, ok: false };
    img.onload = () => { e.ok = true; this.stickerCache = {}; Engine.requestRender(); };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="600" height="600">${s.svg}</svg>`);
    return null;
  },
  stickerCanvas(c, rk) {
    const p = P(), unit = Math.min(p.width, p.height) / 1080;
    const mult = clamp(Math.round(rk * clamp(c.scale || 1, 1, 3) * 4) / 4, .25, 4);
    const sk = c.sk;
    const aw = sk.type === 'shape' ? (sk.aw || 1) : 1, ah = sk.type === 'shape' ? (sk.ah || 1) : 1;
    const base = 320 * unit * mult;
    const W = Math.max(4, Math.round(base * aw)), H = Math.max(4, Math.round(base * ah));
    const key = JSON.stringify([sk, W, H]);
    const cached = this.stickerCache[c.id];
    if (cached && cached.key === key) return cached;
    const cv = (cached && cached.canvas) || document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    g.clearRect(0, 0, W, H);
    if (sk.type === 'emoji') {
      g.font = `${Math.round(W * .82)}px ${EMOJI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(sk.v, W / 2, H * .54);
    } else if (sk.type === 'svg') {
      const img = this.svgImage(sk.v); if (img) g.drawImage(img, 0, 0, W, H); else return { canvas: cv, mult, ver: -1, key: null, pending: true };
    } else if (sk.type === 'shape') this.drawShape(g, sk, W, H);
    const out = { key, canvas: cv, mult, ver: (cached ? cached.ver : 0) + 1 };
    this.stickerCache[c.id] = out;
    return out;
  },
  drawShape(g, sk, W, H) {
    const col = sk.color || '#ffc93c', m = Math.min(W, H);
    const sw = (sk.stroke || 0) * m / 100;
    g.fillStyle = col; g.strokeStyle = sk.strokeColor || '#ffffff'; g.lineWidth = sw; g.lineJoin = 'round';
    const pad = sw / 2 + 1, x = pad, y = pad, w = W - pad * 2, h = H - pad * 2;
    g.beginPath();
    const rr = (r) => { if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); };
    switch (sk.v) {
      case 'rect': g.rect(x, y, w, h); break;
      case 'round': rr(m * .18); break;
      case 'pill': rr(Math.min(w, h) / 2); break;
      case 'bar': rr(m * .08); break;
      case 'circle': g.ellipse(W / 2, H / 2, w / 2, h / 2, 0, 0, Math.PI * 2); break;
      case 'ring': { g.ellipse(W / 2, H / 2, w / 2, h / 2, 0, 0, Math.PI * 2); g.ellipse(W / 2, H / 2, w / 2 * .72, h / 2 * .72, 0, 0, Math.PI * 2); g.fill('evenodd'); if (sw) g.stroke(); return; }
      case 'frame': { g.rect(x, y, w, h); g.rect(x + m * .1, y + m * .1, w - m * .2, h - m * .2); g.fill('evenodd'); return; }
      case 'triangle': g.moveTo(W / 2, y); g.lineTo(x + w, y + h); g.lineTo(x, y + h); g.closePath(); break;
      case 'line': g.rect(x, H / 2 - m * .04, w, m * .08); break;
      case 'arrow': g.moveTo(x, y + h * .35); g.lineTo(x + w * .6, y + h * .35); g.lineTo(x + w * .6, y + h * .1); g.lineTo(x + w, y + h * .5); g.lineTo(x + w * .6, y + h * .9); g.lineTo(x + w * .6, y + h * .65); g.lineTo(x, y + h * .65); g.closePath(); break;
      case 'star': { const cx = W / 2, cy = H / 2; for (let i = 0; i < 10; i++) { const r = i % 2 ? .4 : 1, a = -Math.PI / 2 + i * Math.PI / 5; g.lineTo(cx + Math.cos(a) * w / 2 * r, cy + Math.sin(a) * h / 2 * r); } g.closePath(); break; }
      case 'heart': { const cx = W / 2; g.moveTo(cx, y + h * .95); g.bezierCurveTo(x - w * .1, y + h * .55, x + w * .05, y - h * .05, cx, y + h * .28); g.bezierCurveTo(x + w * .95, y - h * .05, x + w * 1.1, y + h * .55, cx, y + h * .95); break; }
      default: g.rect(x, y, w, h);
    }
    g.fill(); if (sw) g.stroke();
  },
  /* ---------- deskripsi lapisan ---------- */
  layer(c, t, rk, opts = {}) {
    const p = P(), W = p.width, H = p.height, lt = t - c.start;
    const mods = this.animMods(c, lt);
    let src, sw, sh, fit = 1, media = false;
    if (c.type === 'video') {
      const m = mediaById(c.mediaId); if (!m) return null;
      const rec = Engine.clipEl(c); src = { key: 'v:' + c.id, el: rec.el }; sw = m.w; sh = m.h; media = true;
    } else if (c.type === 'image') {
      const m = mediaById(c.mediaId), r = Media.get(c.mediaId); if (!m || !r || !r.img) return null;
      src = { key: 'i:' + c.mediaId, el: r.img, ver: 1 }; sw = m.w; sh = m.h; media = true;
    } else if (c.type === 'text') {
      const tc = this.textCanvas(c, mods, rk);
      src = { key: 't:' + c.id, el: tc.canvas, ver: tc.ver }; sw = tc.canvas.width / tc.mult; sh = tc.canvas.height / tc.mult;
    } else if (c.type === 'sticker') {
      const sc = this.stickerCanvas(c, rk); if (sc.pending) return null;
      src = { key: 's:' + c.id, el: sc.canvas, ver: sc.ver }; sw = sc.canvas.width / sc.mult; sh = sc.canvas.height / sc.mult;
    } else return null;
    const cr = c.crop || { l: 0, t: 0, r: 0, b: 0 };
    const cw = Math.max(1, sw * (1 - cr.l - cr.r)), ch = Math.max(1, sh * (1 - cr.t - cr.b));
    if (media) fit = c.fit === 'fill' ? Math.max(W / cw, H / ch) : Math.min(W / cw, H / ch);
    const scale = this.kfVal(c, 'scale', lt) * mods.s;
    const L = {
      src, crop: [cr.l, cr.b, 1 - cr.l - cr.r, 1 - cr.t - cr.b],
      w: cw * fit * scale * mods.sx, h: ch * fit * scale,
      cx: W / 2 + (this.kfVal(c, 'x', lt) + mods.x) * W, cy: H / 2 + (this.kfVal(c, 'y', lt) + mods.y) * H,
      rot: (this.kfVal(c, 'rotation', lt) + mods.r) * Math.PI / 180,
      opacity: clamp(this.kfVal(c, 'opacity', lt) * mods.a, 0, 1),
      flipH: c.flipH, flipV: c.flipV, blend: c.blend || 'normal',
    };
    if (opts.geomOnly) return L;
    L.fx = (c.fx || []).map(f => ({ id: f.id, int: f.int == null ? 1 : f.int, speed: f.speed || 1, time: lt, dur: c.dur }));
    if (mods.blur > .001) L.fx.push({ id: 'blur', int: mods.blur, time: lt, speed: 1 });
    L.col = media ? this.colorParams(c.adj, c.filter) : null;
    if (c.chroma && c.chroma.on) { const k = hexToRgb(c.chroma.color); L.chroma = { r: k[0], g: k[1], b: k[2], sim: c.chroma.sim, smooth: c.chroma.smooth, spill: c.chroma.spill || 0 }; }
    if (media && c.cut && c.cut.on) {
      const sg = Seg.mask(c, src.el, c.type === 'video' ? (src.el.seeking ? null : src.el.currentTime) : 0);
      if (sg) L.seg = Object.assign({ th: c.cut.th, soft: c.cut.soft, inv: c.cut.inv }, sg);
      L.cutMode = c.cut.mode || 'cut';
    }
    if (c.mask && c.mask.type && c.mask.type !== 'none') {
      const m = c.mask;
      L.mask = { t: MASK_ID[m.type], x: m.x, y: 1 - m.y, w: m.w, h: m.h, rot: (m.rot || 0) * Math.PI / 180, feather: m.feather || 0, invert: !!m.invert, round: m.round || 0 };
    }
    return L;
  },
  geom(c, t) { return this.layer(c, t, Renderer.W / P().width || 1, { geomOnly: true }); },
  activeOn(tid, t) { const arr = this.prepare().byTrack[tid] || []; return arr.find(c => t >= c.start && t < c.start + c.dur); },
  /* ---------- susun frame ---------- */
  frame(t) {
    const p = P(), W = p.width, H = p.height;
    const rk = Renderer.W / W || 1;
    const cache = this.prepare();
    const fr = { PW: W, PH: H, bg: { type: p.bg.type, color: hexToRgb(p.bg.color), blur: p.bg.blur }, bgLayer: null, items: [] };
    const cover = L => { const s = Math.max(W / L.w, H / L.h) * 1.04; return Object.assign({}, L, { cx: W / 2, cy: H / 2, w: L.w * s, h: L.h * s, rot: 0, fx: [], mask: null, chroma: null, col: null }); };
    if (p.bg.type === 'blur') {
      const mt = mainTrack(p); const mc = mt && this.activeOn(mt.id, t);
      if (mc) { const L = this.layer(mc, t, rk); if (L) fr.bgLayer = cover(L); }
    } else if (p.bg.type === 'image' && p.bg.mediaId) {
      const r = Media.get(p.bg.mediaId), m = mediaById(p.bg.mediaId);
      if (r && r.img && m) { const s = Math.max(W / m.w, H / m.h); fr.bgLayer = { src: { key: 'i:' + m.id, el: r.img, ver: 1 }, cx: W / 2, cy: H / 2, w: m.w * s, h: m.h * s, rot: 0, crop: [0, 0, 1, 1] }; }
    }
    for (const tr of p.tracks) {
      if (tr.kind === 'audio' || tr.hidden) continue;
      const clips = cache.byTrack[tr.id] || [];
      let done = false;
      for (const c of clips) {
        if (!c._tr) continue;
        const d = c._tr.d, w0 = c.start - d / 2;
        if (t >= w0 && t < w0 + d) {
          fr.items.push({ kind: 'trans', from: this.layer(c._tr.prev, t, rk), to: this.layer(c, t, rk), trId: c.trans.id, p: (t - w0) / d, opacity: 1, blend: c.blend });
          done = true; break;
        }
      }
      if (done) continue;
      for (const c of clips) {
        if (t < c.start || t >= c.start + c.dur) continue;
        const lt = t - c.start;
        if (c.type === 'effect') fr.items.push({ kind: 'fx', id: c.fxId, int: c.int, speed: c.speed || 1, time: lt, dur: c.dur });
        else if (c.type === 'filter') { const col = this.colorParams(null, { id: c.filterId, int: c.int }); if (col) fr.items.push({ kind: 'adj', col }); }
        else if (c.type === 'adjust') { const col = this.colorParams(c.adj, null); if (col) fr.items.push({ kind: 'adj', col }); }
        else {
          const L = this.layer(c, t, rk); if (!L) continue;
          if (L.seg && L.cutMode === 'blur') {
            const B = Object.assign({}, L, { seg: null, fx: [...(L.fx || []), { id: 'blur', int: c.cut.blur == null ? .8 : c.cut.blur, time: t - c.start, speed: 1 }] });
            fr.items.push({ kind: 'layer', layer: B, opacity: L.opacity, blend: L.blend });
          }
          fr.items.push({ kind: 'layer', layer: L, opacity: L.opacity, blend: L.blend });
        }
      }
    }
    return fr;
  },
};

/* ---------------- pengubah suara (WebAudio, live & offline) ---------------- */
function impulse(ctx, dur, decay) {
  const len = Math.floor(ctx.sampleRate * dur), b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
  return b;
}
function shaper(ctx, amt) {
  const s = ctx.createWaveShaper(), n = 1024, curve = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = i * 2 / n - 1; curve[i] = (1 + amt) * x / (1 + amt * Math.abs(x)); }
  s.curve = curve; s.oversample = '2x'; return s;
}
function buildVoice(ctx, id) {
  const input = ctx.createGain(), output = ctx.createGain();
  const filt = (type, f, q = .7, gain = 0) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; b.gain.value = gain; return b; };
  const wetdry = (node, wet) => { const w = ctx.createGain(); w.gain.value = wet; input.connect(output); input.connect(node); node.connect(w).connect(output); };
  switch (id) {
    case 'echo': { const d = ctx.createDelay(1.5); d.delayTime.value = .28; const fb = ctx.createGain(); fb.gain.value = .42; d.connect(fb).connect(d); wetdry(d, .55); break; }
    case 'reverb': { const cv = ctx.createConvolver(); cv.buffer = impulse(ctx, 1.6, 3); wetdry(cv, .45); break; }
    case 'hall': { const cv = ctx.createConvolver(); cv.buffer = impulse(ctx, 3.8, 2.2); wetdry(cv, .65); break; }
    case 'phone': { const a = filt('highpass', 450), b = filt('lowpass', 2800), s = shaper(ctx, 4); input.connect(a).connect(b).connect(s).connect(output); output.gain.value = .9; break; }
    case 'radio': { const a = filt('bandpass', 1400, .6), s = shaper(ctx, 8); input.connect(a).connect(s).connect(output); output.gain.value = 1.1; break; }
    case 'megaphone': { const a = filt('highpass', 700), b = filt('lowpass', 2400), s = shaper(ctx, 40); input.connect(a).connect(b).connect(s).connect(output); output.gain.value = .55; break; }
    case 'underwater': { const a = filt('lowpass', 420, 4); input.connect(a).connect(output); output.gain.value = 1.3; break; }
    case 'robot': { const rm = ctx.createGain(); rm.gain.value = 0; const os = ctx.createOscillator(); os.frequency.value = 55; os.connect(rm.gain); os.start(); input.connect(rm).connect(output); output.gain.value = 1.6; break; }
    case 'bass': { const a = filt('lowshelf', 180, .7, 11); input.connect(a).connect(output); output.gain.value = .8; break; }
    case 'treble': { const a = filt('highshelf', 3200, .7, 8), b = filt('peaking', 5000, 1, 3); input.connect(a).connect(b).connect(output); output.gain.value = .85; break; }
    case 'lofi': { const a = filt('highpass', 200), b = filt('lowpass', 3000), s = shaper(ctx, 3); input.connect(a).connect(b).connect(s).connect(output); break; }
    default: input.connect(output);
  }
  return { input, output };
}

/* ---------------- Engine ---------------- */
const Engine = {
  ctx: null, master: null, recDest: null, els: {},
  playing: false, t0: 0, w0: 0, dirty: true, exporting: false, waiting: false, rate: 1, offlineAudio: false, onFrame: null,
  endAt: null, onEnd: null, onWait: null, lastUi: 0,
  init() { const loop = () => { requestAnimationFrame(loop); this.tick(); }; requestAnimationFrame(loop); },
  ensureAudio() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC({ latencyHint: 'interactive' });
      this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
      for (const id in this.els) this.route(this.els[id]);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  },
  clipEl(c) {
    let r = this.els[c.id];
    if (r && r.mediaId === c.mediaId) return r;
    if (r) this.dropClip(c.id);
    const el = document.createElement(c.type === 'video' ? 'video' : 'audio');
    el.preload = 'auto'; el.playsInline = true; el.setAttribute('playsinline', ''); el.setAttribute('webkit-playsinline', '');
    el.src = Media.url(c.mediaId) || '';
    r = { el, mediaId: c.mediaId, type: c.type, voice: null, target: null };
    el.addEventListener('seeked', () => {
      if (!this.playing && r.target != null && Math.abs(el.currentTime - r.target) > .03) { el.currentTime = r.target; return; }
      this.requestRender();
    });
    el.addEventListener('loadeddata', () => this.requestRender());
    $('#media-pool').append(el);
    this.els[c.id] = r;
    if (this.ctx) this.route(r);
    return r;
  },
  route(r) {
    if (r.src || !this.ctx) return;
    try { r.src = this.ctx.createMediaElementSource(r.el); } catch (e) { return; }
    r.gain = this.ctx.createGain(); r.gain.gain.value = 0; r.gain.connect(this.master);
    this.applyVoice(r, 'none');
  },
  applyVoice(r, id) {
    if (!r.src || r.voice === id) return;
    try { r.src.disconnect(); } catch (e) { }
    if (r.chain) { try { r.chain.output.disconnect(); } catch (e) { } }
    r.chain = buildVoice(this.ctx, id);
    r.src.connect(r.chain.input); r.chain.output.connect(r.gain);
    r.voice = id;
  },
  dropClip(id) {
    const r = this.els[id]; if (!r) return;
    try { r.el.pause(); } catch (e) { }
    if (r.gain) try { r.gain.disconnect(); } catch (e) { }
    r.el.removeAttribute('src'); r.el.load(); r.el.remove();
    delete this.els[id];
    Renderer.dropKey('v:' + id);
  },
  dropAll() { for (const id in this.els) this.dropClip(id); },
  bless() {
    // iOS: "membuka" elemen media dalam gestur pengguna
    for (const id in this.els) { const r = this.els[id]; if (r.blessed) continue; r.blessed = true; const el = r.el; const pr = el.play(); if (pr) pr.then(() => { if (!this.playing) el.pause(); }).catch(() => { }); }
  },
  requestRender() { this.dirty = true; },
  play() {
    if (!P()) return;
    const dur = projDuration();
    if (dur <= 0) return;
    if (S.time >= dur - 1 / P().fps) S.time = 0;
    this.ensureAudio();
    this.playing = S.playing = true;
    this.t0 = S.time; this.w0 = performance.now();
    this.syncMedia(S.time, true);
    this.bless();
    App.onPlayState();
  },
  pause() {
    if (!this.playing) return;
    this.playing = S.playing = false;
    for (const id in this.els) { const r = this.els[id]; if (!r.el.paused) r.el.pause(); if (r.gain) r.gain.gain.value = 0; }
    this.dirty = true;
    App.onPlayState();
  },
  toggle() { this.playing ? this.pause() : this.play(); },
  setRate(r) {
    if (this.playing) { const now = performance.now(); this.t0 = this.t0 + (now - this.w0) / 1000 * this.rate; this.w0 = now; }
    this.rate = r;
  },
  seek(t) {
    const dur = projDuration();
    S.time = clamp(t, 0, Math.max(0, dur));
    if (this.playing) { this.t0 = S.time; this.w0 = performance.now(); for (const id in this.els) { const r = this.els[id]; if (!r.el.paused) r.el.pause(); } }
    this.dirty = true;
    App.onTime(S.time, true);
  },
  mediaTime(c, t) {
    const lt = t - c.start;
    if (c.curve && c.dur > 0) {
      const pts = c.curve.pts;
      if (lt <= 0) return c.in + lt * pts[0];
      if (lt >= c.dur) return c.in + Curve.integ(pts, 1) * c.dur + (lt - c.dur) * pts[4];
      return c.in + Curve.integ(pts, lt / c.dur) * c.dur;
    }
    return c.in + lt * (c.speed || 1);
  },
  speedAt(c, t) { return c.curve ? Curve.at(c.curve.pts, (t - c.start) / Math.max(.001, c.dur)) : (c.speed || 1); },
  clipGain(c, t, tr) {
    const lt = t - c.start;
    if (lt < 0 || lt >= c.dur || c.muted || (tr && tr.muted)) return 0;
    let g = Comp.kfVal(c, 'volume', lt);
    if (c.fadeIn > 0 && lt < c.fadeIn) g *= lt / c.fadeIn;
    if (c.fadeOut > 0 && lt > c.dur - c.fadeOut) g *= Math.max(0, (c.dur - lt) / c.fadeOut);
    return Math.max(0, g);
  },
  syncMedia(t, playing) {
    const p = P(); if (!p) return;
    const pads = Comp.prepare().pads;
    const master = playing ? this.masterClip() : null;
    const want = new Set();
    let waiting = false;
    for (const c of p.clips) {
      if (c.type !== 'video' && c.type !== 'audio') continue;
      if (this.offlineAudio && c.type === 'audio') { const ra = this.els[c.id]; if (ra && !ra.el.paused) ra.el.pause(); continue; }
      const m = mediaById(c.mediaId); if (!m) continue;
      const tr = trackById(c.trackId);
      const pd = pads[c.id] || [0, 0];
      const a = c.start - pd[0], b = c.start + c.dur + pd[1];
      const r0 = this.els[c.id];
      if (t < a || t >= b) {
        // pramuat klip yang akan segera muncul
        if (t < a && a - t < 1.5 && (playing || this.exporting)) {
          const r = this.clipEl(c);
          if (r.el.paused && r.pre !== c.start + ':' + c.in) { r.pre = c.start + ':' + c.in; r.el.currentTime = clamp(this.mediaTime(c, a), 0, Math.max(0, m.duration - .05)); }
        }
        if (r0 && !r0.el.paused) r0.el.pause();
        if (r0 && r0.gain) r0.gain.gain.value = 0;
        continue;
      }
      want.add(c.id);
      const r = this.clipEl(c), el = r.el;
      if (this.ctx && !r.src) this.route(r);
      if (r.src) this.applyVoice(r, c.voice || 'none');
      const mt = this.mediaTime(c, t);
      const md = m.duration || 1e9;
      const inMedia = mt >= 0 && mt < md - .03;
      const mtc = clamp(mt, 0, Math.max(0, md - .04));
      const spd = clamp(this.speedAt(c, t) * this.rate, .0625, 16);
      if (r.gain) {
        const g = this.offlineAudio ? 0 : this.clipGain(c, t, tr);
        if (playing) r.gain.gain.setTargetAtTime(g, this.ctx.currentTime, .015); else r.gain.gain.value = 0;
      }
      if (playing && inMedia) {
        if (Math.abs(el.playbackRate - spd) > spd * .02) el.playbackRate = spd;
        if ('preservesPitch' in el) el.preservesPitch = c.keepPitch !== false;
        if (el.paused) {
          if (Math.abs(el.currentTime - mtc) > .05) el.currentTime = mtc;
          const pr = el.play(); if (pr) pr.catch(() => { });
        } else if (Math.abs(el.currentTime - mtc) > (c === master ? 1 : this.exporting ? .25 : .3)) el.currentTime = mtc;
        if (el.seeking || el.readyState < 2) waiting = true;
      } else {
        if (!el.paused) el.pause();
        r.target = mtc;
        const atEnd = mt >= md - .03 && el.currentTime >= md - .15;
        if (!atEnd && Math.abs(el.currentTime - mtc) > .5 / p.fps && !el.seeking) el.currentTime = mtc;
        if (this.exporting && el.seeking) waiting = true;
      }
    }
    for (const id in this.els) if (!want.has(id)) { const r = this.els[id]; if (!r.el.paused) r.el.pause(); }
    return waiting;
  },
  anySeeking() { for (const id in this.els) { const el = this.els[id].el; if (el.seeking || (el.readyState < 2 && el.src)) return true; } return false; },
  render() {
    if (!P() || !Renderer.gl) return;
    Renderer.render(Comp.frame(S.time));
    Preview.updateOverlay();
  },
  masterClip() {
    const mt = mainTrack(); if (!mt) return null;
    const c = Comp.activeOn(mt.id, S.time);
    return c && c.type === 'video' && !c.curve ? c : null;
  },
  masterTime() {
    const c = this.masterClip(); if (!c) return null;
    const r = this.els[c.id]; if (!r) return null;
    const el = r.el; if (el.paused || el.seeking || el.readyState < (this.exporting ? 2 : 3)) return null;
    return c.start + (el.currentTime - c.in) / (c.speed || 1);
  },
  tick() {
    if (!P()) return;
    const now = performance.now();
    if (this.playing) {
      let t = this.t0 + (now - this.w0) / 1000 * this.rate;
      const tv = this.masterTime();
      if (tv != null && Math.abs(tv - t) < 1 && tv >= S.time - .02) { t = tv; this.t0 = tv; this.w0 = now; }
      const end = this.endAt != null ? this.endAt : projDuration();
      if (this.exporting) {
        // media aktif belum siap (seek/buffer): bekukan jam tanpa menjeda elemen
        if (this.syncMedia(Math.min(t, end), true)) {
          if (!this.waiting) { this.waiting = true; this.onWait && this.onWait(true); }
          this.t0 = S.time; this.w0 = now;
          return;
        }
        if (this.waiting) { this.waiting = false; this.onWait && this.onWait(false); }
      }
      if (t >= end) {
        S.time = end; this.render(); this.pause(); App.onTime(S.time, true);
        if (this.onEnd) { const f = this.onEnd; this.onEnd = null; f(); }
        return;
      }
      S.time = t;
      if (!this.exporting) this.syncMedia(t, true);
      this.render();
      if (this.onFrame) this.onFrame(t);
      if (!this.exporting || now - this.lastUi > 250) { this.lastUi = now; App.onTime(t); }
    } else if (this.dirty) {
      this.dirty = false;
      this.syncMedia(S.time, false);
      this.render();
    }
  },
  async renderAt(t, timeout = 4000) {
    this.pause();
    S.time = t;
    this.syncMedia(t, false);
    const t0 = performance.now();
    await sleep(20);
    while (performance.now() - t0 < timeout && this.anySeeking()) await sleep(25);
    this.syncMedia(t, false);
    this.render();
    this.dirty = false;
  },
};
