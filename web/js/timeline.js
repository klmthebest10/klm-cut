'use strict';
/* =========================================================
   KLM Cut — timeline multi-track
   ========================================================= */
const TL = {
  pps: 60, minPps: 1.5, maxPps: 800, HW: 104, RULER: 28,
  rows: [], dragging: false, snapPts: null,
  init(root) {
    this.root = root;
    root.innerHTML = '';
    this.bar = h('div', { class: 'tl-bar' });
    this.scroll = h('div', { class: 'tl-scroll' });
    this.content = h('div', { class: 'tl-content' });
    this.ruler = h('div', { class: 'tl-ruler' });
    this.rulerCv = h('canvas');
    this.ruler.append(this.rulerCv);
    this.rowsEl = h('div', { class: 'tl-rows' });
    this.ph = h('div', { class: 'tl-playhead' }, h('div', { class: 'ph-h' }));
    this.snapLine = h('div', { class: 'tl-snapline' });
    this.ghost = h('div', { class: 'tl-dropghost' });
    this.content.append(this.ruler, this.rowsEl, this.ph, this.snapLine, this.ghost);
    this.scroll.append(this.content);
    this.centerPh = h('div', { class: 'tl-center-ph' });
    root.append(this.bar, this.scroll, this.centerPh);
    this.bindEvents();
    this.renderBar();
  },
  isM() { return document.body.classList.contains('is-m'); },
  x0() { return this.isM() ? Math.round(this.scroll.clientWidth / 2) : this.HW; },
  tToX(t) { return this.x0() + t * this.pps; },
  xToT(x) { return (x - this.x0()) / this.pps; },
  rowH(tr) {
    const m = this.isM();
    if (tr.kind === 'main') return m ? 56 : 64;
    if (tr.kind === 'video') return m ? 46 : 52;
    if (tr.kind === 'audio') return m ? 40 : 46;
    return m ? 30 : 32;
  },
  orderedTracks() {
    const p = P(); const vis = p.tracks.filter(t => t.kind !== 'audio').reverse();
    return [...vis, ...p.tracks.filter(t => t.kind === 'audio')];
  },

  /* ---------------- toolbar ---------------- */
  renderBar() {
    const b = this.bar; b.innerHTML = '';
    const btn = (ic, title, fn, id) => { const x = h('button', { class: 'icon-btn', type: 'button', title, onclick: fn }, icon(ic)); if (id) x.id = id; return x; };
    const sep = () => h('span', { class: 'vsep' });
    if (!this.isM()) {
      b.append(
        btn('split', 'Potong di playhead (Ctrl+B)', () => Act.split()),
        btn('trimL', 'Hapus kiri playhead (Q)', () => Act.trimAt('l')),
        btn('trimR', 'Hapus kanan playhead (W)', () => Act.trimAt('r')),
        btn('trash', 'Hapus (Delete)', () => Act.del()),
        sep(),
        btn('freeze', 'Bekukan frame', () => Act.freeze()),
        btn('duplicate', 'Duplikat (Ctrl+D)', () => Act.duplicate()),
        btn('flipH', 'Cermin', () => Act.mirror()),
        btn('rotate', 'Putar 90°', () => Act.rotate90()),
        btn('crop', 'Potong gambar', () => Act.openInspector('crop')),
        btn('wave', 'Pisahkan audio', () => Act.extractAudio()),
        sep(),
        btn('kf', 'Tambah keyframe', () => Act.addKeyframe()),
        btn('marker', 'Tambah penanda (M)', () => Act.addMarker()),
        h('span', { class: 'flex' }),
      );
    } else {
      b.append(
        btn('kf', 'Keyframe', () => Act.addKeyframe()),
        btn('marker', 'Penanda', () => Act.addMarker()),
        h('span', { class: 'flex' }),
      );
    }
    const mag = btn('magnet', 'Magnet trek utama (tanpa celah)', () => { S.magnet = !S.magnet; mag.classList.toggle('on', S.magnet); if (S.magnet) { Hist.save(); compactMain(); App.changed({ tl: true }); } toast(S.magnet ? 'Magnet aktif' : 'Magnet nonaktif', null, 1000); });
    mag.classList.toggle('on', S.magnet);
    const snp = btn('snap', 'Tempel otomatis (snap)', () => { S.snap = !S.snap; snp.classList.toggle('on', S.snap); });
    snp.classList.toggle('on', S.snap);
    const zr = h('input', { type: 'range', min: 0, max: 100, step: 1 });
    this.zoomRange = zr;
    zr.addEventListener('input', () => { const v = +zr.value / 100; this.setZoom(this.minPps * Math.pow(this.maxPps / this.minPps, v)); });
    b.append(mag, snp, sep(), h('div', { class: 'tl-zoom' }, btn('zoomOut', 'Perkecil', () => this.setZoom(this.pps / 1.4)), this.isM() ? null : zr, btn('zoomIn', 'Perbesar', () => this.setZoom(this.pps * 1.4)), btn('fit', 'Muat semua', () => this.fit())));
    this.syncZoomRange();
  },
  syncZoomRange() {
    if (!this.zoomRange) return;
    const v = Math.log(this.pps / this.minPps) / Math.log(this.maxPps / this.minPps) * 100;
    this.zoomRange.value = v; this.zoomRange.style.setProperty('--p', v + '%');
  },
  setZoom(pps, anchorClientX) {
    pps = clamp(pps, this.minPps, this.maxPps);
    const sr = this.scroll.getBoundingClientRect();
    let ax, at;
    if (this.isM()) { at = S.time; }
    else {
      ax = anchorClientX != null ? anchorClientX - sr.left : (this.tToX(S.time) - this.scroll.scrollLeft);
      if (ax < this.HW || ax > sr.width) ax = this.HW + 40;
      at = this.xToT(this.scroll.scrollLeft + ax);
    }
    this.pps = pps;
    this.render();
    if (this.isM()) this.syncScrollToTime();
    else this.scroll.scrollLeft = Math.max(0, this.tToX(at) - ax);
    this.syncZoomRange();
    this.drawRuler();
  },
  fit() {
    const d = Math.max(projDuration(), 3);
    const w = this.scroll.clientWidth - (this.isM() ? 40 : this.HW + 40);
    this.setZoom(w / d);
    if (!this.isM()) this.scroll.scrollLeft = 0;
  },

  /* ---------------- render ---------------- */
  render() {
    if (!P()) return;
    const m = this.isM();
    this.content.style.setProperty('--hw', this.HW + 'px');
    const vw = this.scroll.clientWidth || 800;
    const dur = projDuration();
    const width = Math.ceil(this.x0() + Math.max(dur + (m ? 0 : 20), m ? dur : vw / this.pps) * this.pps + (m ? vw / 2 : 240));
    this.content.style.width = width + 'px';
    this.rowsEl.innerHTML = '';
    this.rows = [];
    let y = m ? 10 : 6;
    const tracks = this.orderedTracks();
    for (const tr of tracks) {
      const rh = this.rowH(tr);
      const row = h('div', { class: 'trow' + (tr.kind === 'main' ? ' main' : '') + (tr.locked ? ' locked' : '') + (tr.hidden ? ' hiddenT' : ''), style: { top: y + 'px', height: rh + 'px', width: width + 'px' }, dataset: { tid: tr.id } });
      if (!m) row.append(this.trackHead(tr));
      for (const c of clipsOn(tr.id)) row.append(this.clipEl(c, tr, rh));
      if (tr.kind === 'main' || tr.kind === 'video') this.cutButtons(row, tr, rh);
      this.rowsEl.append(row);
      this.rows.push({ track: tr, y, h: rh, el: row });
      y += rh + (m ? 6 : 2);
    }
    if (!P().clips.length) {
      this.rowsEl.append(h('div', { class: 'tl-empty', style: { top: '74px' } }, h('span', null, m ? 'Ketuk + untuk menambah media' : 'Seret media ke sini, atau klik + pada media')));
    }
    this.rowsEl.style.height = (y + 70) + 'px';
    this.content.style.height = (this.RULER + y + 70) + 'px';
    this.centerPh.style.display = m ? 'block' : 'none';
    this.ph.style.display = m ? 'none' : 'block';
    this.drawRuler();
    this.updatePlayhead();
  },
  trackHead(tr) {
    const kIcon = { main: 'media', video: 'overlay', text: 'text', effect: 'effects', audio: 'music' }[tr.kind];
    const head = h('div', { class: 'thead', title: 'Trek ' + (tr.name || TRACK_NAMES[tr.kind]) + ' (klik kanan untuk opsi)' }, h('span', { class: 'th-k' }, icon(kIcon)), h('span', { class: 'th-n' }));
    const tb = (ic, title, on, fn) => { const b = h('button', { class: 'icon-btn' + (on ? ' off' : ''), type: 'button', title }, icon(ic)); b.onclick = e => { e.stopPropagation(); fn(); }; return b; };
    if (tr.kind === 'audio' || tr.kind === 'main' || tr.kind === 'video') head.append(tb(tr.muted ? 'mute' : 'volume', tr.muted ? 'Bunyikan trek' : 'Bisukan trek', tr.muted, () => { Hist.save(); tr.muted = !tr.muted; App.changed({ tl: true }); }));
    if (tr.kind !== 'audio') head.append(tb(tr.hidden ? 'eyeOff' : 'eye', tr.hidden ? 'Tampilkan trek' : 'Sembunyikan trek', tr.hidden, () => { Hist.save(); tr.hidden = !tr.hidden; App.changed({ tl: true }); }));
    head.append(tb(tr.locked ? 'lock' : 'unlock', tr.locked ? 'Buka kunci' : 'Kunci trek', tr.locked, () => { tr.locked = !tr.locked; if (tr.locked) clipsOn(tr.id).forEach(c => S.sel.delete(c.id)); App.changed({ tl: true, insp: true }); }));
    head.addEventListener('contextmenu', e => {
      e.preventDefault();
      const p = P(); const i = p.tracks.indexOf(tr);
      ctxMenu(e.clientX, e.clientY, [
        { label: 'Pindah ke atas', icon: 'chevD', action: () => this.moveTrack(tr, tr.kind === 'audio' ? -1 : 1), disabled: tr.kind === 'main' },
        { label: 'Pindah ke bawah', icon: 'chevD', action: () => this.moveTrack(tr, tr.kind === 'audio' ? 1 : -1), disabled: tr.kind === 'main' },
        { sep: true },
        { label: 'Pilih semua klip di trek', icon: 'layers', action: () => App.select(clipsOn(tr.id).map(c => c.id)) },
        { label: 'Hapus trek', icon: 'trash', danger: true, disabled: tr.kind === 'main', action: () => { Hist.save(); p.clips = p.clips.filter(c => c.trackId !== tr.id); p.tracks.splice(i, 1); App.changed({ tl: true, insp: true }); } },
      ]);
    });
    return head;
  },
  moveTrack(tr, dir) {
    const p = P(); const i = p.tracks.indexOf(tr); const j = i + dir;
    if (j < 0 || j >= p.tracks.length) return;
    const o = p.tracks[j]; if (o.kind === 'main' || (o.kind === 'audio') !== (tr.kind === 'audio')) return;
    Hist.save(); p.tracks[i] = o; p.tracks[j] = tr; App.changed({ tl: true });
  },
  clipEl(c, tr, rh) {
    const pps = this.pps, w = Math.max(2, c.dur * pps);
    const el = h('div', { class: `clip c-${c.type}` + (S.sel.has(c.id) ? ' sel' : '') + (c.muted ? ' muted' : ''), style: { left: this.tToX(c.start) + 'px', width: w + 'px' }, dataset: { id: c.id } });
    const m = c.mediaId ? mediaById(c.mediaId) : null;
    const rt = m ? Media.get(m.id) : null;
    const isMedia = c.type === 'video' || c.type === 'image';
    const showWave = (c.type === 'video' && m && m.hasAudio && rt && rt.peaks && rh >= 46) || c.type === 'audio';
    if (isMedia && rt && rt.thumbs) {
      const th = rh - 4 - (showWave && c.type === 'video' ? 16 : 0);
      const wrap = h('div', { class: 'c-thumbs' + (showWave && c.type === 'video' ? ' wv' : '') });
      const s0 = Media.thumbStyle(m.id, 0, th);
      if (s0) {
        let slot = s0.w; let n = Math.ceil(w / slot);
        if (n > 300) { slot = w / 300; n = 300; }
        for (let i = 0; i < n; i++) {
          const lt = (i * slot + slot / 2) / pps;
          const mt = c.type === 'video' ? Engine.mediaTime(c, c.start + lt) : 0;
          const s = Media.thumbStyle(m.id, mt, th);
          wrap.append(h('div', { class: 'c-slot', style: { width: slot + 'px', backgroundImage: `url(${s.url})`, backgroundPosition: s.pos, backgroundSize: s.size } }));
        }
      }
      el.append(wrap);
    }
    if (showWave) {
      const cv = h('canvas', { class: 'c-wave' });
      el.append(cv);
      requestAnimationFrame(() => this.drawWave(cv, c, m, rt, w));
    }
    const ic = { video: 'media', image: 'image', audio: 'music', text: 'text', sticker: 'sticker', effect: 'effects', filter: 'filter', adjust: 'adjust' }[c.type];
    const label = h('div', { class: 'c-label' }, icon(ic), h('span', null, clipName(c)));
    if (c.curve) label.append(h('span', { class: 'c-sp' }, 'kurva'));
    else if ((c.speed || 1) !== 1) label.append(h('span', { class: 'c-sp' }, c.speed + 'x'));
    if (c.cut && c.cut.on) label.append(h('span', { class: 'c-sp' }, 'AI'));
    if (c.reversed) label.append(h('span', { class: 'c-sp' }, '◀'));
    if (c.type === 'video' && c.muted) label.append(icon('mute'));
    if (w > 70) label.append(h('span', { class: 'c-sp' }, fmtSec(c.dur)));
    el.append(label);
    if (c.fadeIn > 0) el.append(h('div', { class: 'c-fade in', style: { width: c.fadeIn * pps + 'px' } }));
    if (c.fadeOut > 0) el.append(h('div', { class: 'c-fade out', style: { width: c.fadeOut * pps + 'px' } }));
    if (c.anim) {
      if (c.anim.in) el.append(h('div', { class: 'c-anim', style: { left: 0, width: Math.min(c.dur, c.anim.in.dur) * pps + 'px' } }));
      if (c.anim.out) el.append(h('div', { class: 'c-anim', style: { right: 0, width: Math.min(c.dur, c.anim.out.dur) * pps + 'px' } }));
      if (c.anim.loop) el.append(h('div', { class: 'c-anim', style: { left: 0, right: 0, opacity: .35 } }));
    }
    if (c.kf) {
      const ts = new Set();
      for (const k in c.kf) for (const f of c.kf[k]) ts.add(Math.round(f.t * 1000) / 1000);
      ts.forEach(t => { if (t >= 0 && t <= c.dur) el.append(h('div', { class: 'c-kf', style: { left: t * pps + 'px' } })); });
    }
    if (!tr.locked) {
      const hl = h('div', { class: 'c-h l' }), hr = h('div', { class: 'c-h r' });
      hl.addEventListener('pointerdown', e => this.onTrimDown(e, c, 'l', el));
      hr.addEventListener('pointerdown', e => this.onTrimDown(e, c, 'r', el));
      el.append(hl, hr);
    }
    el.addEventListener('pointerdown', e => this.onClipDown(e, c, el));
    el.addEventListener('contextmenu', e => { e.preventDefault(); if (!S.sel.has(c.id)) App.select([c.id]); App.clipMenu(e.clientX, e.clientY, c); });
    el.addEventListener('dblclick', () => App.focusInspector(c));
    return el;
  },
  drawWave(cv, c, m, rt, w) {
    if (!rt || !rt.peaks) return;
    const ch = cv.clientHeight || 16;
    const cw = Math.min(Math.ceil(w), 4000);
    cv.width = cw; cv.height = ch;
    const g = cv.getContext('2d');
    const audio = c.type === 'audio';
    g.fillStyle = audio ? 'rgba(160,255,215,.75)' : 'rgba(170,200,255,.7)';
    const vol = Math.min(2, c.volume == null ? 1 : c.volume);
    for (let x = 0; x < cw; x++) {
      const lt = x / cw * c.dur;
      const mt = Engine.mediaTime(c, c.start + lt);
      const i = Math.floor(mt * rt.pps);
      let v = rt.peaks[i] || 0;
      v = Math.min(1, v * vol * 1.15);
      const hh = Math.max(1, v * (audio ? ch * .92 : ch - 2));
      if (audio) g.fillRect(x, (ch - hh) / 2, 1, hh); else g.fillRect(x, ch - hh, 1, hh);
    }
  },
  cutButtons(row, tr, rh) {
    const arr = clipsOn(tr.id);
    for (let i = 1; i < arr.length; i++) {
      const a = arr[i - 1], b = arr[i];
      if (Math.abs(clipEnd(a) - b.start) > .02) continue;
      if (!(a.type === 'video' || a.type === 'image') || !(b.type === 'video' || b.type === 'image')) continue;
      const btn = h('button', { class: 'cut-btn' + (b.trans ? ' has' : '') + (S.selCut === b.id ? ' sel' : ''), type: 'button', title: b.trans ? 'Transisi: ' + ((TRANS_BY_ID[b.trans.id] || {}).n || '') : 'Tambah transisi', style: { left: this.tToX(b.start) + 'px' } }, icon(b.trans ? 'transition' : 'plus'));
      btn.addEventListener('pointerdown', e => e.stopPropagation());
      btn.onclick = e => { e.stopPropagation(); App.selectCut(b.id); };
      row.append(btn);
    }
  },
  drawRuler() {
    if (!P()) return;
    const cw = this.scroll.clientWidth, sl = this.scroll.scrollLeft;
    this.ruler.style.width = cw + 'px';
    const dpr = Math.min(2, devicePixelRatio || 1);
    const cv = this.rulerCv;
    if (cv.width !== cw * dpr) { cv.width = cw * dpr; cv.height = this.RULER * dpr; cv.style.width = cw + 'px'; cv.style.height = this.RULER + 'px'; }
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, cw, this.RULER);
    const fps = P().fps;
    const steps = [1 / fps, 2 / fps, 5 / fps, .5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1200];
    let major = steps.find(s => s * this.pps >= 70) || 1800;
    const minor = major >= 1 ? major / (major === 15 || major === 30 ? 3 : 5) : major / 2;
    const t0 = this.xToT(sl), t1 = this.xToT(sl + cw);
    g.font = '10px ' + getComputedStyle(document.body).fontFamily;
    g.textBaseline = 'top';
    const x0 = this.x0();
    for (let t = Math.max(0, Math.floor(t0 / minor) * minor); t <= t1 + minor; t += minor) {
      const x = Math.round(x0 + t * this.pps - sl) + .5;
      const isMaj = Math.abs(t / major - Math.round(t / major)) < 1e-6;
      g.fillStyle = isMaj ? '#6f6f7e' : '#3a3a46';
      g.fillRect(x, isMaj ? 14 : 20, 1, isMaj ? 14 : 8);
      if (isMaj) {
        g.fillStyle = '#8a8a99';
        let lbl;
        const whole = Math.abs(t - Math.round(t)) < 1e-6;
        if (whole || major >= 1) lbl = fmtDur(Math.round(t));
        else lbl = Math.round((t % 1) * fps) + 'f';
        g.fillText(lbl, x + 3, 3);
      }
    }
    for (const mk of (P().markers || [])) {
      const x = x0 + mk.t * this.pps - sl;
      if (x < -10 || x > cw + 10) continue;
      g.fillStyle = mk.color || '#ffc93c';
      g.beginPath(); g.moveTo(x - 5, 14); g.lineTo(x + 5, 14); g.lineTo(x + 5, 22); g.lineTo(x, 27); g.lineTo(x - 5, 22); g.fill();
    }
    if (!this.isM() && sl < this.HW) {
      g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg1') || '#15151a';
      g.fillRect(0, 0, Math.max(0, this.HW - sl), this.RULER);
    }
  },
  updatePlayhead(follow) {
    if (!P()) return;
    if (this.isM()) { this.syncScrollToTime(); return; }
    const x = this.tToX(S.time);
    this.ph.style.transform = `translateX(${x}px)`;
    this.ph.style.height = this.content.style.height;
    const sl = this.scroll.scrollLeft, cw = this.scroll.clientWidth;
    this.ph.style.visibility = x < sl + this.HW - 1 ? 'hidden' : 'visible';
    if (follow && (x > sl + cw - 30 || x < sl + this.HW)) this.scroll.scrollLeft = Math.max(0, x - this.HW - 30);
  },
  syncScrollToTime() {
    const want = S.time * this.pps;
    if (Math.abs(this.scroll.scrollLeft - want) > .5) { this._prog = true; this.scroll.scrollLeft = want; }
  },
  refreshSelection() {
    $$('.clip', this.rowsEl).forEach(el => el.classList.toggle('sel', S.sel.has(el.dataset.id)));
    $$('.cut-btn', this.rowsEl).forEach(b => b.classList.remove('sel'));
  },

  /* ---------------- interaksi ---------------- */
  bindEvents() {
    const sc = this.scroll;
    sc.addEventListener('scroll', () => {
      this.drawRuler();
      if (this.isM()) {
        if (this._prog) { this._prog = false; return; }
        const t = sc.scrollLeft / this.pps;
        if (Math.abs(t - S.time) * this.pps > 1.5) { if (Engine.playing) Engine.pause(); Engine.seek(Math.min(t, projDuration())); }
      } else this.updatePlayhead();
    }, { passive: true });
    sc.addEventListener('wheel', e => {
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); this.setZoom(this.pps * Math.pow(1.0018, -e.deltaY), e.clientX); }
      else if (!e.shiftKey && Math.abs(e.deltaY) > Math.abs(e.deltaX) && !this.isM() && e.altKey) { e.preventDefault(); sc.scrollLeft += e.deltaY; }
    }, { passive: false });
    // pinch zoom
    let pinch = null;
    sc.addEventListener('touchstart', e => { if (e.touches.length === 2) { const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); pinch = { d, pps: this.pps }; } }, { passive: true });
    sc.addEventListener('touchmove', e => {
      if (this.dragging) { e.preventDefault(); return; }
      if (pinch && e.touches.length === 2) {
        e.preventDefault();
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        this.setZoom(pinch.pps * d / pinch.d, (e.touches[0].clientX + e.touches[1].clientX) / 2);
      }
    }, { passive: false });
    sc.addEventListener('touchend', e => { if (e.touches.length < 2) pinch = null; });
    // ruler & area kosong
    this.ruler.addEventListener('pointerdown', e => this.onScrubDown(e));
    this.ph.querySelector('.ph-h').addEventListener('pointerdown', e => this.onScrubDown(e));
    this.ruler.addEventListener('contextmenu', e => {
      e.preventDefault();
      const t = this.timeAtClient(e.clientX);
      const mk = (P().markers || []).find(m => Math.abs(m.t - t) * this.pps < 7);
      if (mk) ctxMenu(e.clientX, e.clientY, [{ label: 'Hapus penanda', icon: 'trash', danger: true, action: () => { Hist.save(); P().markers = P().markers.filter(m => m !== mk); App.changed({ tl: true }); } }]);
    });
    this.rowsEl.addEventListener('pointerdown', e => {
      if (e.target.closest('.clip,.thead,.cut-btn')) return;
      if (e.button !== 0) return;
      App.select([]);
      if (!this.isM()) { Engine.seek(Math.max(0, this.timeAtClient(e.clientX))); this.onScrubDown(e, true); }
    });
    // seret dari panel media / file
    sc.addEventListener('dragover', e => {
      const types = Array.from(e.dataTransfer.types || []);
      if (!types.includes('application/x-klm') && !types.includes('Files')) return;
      e.preventDefault(); e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
      const r = this.content.getBoundingClientRect();
      const t = Math.max(0, this.timeAtClient(e.clientX));
      const row = this.rowAtY(e.clientY);
      this.ghost.style.display = 'block';
      this.ghost.style.left = this.tToX(t) + 'px';
      this.ghost.style.width = Math.max(40, 3 * this.pps) + 'px';
      this.ghost.style.top = (this.RULER + (row && row.row ? row.row.y : (row && row.edge === 'top' ? 0 : this.rowsBottom()))) + 'px';
      this.ghost.style.height = (row && row.row ? row.row.h : 30) + 'px';
      void r;
    });
    sc.addEventListener('dragleave', e => { if (!sc.contains(e.relatedTarget)) this.ghost.style.display = 'none'; });
    sc.addEventListener('drop', async e => {
      this.ghost.style.display = 'none';
      const data = e.dataTransfer.getData('application/x-klm');
      const files = Array.from(e.dataTransfer.files || []);
      if (!data && !files.length) return;
      e.preventDefault(); e.stopPropagation();
      const t = Math.max(0, this.timeAtClient(e.clientX));
      const row = this.rowAtY(e.clientY);
      const track = row && row.row ? row.row.track : null;
      if (data) {
        const d = JSON.parse(data);
        if (d.kind === 'media') App.addMediaClip(d.id, { time: t, track, drop: true });
        else if (d.kind === 'effect' && d.clipTarget !== false) {
          const c = this.clipAt(e.clientX, e.clientY);
          if (c && (c.type === 'video' || c.type === 'image')) { Act.addClipFx(c, d.id); } else App.addEffectClip(d.id, t);
        } else if (d.kind === 'filter') {
          const c = this.clipAt(e.clientX, e.clientY);
          if (c && (c.type === 'video' || c.type === 'image')) Act.setClipFilter(c, d.id); else App.addFilterClip(d.id, t);
        } else if (d.kind === 'transition') {
          const c = this.clipAt(e.clientX, e.clientY);
          if (c) Act.applyTransitionNear(c, d.id, t);
        }
      } else {
        const ms = await Media.importFiles(files);
        let tt = t;
        for (const m of ms) { const c = App.addMediaClip(m.id, { time: tt, track, drop: true }); if (c) tt = clipEnd(c); }
      }
    });
  },
  rowsBottom() { const r = this.rows[this.rows.length - 1]; return r ? r.y + r.h + 4 : 0; },
  timeAtClient(cx) { const r = this.content.getBoundingClientRect(); return this.xToT(cx - r.left); },
  rowAtY(cy) {
    const r = this.rowsEl.getBoundingClientRect(); const y = cy - r.top;
    for (const row of this.rows) if (y >= row.y - 1 && y < row.y + row.h + 2) return { row };
    if (this.rows.length && y < this.rows[0].y) return { edge: 'top' };
    return { edge: 'bottom' };
  },
  clipAt(cx, cy) {
    const el = document.elementsFromPoint(cx, cy).find(x => x.classList && x.classList.contains('clip'));
    return el ? clipById(el.dataset.id) : null;
  },
  onScrubDown(e, already) {
    if (e.button !== 0) return;
    e.preventDefault();
    const wasPlaying = Engine.playing; if (wasPlaying) Engine.pause();
    const t0 = this.timeAtClient(e.clientX);
    const mk = (P().markers || []).find(m => Math.abs(m.t - t0) * this.pps < 6);
    if (!already) Engine.seek(Math.max(0, mk ? mk.t : t0));
    const move = ev => { let t = Math.max(0, this.timeAtClient(ev.clientX)); if (S.snap) { const s = this.snapTime(t, null, true); if (s != null) t = s; } Engine.seek(t); this.updatePlayhead(); };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  },
  buildSnap(excl) {
    const pts = [0];
    if (!Engine.playing) pts.push(S.time);
    for (const c of P().clips) { if (excl && excl.has(c.id)) continue; pts.push(c.start, clipEnd(c)); }
    for (const m of (P().markers || [])) pts.push(m.t);
    this.snapPts = pts;
  },
  snapTime(t, excl, noPlayhead) {
    const thr = 9 / this.pps; let best = null;
    const pts = this.snapPts || (this.buildSnap(excl), this.snapPts);
    for (const p of pts) { if (noPlayhead && p === S.time) continue; const d = p - t; if (Math.abs(d) < thr && (best == null || Math.abs(d) < Math.abs(best - t))) best = p; }
    return best;
  },
  showSnap(t) { if (t == null) { this.snapLine.style.display = 'none'; return; } this.snapLine.style.display = 'block'; this.snapLine.style.left = this.tToX(t) + 'px'; this.snapLine.style.height = this.content.style.height; },

  onClipDown(e, c, el) {
    if (e.button === 2) return;
    if (e.target.closest('.c-h')) return;
    const tr = trackById(c.trackId); if (!tr || tr.locked) return;
    e.stopPropagation();
    const add = e.shiftKey || e.ctrlKey || e.metaKey;
    if (add) { if (S.sel.has(c.id)) S.sel.delete(c.id); else S.sel.add(c.id); App.select([...S.sel]); }
    else if (!S.sel.has(c.id)) App.select([c.id]);
    const touch = e.pointerType === 'touch';
    const ids = [...S.sel].filter(id => { const x = clipById(id); return x && !(trackById(x.trackId) || {}).locked; });
    const st = { c, el, x0: e.clientX, y0: e.clientY, pid: e.pointerId, armed: !touch, moved: false, ids, orig: {}, delta: 0, target: null };
    ids.forEach(id => st.orig[id] = clipById(id).start);
    if (touch) st.timer = setTimeout(() => { st.armed = true; this.dragging = true; el.classList.add('lift'); if (navigator.vibrate) navigator.vibrate(12); }, 340);
    const move = ev => this.onDragMove(ev, st);
    const up = ev => {
      if (ev.pointerId !== st.pid) return;
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      this.onDragUp(ev, st);
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  },
  onDragMove(ev, st) {
    if (ev.pointerId !== st.pid) return;
    const dx = ev.clientX - st.x0, dy = ev.clientY - st.y0;
    if (!st.armed) { if (Math.hypot(dx, dy) > 9) { clearTimeout(st.timer); st.cancel = true; } return; }
    if (!st.moved) {
      if (Math.hypot(dx, dy) < 4) return;
      st.moved = true; this.dragging = true;
      this.buildSnap(new Set(st.ids));
      st.ids.forEach(id => { const x = this.rowsEl.querySelector(`.clip[data-id="${id}"]`); if (x) x.classList.add('drag'); });
      st.els = st.ids.map(id => this.rowsEl.querySelector(`.clip[data-id="${id}"]`));
    }
    const c = st.c;
    let ns = st.orig[c.id] + dx / this.pps;
    let snapAt = null;
    if (S.snap) {
      const a = this.snapTime(ns), b = this.snapTime(ns + c.dur);
      const da = a == null ? 1e9 : Math.abs(a - ns), db = b == null ? 1e9 : Math.abs(b - (ns + c.dur));
      if (da < db && a != null) { ns = a; snapAt = a; } else if (b != null) { ns = b - c.dur; snapAt = b; }
    }
    let delta = ns - st.orig[c.id];
    const minOrig = Math.min(...st.ids.map(id => st.orig[id]));
    if (minOrig + delta < 0) delta = -minOrig;
    st.delta = delta;
    this.showSnap(snapAt);
    st.ids.forEach((id, i) => { const x = st.els[i]; if (x) x.style.left = this.tToX(st.orig[id] + delta) + 'px'; });
    if (st.ids.length === 1) {
      const row = this.rowAtY(ev.clientY);
      st.target = row;
      const tgt = row.row ? row.row : null;
      const el = st.els[0];
      if (el) {
        const cur = this.rows.find(r => r.track.id === c.trackId);
        const ty = tgt ? tgt.y : (row.edge === 'top' ? -24 : this.rowsBottom());
        el.style.transform = `translateY(${(ty - (cur ? cur.y : 0))}px)`;
      }
      this.rows.forEach(r => r.el.classList.toggle('drop-hl', !!tgt && r === tgt && r.track.id !== c.trackId));
    }
    // gulir otomatis
    const sr = this.scroll.getBoundingClientRect();
    if (ev.clientX > sr.right - 30) this.scroll.scrollLeft += 12;
    else if (ev.clientX < sr.left + (this.isM() ? 30 : this.HW + 20)) this.scroll.scrollLeft -= 12;
  },
  onDragUp(ev, st) {
    clearTimeout(st.timer);
    this.dragging = false;
    this.showSnap(null);
    this.rows.forEach(r => r.el.classList.remove('drop-hl'));
    st.el.classList.remove('lift');
    if (!st.moved) {
      if (!st.cancel && S.sel.size > 1 && !(ev.shiftKey || ev.ctrlKey || ev.metaKey)) App.select([st.c.id]);
      return;
    }
    Hist.save();
    const c = st.c; const p = P();
    for (const id of st.ids) { const x = clipById(id); if (x) x.start = Math.max(0, st.orig[id] + st.delta); }
    let target = null;
    if (st.ids.length === 1 && st.target) {
      if (st.target.row) target = st.target.row.track;
      if (!target || target.locked || !TRACK_ACCEPT[target.kind].includes(c.type)) target = addTrack(trackKindFor(c.type));
    }
    const tr = target || trackById(c.trackId);
    if (st.ids.length === 1) {
      const fromMain = trackById(c.trackId).kind === 'main';
      c.trackId = tr.id;
      if (tr.kind === 'main' && S.magnet) {
        // sisipkan berdasarkan posisi tengah
        const mid = c.start + c.dur / 2;
        const others = clipsOn(tr.id).filter(x => x !== c);
        let idx = others.findIndex(x => mid < x.start + x.dur / 2);
        if (idx < 0) idx = others.length;
        others.splice(idx, 0, c);
        let t = 0; for (const x of others) { x.start = t; t += x.dur; }
      } else {
        if (overlaps(tr.id, c.start, clipEnd(c), new Set([c.id]))) {
          const nt = tr.kind === 'main' ? freeTrackFor(c.type, c.start, clipEnd(c)) : (() => { const t2 = p.tracks.find(t => t !== tr && t.kind === tr.kind && !t.locked && !overlaps(t.id, c.start, clipEnd(c), new Set([c.id]))); return t2 || addTrack(tr.kind === 'main' ? 'video' : tr.kind, { after: tr }); })();
          c.trackId = nt.id;
        }
        if (fromMain) compactMain();
      }
    } else {
      // banyak klip: pisahkan yang bertabrakan ke trek lain
      for (const id of st.ids) {
        const x = clipById(id); if (!x) continue;
        const t = trackById(x.trackId);
        if (t.kind === 'main' && S.magnet) continue;
        const others = new Set(st.ids);
        if (P().clips.some(o => o.trackId === x.trackId && !others.has(o.id) && o.start < clipEnd(x) - 1e-4 && clipEnd(o) > x.start + 1e-4)) x.trackId = freeTrackFor(x.type, x.start, clipEnd(x)).id;
      }
      compactMain();
    }
    removeEmptyTracks();
    App.changed({ tl: true, insp: true });
  },
  onTrimDown(e, c, side, el) {
    if (e.button !== 0) return;
    e.stopPropagation(); e.preventDefault();
    if (!S.sel.has(c.id)) App.select([c.id]);
    const m = c.mediaId ? mediaById(c.mediaId) : null;
    const spd = clipAvgSpeed(c), MIN = 1 / P().fps;
    const tr = trackById(c.trackId);
    const rip = tr.kind === 'main' && S.magnet;
    const sibs = clipsOn(c.trackId).filter(x => x !== c);
    const prevEnd = rip ? 0 : Math.max(0, ...sibs.filter(x => clipEnd(x) <= c.start + 1e-4).map(clipEnd));
    const nextStart = rip ? Infinity : Math.min(Infinity, ...sibs.filter(x => x.start >= clipEnd(c) - 1e-4).map(x => x.start));
    const st = { x0: e.clientX, start0: c.start, dur0: c.dur, in0: c.in || 0, saved: false };
    const isTimed = c.type === 'video' || c.type === 'audio';
    const minStart = Math.max(prevEnd, isTimed ? c.start - st.in0 / spd : 0);
    const maxEnd = Math.min(nextStart, isTimed && m ? c.start + (m.duration - st.in0) / spd : Infinity);
    this.buildSnap(new Set([c.id]));
    const pid = e.pointerId;
    const move = ev => {
      if (ev.pointerId !== pid) return;
      const dt = (ev.clientX - st.x0) / this.pps;
      if (!st.saved) { if (Math.abs(ev.clientX - st.x0) < 2) return; Hist.save(); st.saved = true; }
      let snapAt = null;
      if (side === 'l') {
        let ns = clamp(st.start0 + dt, minStart, st.start0 + st.dur0 - MIN);
        if (S.snap) { const s = this.snapTime(ns); if (s != null && s >= minStart && s <= st.start0 + st.dur0 - MIN) { ns = s; snapAt = s; } }
        c.start = ns; c.dur = st.dur0 - (ns - st.start0);
        if (isTimed) c.in = Math.max(0, st.in0 + (ns - st.start0) * spd);
      } else {
        let ne = clamp(st.start0 + st.dur0 + dt, st.start0 + MIN, maxEnd);
        if (S.snap) { const s = this.snapTime(ne); if (s != null && s <= maxEnd && s >= st.start0 + MIN) { ne = s; snapAt = s; } }
        c.dur = ne - st.start0;
      }
      this.showSnap(snapAt);
      el.style.left = this.tToX(c.start) + 'px'; el.style.width = Math.max(2, c.dur * this.pps) + 'px';
      Comp.invalidate();
      if (!Engine.playing) { S.time = side === 'l' ? c.start : Math.max(c.start, clipEnd(c) - 1 / P().fps); Engine.requestRender(); App.onTime(S.time); }
    };
    const up = ev => {
      if (ev.pointerId !== pid) return;
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      this.showSnap(null);
      if (!st.saved) return;
      if (side === 'l') {
        const d = c.start - st.start0;
        if (c.kf) for (const k in c.kf) c.kf[k].forEach(f => f.t -= d);
        if (rip) { compactMain(); S.time = c.start; }
      } else if (rip) compactMain();
      App.changed({ tl: true, insp: true });
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  },
};
