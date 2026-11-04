'use strict';
/* =========================================================
   KLM Cut — area pratinjau: ukuran kanvas & pegangan transformasi
   ========================================================= */
const Preview = {
  k: 1, dispW: 0, dispH: 0,
  init() {
    this.stage = $('#pv-stage'); this.wrap = $('#pv-wrap'); this.canvas = $('#pv-canvas'); this.ov = $('#pv-overlay');
    this.box = h('div', { class: 'ov-box' }, h('div', { class: 'ov-h tl', dataset: { h: 'tl' } }), h('div', { class: 'ov-h tr', dataset: { h: 'tr' } }), h('div', { class: 'ov-h bl', dataset: { h: 'bl' } }), h('div', { class: 'ov-h br', dataset: { h: 'br' } }), h('div', { class: 'ov-rot', dataset: { h: 'rot' } }, icon('rotate')));
    this.gv = h('div', { class: 'ov-guide v' }); this.gh = h('div', { class: 'ov-guide h' }); this.tip = h('div', { class: 'ov-tip' });
    this.ov.append(this.box, this.gv, this.gh, this.tip);
    this.box.style.display = 'none';
    new ResizeObserver(() => this.layout()).observe(this.stage);
    this.bind();
  },
  layout() {
    const p = P(); if (!p) return;
    const sw = this.stage.clientWidth, sh = this.stage.clientHeight;
    if (!sw || !sh) return;
    const pad = document.body.classList.contains('is-m') ? 8 : 18;
    const ar = p.width / p.height;
    let w = sw - pad * 2, hh = w / ar;
    if (hh > sh - pad * 2) { hh = sh - pad * 2; w = hh * ar; }
    w = Math.max(10, Math.floor(w)); hh = Math.max(10, Math.floor(hh));
    this.wrap.style.width = w + 'px'; this.wrap.style.height = hh + 'px';
    this.dispW = w; this.dispH = hh; this.k = w / p.width;
    if (!Engine.exporting) this.applyQuality();
    $('#pv-info').textContent = `${p.width}×${p.height} · ${p.fps} fps`;
  },
  applyQuality() {
    const p = P(); if (!p) return;
    const q = S.settings.quality;
    let rw;
    const dpr = Math.min(2, devicePixelRatio || 1);
    if (q === 'full') rw = p.width;
    else if (q === 'auto') rw = Math.min(p.width, Math.max(320, this.dispW * dpr));
    else { const short = +q; const s = short / Math.min(p.width, p.height); rw = Math.min(p.width, p.width * s); }
    const rh = rw * p.height / p.width;
    Renderer.resize(rw, rh);
    Engine.requestRender();
  },
  /* ---------- overlay seleksi ---------- */
  selClip() {
    if (S.sel.size !== 1) return null;
    const c = clipById([...S.sel][0]);
    if (!c || !['video', 'image', 'text', 'sticker'].includes(c.type)) return null;
    if (S.time < c.start || S.time >= clipEnd(c)) return null;
    const tr = trackById(c.trackId); if (!tr || tr.hidden) return null;
    return c;
  },
  updateOverlay() {
    const c = this.selClip();
    if (!c || Engine.exporting) { this.box.style.display = 'none'; return; }
    const g = Comp.geom(c, S.time); if (!g) { this.box.style.display = 'none'; return; }
    const k = this.k;
    const w = g.w * k, hh = g.h * k;
    Object.assign(this.box.style, { display: 'block', left: (g.cx * k - w / 2) + 'px', top: (g.cy * k - hh / 2) + 'px', width: w + 'px', height: hh + 'px', transform: `rotate(${g.rot}rad)` });
    const locked = (trackById(c.trackId) || {}).locked;
    this.box.style.opacity = locked ? .4 : 1;
  },
  hitTest(px, py) {
    const p = P(); const t = S.time;
    const vis = p.tracks.filter(tr => tr.kind !== 'audio' && !tr.hidden).reverse();
    for (const tr of vis) {
      const cs = clipsOn(tr.id).filter(c => t >= c.start && t < clipEnd(c) && ['video', 'image', 'text', 'sticker'].includes(c.type));
      for (const c of cs) {
        const g = Comp.geom(c, t); if (!g) continue;
        const dx = px - g.cx, dy = py - g.cy, cs2 = Math.cos(-g.rot), sn = Math.sin(-g.rot);
        const lx = dx * cs2 - dy * sn, ly = dx * sn + dy * cs2;
        if (Math.abs(lx) <= g.w / 2 && Math.abs(ly) <= g.h / 2) return { c, locked: tr.locked };
      }
    }
    return null;
  },
  bind() {
    const ov = this.ov;
    const pts = new Map();
    let st = null;
    const toProj = e => { const r = this.wrap.getBoundingClientRect(); return [(e.clientX - r.left) / this.k, (e.clientY - r.top) / this.k]; };
    ov.addEventListener('pointerdown', e => {
      if (e.button > 0) return;
      if (this.pick) { const f = this.pick; this.pick = null; const q = toProj(e); f(q[0], q[1]); return; }
      ov.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, toProj(e));
      if (Engine.playing) Engine.pause();
      const hnd = e.target.dataset && e.target.dataset.h;
      const pp = toProj(e);
      let c = this.selClip();
      if (!hnd) {
        const hit = this.hitTest(pp[0], pp[1]);
        if (!hit) { if (pts.size === 1) { App.select([]); st = null; } return; }
        if (hit.locked) return;
        if (!c || hit.c.id !== c.id) { if (!(c && pts.size > 1)) { App.select([hit.c.id]); c = hit.c; } }
      }
      if (!c) return;
      const g = Comp.geom(c, S.time); if (!g) return;
      const lt = S.time - c.start;
      if (pts.size === 2 && st) { st.pinch = this.pinchState(pts, c, lt); return; }
      st = { c, mode: hnd || 'move', p0: pp, g, x0: Comp.kfVal(c, 'x', lt), y0: Comp.kfVal(c, 'y', lt), s0: Comp.kfVal(c, 'scale', lt), r0: Comp.kfVal(c, 'rotation', lt), saved: false, d0: Math.hypot(pp[0] - g.cx, pp[1] - g.cy) || 1, a0: Math.atan2(pp[1] - g.cy, pp[0] - g.cx) };
    });
    ov.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      const pp = toProj(e); pts.set(e.pointerId, pp);
      if (!st) return;
      const c = st.c, p = P();
      if (!st.saved) { if (Math.hypot(pp[0] - st.p0[0], pp[1] - st.p0[1]) * this.k < 3 && !st.pinch) return; Hist.save(); st.saved = true; }
      if (st.pinch && pts.size >= 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]), ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        Act.setProp(c, 'scale', clamp(st.pinch.s0 * d / st.pinch.d0, .02, 20));
        Act.setProp(c, 'rotation', Math.round((st.pinch.r0 + (ang - st.pinch.a0) * 180 / Math.PI) * 10) / 10);
      } else if (st.mode === 'move') {
        let nx = st.x0 + (pp[0] - st.p0[0]) / p.width, ny = st.y0 + (pp[1] - st.p0[1]) / p.height;
        const thr = 7 / this.k;
        const gx = Math.abs(nx * p.width) < thr, gy = Math.abs(ny * p.height) < thr;
        if (gx) nx = 0; if (gy) ny = 0;
        this.gv.style.display = gx ? 'block' : 'none'; this.gh.style.display = gy ? 'block' : 'none';
        Act.setProp(c, 'x', nx); Act.setProp(c, 'y', ny);
        this.showTip(`X ${Math.round(nx * p.width)}  Y ${Math.round(ny * p.height)}`);
      } else if (st.mode === 'rot') {
        const a = Math.atan2(pp[1] - st.g.cy, pp[0] - st.g.cx);
        let r = st.r0 + (a - st.a0) * 180 / Math.PI;
        r = ((r + 540) % 360) - 180;
        const sn = Math.round(r / 45) * 45; if (Math.abs(r - sn) < 4) r = sn;
        Act.setProp(c, 'rotation', Math.round(r * 10) / 10);
        this.showTip(Math.round(r) + '°');
      } else {
        const d = Math.hypot(pp[0] - st.g.cx, pp[1] - st.g.cy);
        const s = clamp(st.s0 * d / st.d0, .02, 20);
        Act.setProp(c, 'scale', Math.round(s * 1000) / 1000);
        this.showTip(Math.round(s * 100) + '%');
      }
      Comp.invalidate(); Engine.requestRender(); Insp.refreshValues();
    });
    const end = e => {
      pts.delete(e.pointerId);
      if (st && st.pinch && pts.size < 2) st.pinch = null;
      if (pts.size) return;
      this.gv.style.display = this.gh.style.display = 'none'; this.tip.style.display = 'none';
      if (st && st.saved) App.changed({ tl: !!(st.c.kf && Object.keys(st.c.kf).length), insp: true });
      st = null;
    };
    ov.addEventListener('pointerup', end); ov.addEventListener('pointercancel', end);
    ov.addEventListener('dblclick', e => { const pp = toProj(e); const hit = this.hitTest(pp[0], pp[1]); if (hit) App.focusInspector(hit.c); });
    ov.addEventListener('wheel', e => {
      const c = this.selClip(); if (!c || !e.altKey) return;
      e.preventDefault(); Hist.save();
      const lt = S.time - c.start;
      Act.setProp(c, 'scale', clamp(Comp.kfVal(c, 'scale', lt) * Math.pow(1.0015, -e.deltaY), .02, 20));
      Engine.requestRender(); Insp.refreshValues(); Store.saveSoon();
    }, { passive: false });
  },
  pinchState(pts, c, lt) {
    const [a, b] = [...pts.values()];
    return { d0: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, a0: Math.atan2(b[1] - a[1], b[0] - a[0]), s0: Comp.kfVal(c, 'scale', lt), r0: Comp.kfVal(c, 'rotation', lt) };
  },
  showTip(t) { this.tip.textContent = t; this.tip.style.display = 'block'; },
};
