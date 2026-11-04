'use strict';
/* =========================================================
   KLM Cut — inspektor properti (panel kanan / sheet di HP)
   ========================================================= */
const TABS = {
  video: [['Video', ['transform', 'blend', 'crop']], ['AI & Pro', ['ai', 'retouch', 'protools']], ['Animasi', ['anim']], ['Kecepatan', ['speed']], ['Warna', ['autocolor', 'filter', 'adjust']], ['Efek', ['clipfx', 'mask', 'chroma']], ['Audio', ['audio', 'audiopro', 'voice']]],
  image: [['Gambar', ['transform', 'blend', 'crop']], ['AI & Pro', ['ai', 'retouch', 'protools']], ['Animasi', ['anim']], ['Warna', ['autocolor', 'filter', 'adjust']], ['Efek', ['clipfx', 'mask', 'chroma']]],
  text: [['Teks', ['text', 'tts']], ['Gaya', ['textstyle']], ['Posisi', ['transform', 'blend']], ['Animasi', ['anim']]],
  sticker: [['Stiker', ['sticker', 'transform', 'blend']], ['Animasi', ['anim']]],
  audio: [['Audio', ['audio', 'audiopro']], ['Kecepatan', ['speed']], ['Efek suara', ['voice']]],
  effect: [['Efek', ['effectclip']]],
  filter: [['Filter', ['filterclip']]],
  adjust: [['Penyesuaian', ['adjustclip']]],
};
const TYPE_COLOR = { video: 'var(--c-video)', image: 'var(--c-image)', audio: 'var(--c-audio)', text: 'var(--c-text)', sticker: 'var(--c-sticker)', effect: 'var(--c-effect)', filter: 'var(--c-filter)', adjust: 'var(--c-adjust)' };
const TYPE_ICON = { video: 'media', image: 'image', audio: 'music', text: 'text', sticker: 'sticker', effect: 'effects', filter: 'filter', adjust: 'adjust' };
const TYPE_NAME = { video: 'Video', image: 'Gambar', audio: 'Audio', text: 'Teks', sticker: 'Stiker', effect: 'Efek', filter: 'Filter', adjust: 'Penyesuaian' };

const Insp = {
  tabs: {}, live: [], animTab: 'in',
  root() { return $('#inspector'); },
  render() {
    const root = this.root(); if (!root || !P()) return;
    if (document.body.classList.contains('is-m')) { root.innerHTML = ''; return; }
    const st = root.querySelector('.ins-body'); const scrollTop = st ? st.scrollTop : 0;
    root.innerHTML = ''; this.live = [];
    const ids = [...S.sel];
    if (S.selCut && clipById(S.selCut)) { root.append(this.head('transition', 'Transisi'), h('div', { class: 'ins-body' }, this.section('transition', clipById(S.selCut)))); return; }
    if (!ids.length) { root.append(this.head(null, 'Proyek'), h('div', { class: 'ins-body' }, this.section('project'))); return; }
    if (ids.length > 1) { root.append(this.head(null, ids.length + ' klip dipilih'), h('div', { class: 'ins-body' }, this.multi(ids))); return; }
    const c = clipById(ids[0]); if (!c) return;
    let tabs = TABS[c.type] || [];
    if (c.type === 'video' && !hasMediaAudio(c)) tabs = tabs.filter(t => t[0] !== 'Audio');
    let cur = this.tabs[c.type]; if (!tabs.find(t => t[0] === cur)) cur = tabs[0][0];
    const tabBar = h('div', { class: 'ins-tabs' });
    tabs.forEach(([n]) => { const b = h('button', { class: 'itab' + (n === cur ? ' on' : ''), type: 'button' }, n); b.onclick = () => { this.tabs[c.type] = n; this.render(); }; tabBar.append(b); });
    const body = h('div', { class: 'ins-body' });
    for (const s of (tabs.find(t => t[0] === cur) || tabs[0])[1]) { const el = this.section(s, c); if (el) body.append(el); }
    root.append(this.head(c), tabs.length > 1 ? tabBar : null, body);
    body.scrollTop = scrollTop;
  },
  head(c, title) {
    const ic = c && typeof c === 'object' ? TYPE_ICON[c.type] : (c === 'transition' ? 'transition' : 'settings');
    const col = c && typeof c === 'object' ? TYPE_COLOR[c.type] : 'var(--bg4)';
    const t = c && typeof c === 'object' ? clipName(c) : title;
    const hd = h('div', { class: 'ins-head' }, h('span', { class: 'ih-ico', style: { background: col } }, icon(ic)), h('span', { class: 'ih-t' }, t));
    if (c && typeof c === 'object') {
      hd.append(h('span', { class: 'tag' }, fmtSec(c.dur)));
      if (['video', 'image', 'text', 'sticker', 'audio'].includes(c.type)) {
        const nav = h('div', { class: 'kfnav' },
          h('button', { class: 'icon-btn', type: 'button', title: 'Keyframe sebelumnya', onclick: () => Act.jumpKf(c, -1) }, icon('kfPrev')),
          h('button', { class: 'icon-btn', type: 'button', title: 'Tambah keyframe di semua properti', onclick: () => Act.addKeyframe(c) }, icon('kf')),
          h('button', { class: 'icon-btn', type: 'button', title: 'Keyframe berikutnya', onclick: () => Act.jumpKf(c, 1) }, icon('kfNext')));
        hd.append(nav);
      }
    }
    return hd;
  },
  refreshValues() {
    for (const l of this.live) { try { l.row._set(l.get()); } catch (e) { } }
  },
  /* untuk HP: render satu bagian ke kontainer */
  renderSection(key, c, root) { this.live = []; root.innerHTML = ''; const el = this.section(key, c, true); if (el) root.append(el); },
  section(key, c, flat) {
    const fn = this['s_' + key]; if (!fn) return null;
    return fn.call(this, c, flat);
  },
  wrap(title, body, flat, o) { return flat ? h('div', { class: 'sec-b', style: { padding: 0 } }, body) : UI.section(title, body, o); },

  /* ---------- helper kontrol ---------- */
  lt(c) { return clamp(S.time - c.start, 0, c.dur); },
  kfSlider(c, prop, o) {
    const to = o.to || (v => v), from = o.from || (v => v);
    const row = UI.slider({
      label: o.label, min: o.min, max: o.max, step: o.step || 1, value: to(Comp.kfVal(c, prop, this.lt(c))),
      def: o.def != null ? to(o.def) : null,
      onStart: () => Hist.save(),
      onInput: v => { Act.setProp(c, prop, from(v)); Comp.invalidate(); Engine.requestRender(); if (prop === 'volume') TL.render(); },
      onChange: () => App.changed({ tl: Act.hasKf(c), insp: false }),
      kf: { state: () => Act.kfState(c, prop), toggle: () => { Hist.save(); Act.toggleKf(c, prop); App.changed({ tl: true }); this.refreshValues(); } },
    });
    this.live.push({ row, get: () => to(Comp.kfVal(c, prop, this.lt(c))) });
    return row;
  },
  pSlider(obj, path, o) {
    const sc = o.scale || 1;
    const get = () => { const v = getPath(obj, path); return v == null ? (o.dflt || 0) : v; };
    const row = UI.slider({
      label: o.label, min: o.min, max: o.max, step: o.step || 1, value: get() * sc, def: o.def != null ? o.def * sc : null,
      onStart: () => Hist.save(),
      onInput: v => { setPath(obj, path, v / sc); o.onInput && o.onInput(v / sc); Comp.invalidate(); Engine.requestRender(); },
      onChange: () => { App.changed({ tl: !!o.tl, insp: !!o.insp }); },
    });
    return row;
  },
  colorRow(label, obj, path, opts = {}) {
    const val = getPath(obj, path) || '#ffffff';
    const pick = UI.color(val, (v, first) => { if (first) Hist.save(); setPath(obj, path, v); pick.style.background = v; Comp.invalidate(); Engine.requestRender(); }, () => App.changed({ tl: !!opts.tl }));
    const sw = UI.swatches(opts.swatches || SWATCHES, val, v => { Hist.save(); setPath(obj, path, v); pick.style.background = v; pick.querySelector('input').value = v; App.changed({ tl: !!opts.tl }); });
    return h('div', { class: 'row', style: { alignItems: 'flex-start' } }, h('span', { class: 'lbl', style: { paddingTop: '4px' } }, label), h('div', { class: 'grow', style: { display: 'flex', gap: '8px', alignItems: 'flex-start' } }, pick, sw));
  },
  toggleRow(label, obj, path, after) {
    return UI.row(label, h('div', { class: 'grow' }), UI.toggle(!!getPath(obj, path), v => { Hist.save(); setPath(obj, path, v); Comp.invalidate(); App.changed({ insp: true, tl: true }); after && after(v); }));
  },

  /* ---------- bagian-bagian ---------- */
  s_transform(c, flat) {
    const p = P();
    const b = [
      this.kfSlider(c, 'x', { label: 'Posisi X', min: -p.width * 1.5, max: p.width * 1.5, step: 1, to: v => Math.round(v * p.width), from: v => v / p.width, def: 0 }),
      this.kfSlider(c, 'y', { label: 'Posisi Y', min: -p.height * 1.5, max: p.height * 1.5, step: 1, to: v => Math.round(v * p.height), from: v => v / p.height, def: 0 }),
      this.kfSlider(c, 'scale', { label: 'Skala', min: 1, max: 500, step: 1, to: v => Math.round(v * 100), from: v => v / 100, def: 1 }),
      this.kfSlider(c, 'rotation', { label: 'Rotasi', min: -180, max: 180, step: 1, def: 0 }),
      this.kfSlider(c, 'opacity', { label: 'Opasitas', min: 0, max: 100, step: 1, to: v => Math.round(v * 100), from: v => v / 100, def: 1 }),
    ];
    const tools = h('div', { class: 'btn-row' },
      UI.btn('', 'flipH', () => Act.mirror(c)), UI.btn('', 'flipV', () => { Hist.save(); c.flipV = !c.flipV; App.changed({ insp: true }); }),
      UI.btn('', 'rotate', () => Act.rotate90(c)),
      UI.btn('Reset', 'rotate', () => { Hist.save(); Object.assign(c, { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 }); ['x', 'y', 'scale', 'rotation', 'opacity'].forEach(k => { if (c.kf) delete c.kf[k]; }); App.changed({ tl: true, insp: true }); }));
    $$('button', tools).slice(0, 3).forEach((x, i) => x.title = ['Cermin horizontal', 'Cermin vertikal', 'Putar 90°'][i]);
    const out = [...b, tools];
    if (c.type === 'video' || c.type === 'image') {
      out.unshift(UI.row('Ukuran', UI.seg([{ value: 'fit', label: 'Muat' }, { value: 'fill', label: 'Penuhi' }], c.fit || 'fit', v => { Hist.save(); c.fit = v; App.changed({ insp: false }); })));
    }
    out.push(UI.row('Kurva', UI.seg([{ value: 'linear', label: 'Linear' }, { value: 'smooth', label: 'Halus' }], c.kfEase || 'linear', v => { Hist.save(); c.kfEase = v; App.changed({}); })));
    out.push(h('p', { class: 'hint' }, 'Tip: seret objek langsung di pratinjau. Ketuk ◇ untuk keyframe — gerak/zoom akan dianimasikan antar keyframe.'));
    return this.wrap('Transformasi', out, flat);
  },
  s_opacity(c, flat) { return this.wrap('Opasitas', [this.kfSlider(c, 'opacity', { label: 'Opasitas', min: 0, max: 100, to: v => Math.round(v * 100), from: v => v / 100, def: 1 }), this.s_blend(c, true)], flat); },
  s_blend(c, flat) {
    return this.wrap('Campuran', [UI.row('Mode', UI.select(BLENDS.map(b => ({ value: b.id, label: b.n })), c.blend || 'normal', v => { Hist.save(); c.blend = v; App.changed({}); }))], flat, { collapsed: true });
  },
  s_crop(c, flat) {
    c.crop = c.crop || { l: 0, t: 0, r: 0, b: 0 };
    const sl = (lbl, k) => this.pSlider(c, 'crop.' + k, { label: lbl, min: 0, max: 90, step: 1, scale: 100, def: 0, onInput: () => { const cr = c.crop; if (cr.l + cr.r > .95) cr[k] = .95 - (k === 'l' ? cr.r : k === 'r' ? cr.l : 0); if (cr.t + cr.b > .95) cr[k] = .95 - (k === 't' ? cr.b : k === 'b' ? cr.t : 0); } });
    const m = mediaById(c.mediaId);
    const ratio = (rw, rh) => {
      if (!m) return; Hist.save();
      const ar = m.w / m.h, tar = rw / rh;
      if (ar > tar) { const keep = tar / ar; c.crop = { l: (1 - keep) / 2, r: (1 - keep) / 2, t: 0, b: 0 }; }
      else { const keep = ar / tar; c.crop = { l: 0, r: 0, t: (1 - keep) / 2, b: (1 - keep) / 2 }; }
      App.changed({ insp: true });
    };
    return this.wrap('Potong (crop)', [sl('Kiri', 'l'), sl('Atas', 't'), sl('Kanan', 'r'), sl('Bawah', 'b'),
      h('div', { class: 'btn-row' }, UI.btn('Bebas', null, () => { Hist.save(); c.crop = { l: 0, t: 0, r: 0, b: 0 }; App.changed({ insp: true }); }), UI.btn('16:9', null, () => ratio(16, 9)), UI.btn('9:16', null, () => ratio(9, 16)), UI.btn('1:1', null, () => ratio(1, 1)), UI.btn('4:5', null, () => ratio(4, 5)))], flat, { collapsed: !flat });
  },
  s_mask(c, flat) {
    const m = c.mask || { type: 'none', x: .5, y: .5, w: .6, h: .6, rot: 0, feather: .1, invert: false, round: 0 };
    const set = (v) => { Hist.save(); c.mask = Object.assign({}, m, { type: v }); if (v === 'linear') Object.assign(c.mask, { w: 1, h: 0 }); if (v === 'mirror') Object.assign(c.mask, { w: 1, h: .35 }); App.changed({ insp: true }); };
    const grid = h('div', { class: 'anim-grid' });
    MASKS.forEach(mk => {
      const t = h('div', { class: 'anim-t' + (m.type === mk.id ? ' on' : '') }, h('div', { class: 'at-box' }, icon(mk.id === 'none' ? 'close' : mk.id === 'circle' ? 'dot' : mk.id === 'heart' ? 'sticker' : mk.id === 'star' ? 'star' : mk.id === 'rect' ? 'bg' : mk.id === 'linear' ? 'minus' : 'menu')), h('span', null, mk.n));
      t.onclick = () => set(mk.id); grid.append(t);
    });
    const out = [grid];
    if (c.mask && c.mask.type !== 'none') {
      const mm = c.mask;
      out.push(
        this.pSlider(mm, 'x', { label: 'Posisi X', min: -50, max: 150, scale: 100, def: .5 }),
        this.pSlider(mm, 'y', { label: 'Posisi Y', min: -50, max: 150, scale: 100, def: .5 }),
        mm.type !== 'linear' ? this.pSlider(mm, 'w', { label: 'Lebar', min: 1, max: 200, scale: 100, def: .6 }) : null,
        mm.type !== 'linear' ? this.pSlider(mm, 'h', { label: 'Tinggi', min: 1, max: 200, scale: 100, def: .6 }) : null,
        this.pSlider(mm, 'rot', { label: 'Rotasi', min: -180, max: 180, def: 0 }),
        this.pSlider(mm, 'feather', { label: 'Lembutkan', min: 0, max: 100, scale: 100, def: .1 }),
        mm.type === 'rect' ? this.pSlider(mm, 'round', { label: 'Sudut', min: 0, max: 100, scale: 100, def: 0 }) : null,
        this.toggleRow('Balik masker', mm, 'invert'));
    }
    return this.wrap('Masker', out, flat, { collapsed: !flat && !(c.mask && c.mask.type !== 'none') });
  },
  s_chroma(c, flat) {
    const k = c.chroma || { on: false, color: '#00ff00', sim: .4, smooth: .2, spill: .3 };
    const out = [UI.row('Aktifkan', h('div', { class: 'grow' }), UI.toggle(!!k.on, v => { Hist.save(); c.chroma = Object.assign({}, k, { on: v }); App.changed({ insp: true }); }))];
    if (c.chroma && c.chroma.on) {
      const ch = c.chroma;
      out.push(this.colorRow('Warna kunci', ch, 'color', { swatches: ['#00ff00', '#00b140', '#0047bb', '#0000ff', '#ffffff', '#000000'] }),
        h('div', { class: 'btn-row' }, UI.btn('Ambil warna dari pratinjau', 'chroma', () => Act.pickColor(c, hex => { Hist.save(); ch.color = hex; App.changed({ insp: true }); }))),
        this.pSlider(ch, 'sim', { label: 'Kekuatan', min: 0, max: 100, scale: 100, def: .4 }),
        this.pSlider(ch, 'smooth', { label: 'Kehalusan', min: 0, max: 100, scale: 100, def: .2 }),
        this.pSlider(ch, 'spill', { label: 'Hapus pantulan', min: 0, max: 100, scale: 100, def: .3 }));
    }
    return this.wrap('Kunci warna (layar hijau)', out, flat, { collapsed: !flat && !(c.chroma && c.chroma.on) });
  },
  s_clipfx(c, flat) {
    const list = h('div', { class: 'list' });
    (c.fx || []).forEach((f, i) => {
      const e = EFFECT_BY_ID[f.id];
      const del = h('button', { class: 'icon-btn', type: 'button', title: 'Hapus efek' }, icon('trash'));
      del.onclick = () => { Hist.save(); c.fx.splice(i, 1); App.changed({ insp: true }); };
      list.append(h('div', { class: 'fx-item', style: { flexDirection: 'column', alignItems: 'stretch' } },
        h('div', { class: 'row' }, icon('effects'), h('span', { class: 'fx-n' }, e ? e.n : f.id), del),
        this.pSlider(f, 'int', { label: 'Intensitas', min: 0, max: 100, scale: 100, def: 1, dflt: 1 }),
        this.pSlider(f, 'speed', { label: 'Kecepatan', min: 10, max: 400, scale: 100, def: 1, dflt: 1 })));
    });
    if (!(c.fx || []).length) list.append(h('p', { class: 'hint' }, 'Belum ada efek pada klip ini.'));
    return this.wrap('Efek klip', [list, UI.btn('Tambah efek ke klip', 'plus', () => { Panels.target = 'clip'; App.openPanel('effects'); }, 'block')], flat);
  },
  s_filter(c, flat) {
    const out = [];
    if (c.filter) {
      out.push(UI.row('Filter', h('b', { class: 'grow' }, (FILTER_BY_ID[c.filter.id] || {}).n || '-'), UI.btn('Hapus', 'close', () => { Hist.save(); c.filter = null; App.changed({ insp: true }); })));
      out.push(this.pSlider(c, 'filter.int', { label: 'Intensitas', min: 0, max: 100, scale: 100, def: 1 }));
    } else out.push(h('p', { class: 'hint' }, 'Belum ada filter.'));
    out.push(UI.btn('Pilih filter', 'filter', () => { Panels.target = 'clip'; App.openPanel('filter'); }, 'block'));
    return this.wrap('Filter', out, flat);
  },
  adjustBody(c, objKey = 'adj') {
    c[objKey] = c[objKey] || {};
    const o = c[objKey];
    const rows = ADJUSTS.map(a => this.pSlider(o, a.k, { label: a.n, min: a.min != null ? a.min : -100, max: a.max != null ? a.max : 100, def: 0 }));
    rows.push(UI.btn('Atur ulang semua', 'rotate', () => { Hist.save(); c[objKey] = {}; App.changed({ insp: true }); Panels.refresh(); }, 'block'));
    return h('div', { class: 'sec-b', style: { padding: 0 } }, rows);
  },
  s_adjust(c, flat) { return this.wrap('Penyesuaian warna', [this.adjustBody(c)], flat); },
  s_anim(c, flat) {
    c.anim = c.anim || {};
    const tabs = [{ value: 'in', label: 'Masuk' }, { value: 'out', label: 'Keluar' }, { value: 'loop', label: 'Berulang' }];
    const body = h('div', { class: 'sec-b', style: { padding: 0 } });
    const draw = () => {
      body.innerHTML = '';
      const kind = this.animTab;
      const list = (kind === 'in' ? ANIM_IN : kind === 'out' ? ANIM_OUT : ANIM_LOOP).filter(a => !a.text || c.type === 'text');
      const cur = c.anim[kind];
      const grid = h('div', { class: 'anim-grid' });
      const none = h('div', { class: 'anim-t' + (!cur ? ' on' : '') }, h('div', { class: 'at-box' }, icon('close')), h('span', null, 'Tanpa'));
      none.onclick = () => { Hist.save(); delete c.anim[kind]; App.changed({ tl: true }); draw(); };
      grid.append(none);
      for (const a of list) {
        const t = h('div', { class: 'anim-t' + (cur && cur.id === a.id ? ' on' : ''), style: { '--a': a.css } }, h('div', { class: 'at-box' }, h('div', { class: 'at-dot' })), h('span', null, a.n));
        t.querySelector('.at-dot').style.setProperty('--a', a.css);
        t.onclick = () => {
          Hist.save();
          c.anim[kind] = kind === 'loop' ? { id: a.id, speed: (cur && cur.speed) || 1 } : { id: a.id, dur: (cur && cur.dur) || Math.min(.6, c.dur / 2) };
          App.changed({ tl: true }); draw();
          // pratinjau animasi
          if (kind === 'in') Engine.seek(c.start); else if (kind === 'out') Engine.seek(Math.max(c.start, clipEnd(c) - c.anim.out.dur - .05));
          if (kind !== 'loop') { Engine.endAt = kind === 'in' ? Math.min(clipEnd(c), c.start + c.anim.in.dur + .25) : clipEnd(c) - .01; Engine.onEnd = () => { Engine.endAt = null; }; Engine.play(); }
        };
        grid.append(t);
      }
      body.append(grid);
      if (cur) {
        if (kind === 'loop') body.append(this.pSlider(cur, 'speed', { label: 'Kecepatan', min: 10, max: 400, scale: 100, def: 1 }));
        else body.append(this.pSlider(cur, 'dur', { label: 'Durasi', min: .1, max: Math.max(.2, Math.round(c.dur * 10) / 10), step: .1, def: .6, tl: true }));
      }
    };
    const seg = UI.seg(tabs, this.animTab, v => { this.animTab = v; draw(); });
    draw();
    return this.wrap('Animasi', [seg, body], flat, { noCollapse: true });
  },
  s_speed(c, flat) {
    const m = mediaById(c.mediaId);
    const info = h('p', { class: 'hint' });
    const upd = () => info.textContent = `Durasi: ${fmtSec(c.dur)} · sumber ${fmtSec(c.dur * clipAvgSpeed(c))}${m ? ' dari ' + fmtSec(m.duration) : ''}`;
    upd();
    const mode = UI.seg([{ value: 'normal', label: 'Normal' }, { value: 'curve', label: 'Kurva' }], c.curve ? 'curve' : 'normal', v => {
      Hist.save();
      if (v === 'curve') Pro.setCurve(c, SPEED_CURVES[0].pts, SPEED_CURVES[0].id); else Pro.setCurve(c, null);
      App.changed({ tl: true, insp: true });
    });
    const out = [mode];
    if (!c.curve) {
      out.push(UI.slider({ label: 'Kecepatan', min: .1, max: 10, step: .05, value: c.speed, def: 1, onStart: () => Hist.save(), onInput: v => { Act.setSpeed(c, v); upd(); TL.render(); Engine.requestRender(); }, onChange: () => App.changed({ tl: true }) }));
      const pres = h('div', { class: 'btn-row' });
      [.25, .5, 1, 1.5, 2, 3, 5].forEach(v => pres.append(UI.btn(v + 'x', null, () => { Hist.save(); Act.setSpeed(c, v); App.changed({ tl: true, insp: true }); })));
      out.push(pres);
    } else {
      const grid = h('div', { class: 'anim-grid' });
      for (const sc of SPEED_CURVES) {
        const t = h('div', { class: 'anim-t' + (c.curve.id === sc.id ? ' on' : '') }, h('div', { class: 'at-box', html: Curve.svg(sc.pts) }), h('span', null, sc.n));
        t.onclick = () => { Hist.save(); Pro.setCurve(c, sc.pts.slice(), sc.id); App.changed({ tl: true, insp: true }); Engine.seek(c.start); Engine.endAt = clipEnd(c) - .01; Engine.onEnd = () => { Engine.endAt = null; }; Engine.play(); };
        grid.append(t);
      }
      out.push(grid, h('div', { class: 'hint' }, 'Atur titik kurva (awal → akhir klip):'));
      const labels = ['Awal', '25%', 'Tengah', '75%', 'Akhir'];
      c.curve.pts.forEach((v, i) => out.push(UI.slider({ label: labels[i], min: .1, max: 10, step: .05, value: v, def: 1, onStart: () => Hist.save(), onInput: nv => { const pts = c.curve.pts.slice(); pts[i] = nv; Pro.setCurve(c, pts, 'custom'); upd(); TL.render(); Engine.requestRender(); }, onChange: () => App.changed({ tl: true }) })));
    }
    out.push(this.toggleRow('Jaga nada suara', c, 'keepPitch'), info, h('p', { class: 'hint' }, 'Durasi di timeline ikut berubah. Kurva membuat gerakan cepat-lambat dramatis.'));
    return this.wrap('Kecepatan', out, flat, { noCollapse: true });
  },
  s_ai(c, flat) {
    const k = c.cut || { on: false, mode: 'cut', th: .5, soft: .12, inv: false, blur: .8 };
    const out = [
      h('div', { class: 'hint box' }, h('b', null, 'Hapus latar AI. '), 'Memisahkan orang dari latar secara otomatis, langsung di perangkat. Pertama kali perlu internet untuk mengunduh model AI (±10 MB), setelah itu tersimpan.'),
      UI.row('Aktifkan', h('div', { class: 'grow' }), UI.toggle(!!k.on, v => Pro.setCutout(c, v))),
    ];
    if (k.on) {
      out.push(UI.row('Mode', UI.seg([{ value: 'cut', label: 'Hapus latar' }, { value: 'blur', label: 'Buram latar' }], k.mode || 'cut', v => Pro.setCutout(c, true, v))));
      out.push(this.pSlider(c, 'cut.th', { label: 'Ambang', min: 5, max: 95, scale: 100, def: .5 }), this.pSlider(c, 'cut.soft', { label: 'Tepi lembut', min: 0, max: 40, scale: 100, def: .12 }));
      if (k.mode === 'blur') out.push(this.pSlider(c, 'cut.blur', { label: 'Buram latar', min: 10, max: 100, scale: 100, def: .8 }));
      out.push(this.toggleRow('Balik hasil', c, 'cut.inv'), h('p', { class: 'hint' }, Seg.seg ? 'AI aktif.' : Seg.failed ? 'AI gagal dimuat — periksa koneksi internet lalu aktifkan ulang.' : 'Memuat AI…'));
      out.push(h('p', { class: 'hint' }, 'Tip: taruh latar baru (foto/warna) di trek utama dan video ini di trek hamparan.'));
    }
    const sec1 = this.wrap('Hapus latar (AI)', out, flat);
    if (c.type !== 'video') return sec1;
    const rf = [h('p', { class: 'hint' }, 'Menjaga objek/orang utama tetap di tengah saat rasio diubah (mis. 16:9 → 9:16). Membuat keyframe posisi otomatis.'), UI.btn('Bingkai ulang otomatis', 'fit', () => Pro.autoReframe(c), 'block')];
    return h('div', null, sec1, this.wrap('Bingkai ulang otomatis (AI)', rf, flat));
  },
  s_retouch(c, flat) {
    c.fx = c.fx || [];
    let f = c.fx.find(x => x.id === 'retouch');
    const row = UI.slider({ label: 'Haluskan kulit', min: 0, max: 100, step: 1, value: f ? f.int * 100 : 0, def: 0, onStart: () => Hist.save(), onInput: v => {
      f = c.fx.find(x => x.id === 'retouch');
      if (v <= 0) { c.fx = c.fx.filter(x => x.id !== 'retouch'); }
      else if (!f) c.fx.unshift({ id: 'retouch', int: v / 100, speed: 1 }); else f.int = v / 100;
      Engine.requestRender();
    }, onChange: () => App.changed({}) });
    const br = this.pSlider(c, 'adj.bri', { label: 'Cerahkan', min: 0, max: 60, def: 0 });
    return this.wrap('Retouch wajah', [row, br, h('p', { class: 'hint' }, 'Menghaluskan area berwarna kulit tanpa mengaburkan mata, rambut, dan latar.')], flat, { collapsed: !flat && !f });
  },
  s_protools(c, flat) {
    const b = [];
    if (c.type === 'video') {
      b.push(UI.btn('Video mundur', 'reverse', () => Pro.reverse(c)));
      let str = .6;
      b.push(h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Stabilkan'), UI.seg([{ value: .3, label: 'Ringan' }, { value: .6, label: 'Sedang' }, { value: 1, label: 'Kuat' }], .6, v => str = v)));
      b.push(h('div', { class: 'btn-row' }, UI.btn('Stabilkan video', 'anim', () => Pro.stabilize(c, str), 'accent'), c.stab ? UI.btn('Hapus stabilisasi', 'close', () => Pro.removeStab(c)) : null));
    }
    b.push(UI.btn('Sensor / blur area', 'mask', () => Pro.censor(c)));
    b.push(h('div', { class: 'hint' }, 'Tata letak layar terbagi: pilih 2–4 klip (Shift+klik), lalu pilih tata letak di panel kanan.'));
    return this.wrap('Alat Pro', b, flat);
  },
  s_autocolor(c, flat) {
    const others = P().clips.filter(x => x !== c && (x.type === 'video' || x.type === 'image'));
    let ref = others[0] ? others[0].id : '';
    const out = [UI.btn('Warna otomatis', 'ai', () => Pro.autoColor(c), 'accent block')];
    if (others.length) out.push(UI.row('Samakan ke', UI.select(others.map(x => ({ value: x.id, label: clipName(x) + ' @' + fmtDur(x.start) })), ref, v => ref = v), UI.btn('Samakan', null, () => Pro.matchColor(c, clipById(ref)))));
    return this.wrap('Koreksi warna AI', out, flat);
  },
  s_audiopro(c, flat) {
    const out = [h('div', { class: 'btn-row' },
      UI.btn('Kurangi bising', 'wave', () => Pro.processAudio(c, 'denoise')),
      UI.btn('Hapus vokal', 'mute', () => Pro.processAudio(c, 'novocal')),
      UI.btn('Fokus vokal', 'mic', () => Pro.processAudio(c, 'vocal')))];
    if (c.type === 'audio') out.push(h('div', { class: 'btn-row' }, UI.btn('Kecilkan otomatis saat ada suara', 'volume', () => Pro.autoDuck(c)), UI.btn('Klip ikut ketukan', 'beat', () => Pro.beatSync())));
    out.push(h('p', { class: 'hint' }, 'Hasil olahan disimpan sebagai audio baru; audio asli tetap aman (bisa diurungkan).'));
    return this.wrap('Audio Pro', out, flat);
  },
  s_tts(c, flat) {
    let lang = 'ind';
    return this.wrap('Bacakan teks (AI)', [UI.row('Bahasa', UI.select(TTS.LANGS, lang, v => lang = v)), UI.btn('Buat suara dari teks ini', 'mic', () => TTS.make(c.text, lang, c.start), 'block'),
      h('p', { class: 'hint' }, 'Eksperimental — butuh internet saat pertama dipakai. Jika bahasa tertentu belum tersedia, coba Inggris atau gunakan Rekam suara.')], flat, { collapsed: true });
  },
  s_audio(c, flat) {
    const tr = trackById(c.trackId);
    const out = [
      this.kfSlider(c, 'volume', { label: 'Volume', min: 0, max: 200, step: 1, to: v => Math.round(v * 100), from: v => v / 100, def: 1 }),
      this.pSlider(c, 'fadeIn', { label: 'Pudar masuk', min: 0, max: Math.min(10, c.dur), step: .1, def: 0, tl: true }),
      this.pSlider(c, 'fadeOut', { label: 'Pudar keluar', min: 0, max: Math.min(10, c.dur), step: .1, def: 0, tl: true }),
      this.toggleRow('Bisukan klip', c, 'muted'),
    ];
    const tools = h('div', { class: 'btn-row' });
    if (c.type === 'video') tools.append(UI.btn('Pisahkan audio', 'wave', () => Act.extractAudio(c)));
    if (c.type === 'audio') tools.append(UI.btn('Deteksi ketukan', 'beat', () => Act.detectBeats(c)));
    tools.append(UI.btn('Normalisasi', 'volume', () => Act.normalize(c)));
    out.push(tools);
    if (tr && tr.muted) out.push(h('p', { class: 'hint box' }, 'Trek ini sedang dibisukan.'));
    return this.wrap('Audio', out, flat);
  },
  s_voice(c, flat) {
    const grid = h('div', { class: 'anim-grid' });
    VOICES.forEach(v => {
      const t = h('div', { class: 'anim-t' + ((c.voice || 'none') === v.id ? ' on' : '') }, h('div', { class: 'at-box' }, icon(v.id === 'none' ? 'close' : 'sfx')), h('span', null, v.n));
      t.onclick = () => { Hist.save(); c.voice = v.id; App.changed({ insp: true }); if (!Engine.playing) { Engine.seek(Math.max(c.start, Math.min(S.time, clipEnd(c) - .1))); Engine.play(); } };
      grid.append(t);
    });
    return this.wrap('Pengubah suara', [grid], flat);
  },
  s_text(c, flat) {
    const ta = h('textarea', { class: 'txt', rows: 3, spellcheck: 'false' });
    ta.value = c.text;
    let started = false;
    ta.addEventListener('input', () => { if (!started) { Hist.save(); started = true; } c.text = ta.value; Engine.requestRender(); TL.render(); });
    ta.addEventListener('change', () => { started = false; App.changed({ tl: true }); });
    ta.addEventListener('keydown', e => e.stopPropagation());
    this.textArea = ta;
    const st = c.style;
    const fonts = Fonts.list();
    const groups = {}; fonts.forEach(f => (groups[f.c] = groups[f.c] || []).push({ value: f.n, label: f.n }));
    const fontSel = UI.select(Object.keys(groups).map(g => ({ group: g, items: groups[g] })), st.font, v => { Hist.save(); st.font = v; Fonts.ensure(v); App.changed({}); });
    $$('option', fontSel).forEach(o => o.style.fontFamily = `"${o.value}"`);
    const fmt = h('div', { class: 'seg', style: { flex: 'none' } });
    [['bold', 'B'], ['italic', 'I'], ['underline', 'U']].forEach(([k, l]) => {
      const b = h('button', { type: 'button', class: st[k] ? 'on' : '', style: { width: '32px', fontWeight: k === 'bold' ? '800' : '600', fontStyle: k === 'italic' ? 'italic' : 'normal', textDecoration: k === 'underline' ? 'underline' : 'none' } }, l);
      b.onclick = () => { Hist.save(); st[k] = !st[k]; b.classList.toggle('on', st[k]); App.changed({}); };
      fmt.append(b);
    });
    const align = UI.seg([{ value: 'left', label: 'Kiri' }, { value: 'center', label: 'Tengah' }, { value: 'right', label: 'Kanan' }], st.align || 'center', v => { Hist.save(); st.align = v; App.changed({}); });
    const out = [ta, UI.row('Font', fontSel), UI.row('Format', fmt, align),
      this.pSlider(st, 'size', { label: 'Ukuran', min: 8, max: 400, def: 80 }),
      this.colorRow('Warna', st, 'color'),
      this.pSlider(st, 'ls', { label: 'Spasi huruf', min: -10, max: 60, def: 0 }),
      this.pSlider(st, 'lh', { label: 'Spasi baris', min: .6, max: 3, step: .05, def: 1.2 }),
      this.toggleRow('Subtitle', c, 'cap'),
    ];
    return this.wrap('Teks', out, flat, { noCollapse: true });
  },
  s_textstyle(c, flat) {
    const st = c.style;
    const sub = (title, key, rows) => {
      const on = st[key].on;
      const t = UI.toggle(on, v => { Hist.save(); st[key].on = v; App.changed({ insp: true }); });
      return UI.section(title, on ? rows() : [h('p', { class: 'hint' }, 'Nonaktif')], { extra: t, collapsed: !on });
    };
    const wrap = h('div');
    wrap.append(
      sub('Garis tepi', 'stroke', () => [this.colorRow('Warna', st.stroke, 'color'), this.pSlider(st.stroke, 'w', { label: 'Tebal', min: 1, max: 40, def: 8 })]),
      sub('Bayangan', 'shadow', () => [this.colorRow('Warna', st.shadow, 'color'), this.pSlider(st.shadow, 'a', { label: 'Opasitas', min: 0, max: 100, scale: 100, def: .65 }), this.pSlider(st.shadow, 'blur', { label: 'Buram', min: 0, max: 60, def: 14 }), this.pSlider(st.shadow, 'x', { label: 'Geser X', min: -40, max: 40, def: 0 }), this.pSlider(st.shadow, 'y', { label: 'Geser Y', min: -40, max: 40, def: 5 })]),
      sub('Latar teks', 'bg', () => [this.colorRow('Warna', st.bg, 'color'), this.pSlider(st.bg, 'a', { label: 'Opasitas', min: 0, max: 100, scale: 100, def: .6 }), this.pSlider(st.bg, 'r', { label: 'Sudut', min: 0, max: 80, def: 14 }), this.pSlider(st.bg, 'p', { label: 'Jarak', min: 0, max: 80, def: 18 })]),
      sub('Gradasi', 'grad', () => [this.colorRow('Warna 1', st.grad, 'c1'), this.colorRow('Warna 2', st.grad, 'c2')]),
      sub('Cahaya (glow)', 'glow', () => [this.colorRow('Warna', st.glow, 'color'), this.pSlider(st.glow, 'blur', { label: 'Kekuatan', min: 2, max: 80, def: 26 })]),
      UI.section('Warna sorot (karaoke)', [this.colorRow('Warna', st, 'hlColor'), h('p', { class: 'hint' }, 'Dipakai animasi berulang "Karaoke".')], { collapsed: true }),
    );
    if (flat) return wrap;
    return wrap;
  },
  s_sticker(c, flat) {
    const out = [];
    if (c.sk.type === 'shape') {
      out.push(this.colorRow('Warna', c.sk, 'color', { tl: true }),
        this.pSlider(c.sk, 'aw', { label: 'Lebar', min: 10, max: 600, scale: 100, def: 1 }),
        this.pSlider(c.sk, 'ah', { label: 'Tinggi', min: 10, max: 600, scale: 100, def: 1 }),
        this.pSlider(c.sk, 'stroke', { label: 'Garis tepi', min: 0, max: 20, def: 0 }));
      if (c.sk.stroke) out.push(this.colorRow('Warna tepi', c.sk, 'strokeColor'));
    } else out.push(h('p', { class: 'hint' }, 'Ubah ukuran & posisi dengan menyeret di pratinjau, atau atur di bawah.'));
    return this.wrap('Stiker', out, flat);
  },
  s_effectclip(c, flat) {
    const opts = EFFECT_CATS.map(cat => ({ group: cat, items: EFFECTS.filter(e => e.c === cat).map(e => ({ value: e.id, label: e.n })) }));
    return this.wrap('Efek', [
      UI.row('Efek', UI.select(opts, c.fxId, v => { Hist.save(); c.fxId = v; App.changed({ tl: true, insp: true }); })),
      this.pSlider(c, 'int', { label: 'Intensitas', min: 0, max: 100, scale: 100, def: 1 }),
      this.pSlider(c, 'speed', { label: 'Kecepatan', min: 10, max: 400, scale: 100, def: 1 }),
      h('p', { class: 'hint' }, 'Efek di timeline berlaku untuk semua klip di trek bawahnya selama durasi klip efek.')], flat, { noCollapse: true });
  },
  s_filterclip(c, flat) {
    const opts = FILTER_CATS.map(cat => ({ group: cat, items: FILTERS.filter(f => f.c === cat).map(f => ({ value: f.id, label: f.n })) }));
    return this.wrap('Filter', [
      UI.row('Filter', UI.select(opts, c.filterId, v => { Hist.save(); c.filterId = v; App.changed({ tl: true }); })),
      this.pSlider(c, 'int', { label: 'Intensitas', min: 0, max: 100, scale: 100, def: 1 })], flat, { noCollapse: true });
  },
  s_adjustclip(c, flat) { return this.wrap('Penyesuaian', [this.adjustBody(c)], flat, { noCollapse: true }); },
  s_transition(c, flat) {
    if (!c) return null;
    const out = [];
    const cur = c.trans;
    const opts = TRANS_CATS.map(cat => ({ group: cat, items: TRANSITIONS.filter(t => t.c === cat).map(t => ({ value: t.id, label: t.n })) }));
    out.push(UI.row('Jenis', UI.select([{ value: '', label: '— Tanpa —' }, ...opts], cur ? cur.id : '', v => { if (v) Act.applyTransition(c.id, v, cur ? cur.dur : Panels.transDur); else { Hist.save(); c.trans = null; App.changed({ tl: true, insp: true }); } })));
    if (cur) out.push(this.pSlider(cur, 'dur', { label: 'Durasi', min: .1, max: 3, step: .1, def: .6, tl: true }));
    out.push(h('div', { class: 'btn-row' }, UI.btn('Pratinjau', 'play', () => { const d = cur ? cur.dur : .6; Engine.seek(Math.max(0, c.start - d / 2 - .4)); Engine.endAt = c.start + d / 2 + .4; Engine.onEnd = () => { Engine.endAt = null; }; Engine.play(); }), UI.btn('Semua potongan', 'layers', () => Act.transitionAll(cur ? cur.id : 'fade', cur ? cur.dur : .6))));
    out.push(h('p', { class: 'hint' }, 'Pilih transisi lain dari panel Transisi di kiri.'));
    return this.wrap('Transisi', out, flat, { noCollapse: true });
  },
  s_project(c, flat) {
    const p = P();
    const name = h('input', { class: 'inp', value: p.name });
    name.addEventListener('change', () => { p.name = name.value || p.name; $('#proj-name').value = p.name; Store.saveSoon(); });
    name.addEventListener('keydown', e => e.stopPropagation());
    const out = [UI.row('Nama', name), this.s_ratio(null, true),
      UI.row('Resolusi', UI.select(RESOLUTIONS.map(r => ({ value: r.v, label: r.n })), String(p.res), v => { Hist.save(); p.res = +v; applySize(p); App.changed({ ratio: true, insp: true }); })),
      UI.row('FPS', UI.select(FPS_LIST.map(f => ({ value: f, label: f + ' fps' })), String(p.fps), v => { Hist.save(); p.fps = +v; App.changed({ tl: true, insp: true }); })),
    ];
    const sec2 = this.s_canvas(null, true);
    const info = h('div', { class: 'sec-b', style: { padding: 0 } },
      h('div', { class: 'stat' }, 'Ukuran', h('b', null, p.width + '×' + p.height)),
      h('div', { class: 'stat' }, 'Durasi', h('b', null, fmtTC(projDuration(), p.fps))),
      h('div', { class: 'stat' }, 'Klip', h('b', null, p.clips.length)),
      h('div', { class: 'stat' }, 'Media', h('b', null, p.media.length)));
    return h('div', null, UI.section('Proyek', out), UI.section('Latar kanvas', [sec2]), UI.section('Info', [info]));
  },
  s_ratio(c, flat) {
    const p = P();
    const grid = h('div', { class: 'anim-grid' });
    for (const r of RATIOS) {
      let a = 16, b = 9;
      if (r.id !== 'original') [a, b] = r.id.split(':').map(Number);
      const s = 34 / Math.max(a, b);
      const box = h('div', { style: { width: Math.max(8, a * s) + 'px', height: Math.max(8, b * s) + 'px', border: '2px solid currentColor', borderRadius: '4px' } });
      const t = h('div', { class: 'anim-t' + (p.ratio === r.id ? ' on' : '') }, h('div', { class: 'at-box' }, r.id === 'original' ? icon('image') : box), h('span', null, r.name.split(' ')[0]));
      t.title = r.name;
      t.onclick = () => { Act.setRatio(r.id); };
      grid.append(t);
    }
    return this.wrap('Rasio', [grid], flat);
  },
  s_canvas(c, flat) {
    const p = P(); const bg = p.bg;
    const out = [UI.seg([{ value: 'color', label: 'Warna' }, { value: 'blur', label: 'Buram' }, { value: 'image', label: 'Gambar' }], bg.type, v => { Hist.save(); bg.type = v; App.changed({ insp: true }); })];
    if (bg.type === 'color') out.push(this.colorRow('Warna', bg, 'color'));
    if (bg.type === 'blur') out.push(this.pSlider(bg, 'blur', { label: 'Keburaman', min: 0, max: 100, scale: 100, def: .6 }), h('p', { class: 'hint' }, 'Latar memakai versi buram dari klip trek utama — cocok untuk video vertikal di kanvas lebar.'));
    if (bg.type === 'image') {
      const imgs = p.media.filter(m => m.type === 'image');
      out.push(UI.row('Gambar', UI.select([{ value: '', label: imgs.length ? '— pilih —' : 'Belum ada gambar' }, ...imgs.map(m => ({ value: m.id, label: m.name }))], bg.mediaId || '', v => { Hist.save(); bg.mediaId = v || null; App.changed({}); })),
        UI.btn('Impor gambar latar', 'upload', async () => { const f = await pickFiles('image/*', false); const ms = await Media.importFiles(f, { toast: false }); if (ms[0]) { Hist.save(); bg.mediaId = ms[0].id; App.changed({ insp: true }); } }, 'block'));
    }
    out.push(UI.btn('Terapkan ke semua klip utama: Penuhi', 'fit', () => { Hist.save(); const mt = mainTrack(); clipsOn(mt.id).forEach(x => x.fit = 'fill'); App.changed({}); }, 'block'));
    return this.wrap('Latar kanvas', out, flat);
  },
  multi(ids) {
    const cs = ids.map(clipById).filter(Boolean);
    const vis = cs.filter(c => c.type === 'video' || c.type === 'image');
    const lay = vis.length >= 2 ? h('div', { class: 'sec-b', style: { padding: 0 } }, h('b', null, 'Tata letak layar terbagi'), h('div', { class: 'btn-row' },
      UI.btn('2 kiri-kanan', 'grid', () => Pro.layout('2h')), UI.btn('2 atas-bawah', 'grid', () => Pro.layout('2v')), UI.btn('Gambar dalam gambar', 'overlay', () => Pro.layout('pip')),
      vis.length >= 3 ? UI.btn('3 kolom', 'grid', () => Pro.layout('3h')) : null, vis.length >= 3 ? UI.btn('3 baris', 'grid', () => Pro.layout('3v')) : null, vis.length >= 4 ? UI.btn('Grid 4', 'grid', () => Pro.layout('4')) : null)) : null;
    return h('div', { class: 'sec-b', style: { padding: '14px' } }, lay,
      h('p', { class: 'hint' }, 'Seret salah satu untuk memindahkan semuanya. Shift/Ctrl+klik untuk menambah/mengurangi pilihan.'),
      h('div', { class: 'btn-row' }, UI.btn('Hapus semua', 'trash', () => Act.del(), 'danger'), UI.btn('Duplikat', 'duplicate', () => Act.duplicate())),
      cs.some(c => c.type === 'video' || c.type === 'audio') ? h('div', { class: 'btn-row' }, UI.btn('Bisukan', 'mute', () => { Hist.save(); cs.forEach(c => { if ('muted' in c) c.muted = true; }); App.changed({ tl: true }); }), UI.btn('Bunyikan', 'volume', () => { Hist.save(); cs.forEach(c => { if ('muted' in c) c.muted = false; }); App.changed({ tl: true }); })) : null,
      cs.some(c => c.type === 'video' || c.type === 'image') ? UI.btn('Samakan filter dari klip pertama', 'filter', () => { const f = cs.find(c => c.filter); if (!f) return toast('Klip pertama belum punya filter'); Hist.save(); cs.forEach(c => { if (c.type === 'video' || c.type === 'image') { c.filter = deepClone(f.filter); c.adj = deepClone(f.adj || {}); } }); App.changed({}); }, 'block') : null);
  },
};
