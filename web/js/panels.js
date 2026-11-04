'use strict';
/* =========================================================
   KLM Cut — panel aset: media, audio, teks, stiker, efek, transisi,
   filter, penyesuaian, teks otomatis
   ========================================================= */
const PANELS = [
  { id: 'media', n: 'Media', ic: 'media' },
  { id: 'templates', n: 'Templat', ic: 'grid' },
  { id: 'audio', n: 'Audio', ic: 'music' },
  { id: 'text', n: 'Teks', ic: 'text' },
  { id: 'sticker', n: 'Stiker', ic: 'sticker' },
  { id: 'effects', n: 'Efek', ic: 'effects' },
  { id: 'transition', n: 'Transisi', ic: 'transition' },
  { id: 'filter', n: 'Filter', ic: 'filter' },
  { id: 'adjust', n: 'Sesuaikan', ic: 'adjust' },
  { id: 'captions', n: 'Subtitle', ic: 'cc' },
];

let _sampleImg = null;
function sampleImage() {
  if (_sampleImg) return _sampleImg;
  const c = document.createElement('canvas'); c.width = 160; c.height = 100;
  const g = c.getContext('2d');
  let gr = g.createLinearGradient(0, 0, 0, 100); gr.addColorStop(0, '#4a90d9'); gr.addColorStop(.55, '#f6c27a'); gr.addColorStop(1, '#e98a5b');
  g.fillStyle = gr; g.fillRect(0, 0, 160, 100);
  g.fillStyle = '#fff3c4'; g.beginPath(); g.arc(112, 46, 14, 0, 7); g.fill();
  g.fillStyle = '#3c6e4a'; g.beginPath(); g.moveTo(0, 70); g.quadraticCurveTo(40, 40, 80, 64); g.quadraticCurveTo(120, 84, 160, 58); g.lineTo(160, 100); g.lineTo(0, 100); g.fill();
  g.fillStyle = '#2a4f63'; g.fillRect(0, 84, 160, 16);
  g.fillStyle = '#d9584a'; g.beginPath(); g.arc(34, 66, 7, 0, 7); g.fill();
  _sampleImg = c.toDataURL('image/jpeg', .85);
  return _sampleImg;
}

const Panels = {
  cur: 'media', cats: {}, target: null, transDur: .6, audioPrev: null, synthCache: {},
  init() {
    const tabs = $('#asset-tabs'); tabs.innerHTML = '';
    for (const p of PANELS) {
      const b = h('button', { class: 'atab' + (p.id === this.cur ? ' on' : ''), type: 'button', dataset: { id: p.id } }, icon(p.ic), h('span', null, p.n));
      b.onclick = () => this.show(p.id);
      tabs.append(b);
    }
    this.show(this.cur);
  },
  show(id) {
    this.cur = id;
    $$('.atab', $('#asset-tabs')).forEach(b => b.classList.toggle('on', b.dataset.id === id));
    this.render(id, $('#asset-body'));
  },
  refresh() { if (!document.body.classList.contains('is-m')) this.render(this.cur, $('#asset-body')); else if (App.sheetPanel) App.reopenSheet(); },
  render(id, root, opts = {}) {
    root.innerHTML = '';
    const fn = this['p_' + id]; if (fn) fn.call(this, root, opts);
  },
  selVisual() { const c = S.sel.size === 1 ? clipById([...S.sel][0]) : null; return c && (c.type === 'video' || c.type === 'image') ? c : null; },
  targetToggle(root, label) {
    const c = this.selVisual();
    if (!c) { this.target = 'track'; root.append(h('p', { class: 'hint box' }, 'Diterapkan sebagai lapisan di timeline (mengenai semua klip di bawahnya). Pilih klip dulu untuk menerapkan khusus ke klip itu.')); return 'track'; }
    if (this.target == null) this.target = 'clip';
    root.append(UI.row('Terapkan ke', UI.seg([{ value: 'clip', label: 'Klip terpilih' }, { value: 'track', label: 'Lapisan timeline' }], this.target, v => { this.target = v; })));
    void label;
    return this.target;
  },
  title(root, t, extra) { root.append(h('div', { class: 'ptitle' }, h('h3', null, t), extra || null)); },
  dragData(el, data) {
    el.draggable = true;
    el.addEventListener('dragstart', e => { e.dataTransfer.setData('application/x-klm', JSON.stringify(data)); e.dataTransfer.effectAllowed = 'copy'; });
  },

  /* ---------------- MEDIA ---------------- */
  p_media(root, opts) {
    const overlay = opts.mode === 'overlay';
    const dz = h('div', { class: 'dropzone' }, h('div', { class: 'dz-ico' }, icon('plus')), h('b', null, 'Impor media'), h('span', { class: 'hint' }, 'Video, foto, audio, font (.ttf), subtitle (.srt). Bisa seret & lepas.'));
    dz.onclick = async () => {
      const files = await pickFiles('video/*,image/*,audio/*,.mp4,.mov,.webm,.mkv,.mp3,.wav,.m4a,.ttf,.otf,.woff,.woff2,.srt,.vtt');
      if (!files.length) return;
      const ms = await Media.importFiles(files);
      if (opts.mobile && ms.length) {
        for (const m of ms) { const c = App.addMediaClip(m.id, overlay ? { overlay: true } : { atPlayhead: true }); if (c && !overlay && m.type !== 'audio') Engine.seek(clipEnd(c)); }
        App.closeSheet();
      }
    };
    root.append(dz);
    const cats = ['Proyek', 'Latar'];
    const cat = this.cats.media || 'Proyek';
    root.append(UI.cats(cats, cat, c => { this.cats.media = c; this.render('media', root, opts); }));
    if (cat === 'Latar') return this.bgLibrary(root, opts);
    const list = P().media.filter(m => !m.hidden);
    if (!list.length) { root.append(h('p', { class: 'hint', style: { textAlign: 'center', padding: '20px 0' } }, 'Belum ada media. Impor dari perangkat Anda.')); return; }
    const grid = h('div', { class: 'tiles' });
    const used = new Set(P().clips.map(c => c.mediaId));
    for (const m of list) {
      const rt = Media.get(m.id) || {};
      const th = h('div', { class: 'th' });
      if (rt.thumbs) { th.style.backgroundImage = `url(${rt.thumbs.url})`; th.style.backgroundSize = `${rt.thumbs.n * 100}% 100%`; th.style.backgroundPosition = '0 0'; }
      else if (m.type === 'audio') th.append(h('span', { class: 'ico-big' }, icon('music')));
      else if (rt.missing) th.append(h('span', { class: 'ico-big' }, icon('close')));
      th.append(h('span', { class: 'tic' }, icon(m.type === 'video' ? 'media' : m.type === 'image' ? 'image' : 'music')));
      if (m.type !== 'image') th.append(h('span', { class: 'badge' }, fmtDur(m.duration)));
      if (used.has(m.id)) th.append(h('span', { class: 'used', title: 'Dipakai di timeline' }));
      const add = h('button', { class: 'add', type: 'button', title: 'Tambah ke timeline' }, icon('plus'));
      add.onclick = e => { e.stopPropagation(); App.addMediaClip(m.id, overlay ? { overlay: true } : (opts.mobile ? { atPlayhead: true } : {})); if (opts.mobile) App.closeSheet(); };
      const tile = h('div', { class: 'tile', title: m.name }, th, add, h('div', { class: 'nm' }, m.name));
      tile.onclick = () => add.click();
      tile.addEventListener('contextmenu', e => {
        e.preventDefault();
        ctxMenu(e.clientX, e.clientY, [
          { label: 'Tambah ke trek utama', icon: 'plus', action: () => App.addMediaClip(m.id, {}) },
          m.type !== 'audio' ? { label: 'Tambah sebagai hamparan', icon: 'overlay', action: () => App.addMediaClip(m.id, { overlay: true }) } : null,
          m.type === 'image' ? { label: 'Jadikan latar kanvas', icon: 'bg', action: () => { Hist.save(); P().bg = Object.assign(P().bg, { type: 'image', mediaId: m.id }); App.changed({ insp: true }); } } : null,
          { label: 'Ganti nama', icon: 'edit', action: async () => { const n = await promptDlg('Ganti nama media', m.name); if (n) { m.name = n; App.changed({ tl: true }); this.refresh(); } } },
          { sep: true },
          { label: 'Hapus dari proyek', icon: 'trash', danger: true, action: () => Media.removeFromProject(m.id) },
        ]);
      });
      this.dragData(tile, { kind: 'media', id: m.id });
      grid.append(tile);
    }
    root.append(grid);
  },
  bgLibrary(root, opts) {
    root.append(h('p', { class: 'hint' }, 'Klip warna & gradasi siap pakai — cocok untuk latar judul atau jeda.'));
    const grid = h('div', { class: 'tiles' });
    for (const b of BG_COLORS) {
      const bg = b.c.length > 1 ? `linear-gradient(135deg,${b.c[0]},${b.c[1]})` : b.c[0];
      const tile = h('div', { class: 'tile' }, h('div', { class: 'th', style: { background: bg } }), h('button', { class: 'add', type: 'button' }, icon('plus')), h('div', { class: 'nm' }, b.n));
      tile.onclick = async () => {
        const c = document.createElement('canvas'); const p = P(); c.width = Math.min(1920, p.width); c.height = Math.round(c.width * p.height / p.width);
        const g = c.getContext('2d');
        if (b.c.length > 1) { const gr = g.createLinearGradient(0, 0, c.width, c.height); gr.addColorStop(0, b.c[0]); gr.addColorStop(1, b.c[1]); g.fillStyle = gr; } else g.fillStyle = b.c[0];
        g.fillRect(0, 0, c.width, c.height);
        const blob = await canvasToBlob(c, 'image/png');
        const m = await Media.addBlob(blob, 'Latar ' + b.n + '.png', 'image');
        App.onMediaChanged();
        App.addMediaClip(m.id, opts.mode === 'overlay' ? { overlay: true } : (opts.mobile ? { atPlayhead: true } : {}));
        if (opts.mobile) App.closeSheet();
      };
      grid.append(tile);
    }
    root.append(grid);
  },

  /* ---------------- TEMPLAT ---------------- */
  p_templates(root, opts) {
    root.append(h('p', { class: 'hint box' }, 'Pilih templat lalu pilih foto/video Anda — proyek baru dibuat otomatis lengkap dengan transisi, teks, efek, dan filter. Semuanya tetap bisa diedit.'));
    root.append(h('div', { style: { height: '12px' } }));
    Templates.gallery(root, () => { if (opts.mobile) App.closeSheet(); });
  },

  /* ---------------- AUDIO ---------------- */
  p_audio(root, opts) {
    const cats = ['Musik saya', 'Musik bawaan', 'Efek suara', 'Rekam suara', 'Teks ke suara'];
    const cat = this.cats.audio || 'Musik saya';
    root.append(UI.cats(cats, cat, c => { this.cats.audio = c; this.render('audio', root, opts); }));
    const list = h('div', { class: 'list' });
    if (cat === 'Musik saya') {
      root.append(h('div', { class: 'btn-row', style: { marginBottom: '12px' } },
        UI.btn('Impor audio', 'upload', async () => { const f = await pickFiles('audio/*,.mp3,.wav,.m4a,.ogg,.flac,.aac'); const ms = await Media.importFiles(f); for (const m of ms) App.addAudioClip(m.id); if (opts.mobile && ms.length) App.closeSheet(); }, 'accent'),
        UI.btn('Ambil dari video', 'wave', async () => {
          const f = await pickFiles('video/*,.mp4,.mov,.webm,.mkv', false); if (!f.length) return;
          try { const m = await Media.addBlob(f[0], f[0].name.replace(/\.\w+$/, '') + ' (audio)', 'audio'); App.onMediaChanged(); App.addAudioClip(m.id); toast('Audio diambil dari video'); if (opts.mobile) App.closeSheet(); }
          catch (e) { toast('Gagal mengambil audio: ' + e.message, 'err'); }
        })));
      const ams = P().media.filter(m => m.type === 'audio');
      if (!ams.length) list.append(h('p', { class: 'hint' }, 'Belum ada audio. Impor musik dari perangkat, ambil audio dari video, atau pakai musik bawaan.'));
      for (const m of ams) list.append(this.audioItem(m.name, fmtDur(m.duration), () => Media.url(m.id), () => { App.addAudioClip(m.id); if (opts.mobile) App.closeSheet(); }, { kind: 'media', id: m.id }));
    } else if (cat === 'Musik bawaan') {
      root.append(h('p', { class: 'hint', style: { marginBottom: '10px' } }, 'Musik latar yang dibuat otomatis oleh aplikasi — bebas dipakai.'));
      for (const m of MUSIC) list.append(this.audioItem(m.n, fmtDur(m.d) + ' · ' + m.bpm + ' BPM', () => this.synthUrl('m:' + m.id, m.d, (c, o) => buildMusic(c, o, m)), async () => { await this.addSynth('m:' + m.id, m.n, m.d, (c, o) => buildMusic(c, o, m)); if (opts.mobile) App.closeSheet(); }));
    } else if (cat === 'Efek suara') {
      for (const s of SFX) list.append(this.audioItem(s.n, fmtSec(s.d), () => this.synthUrl('s:' + s.id, s.d, s.f), async () => { await this.addSynth('s:' + s.id, s.n, s.d, s.f); if (opts.mobile) App.closeSheet(); }, null, 'sfx'));
    } else if (cat === 'Teks ke suara') {
      const st = this.ttsOpts || (this.ttsOpts = { text: '', lang: 'ind', rate: 1 });
      const ta = h('textarea', { class: 'txt', rows: 4, placeholder: 'Tulis kalimat yang ingin dibacakan…' }); ta.value = st.text;
      ta.addEventListener('input', () => st.text = ta.value); ta.addEventListener('keydown', e => e.stopPropagation());
      root.append(h('div', { class: 'hint box', style: { marginBottom: '10px' } }, h('b', null, 'Teks ke suara (AI, eksperimental). '), 'Suara dibuat di perangkat; pertama kali butuh internet untuk mengunduh model.'),
        ta, h('div', { style: { height: '8px' } }),
        UI.row('Bahasa', UI.select(TTS.LANGS, st.lang, v => st.lang = v)), h('div', { style: { height: '8px' } }),
        UI.row('Kecepatan', UI.seg([{ value: .85, label: 'Pelan' }, { value: 1, label: 'Normal' }, { value: 1.2, label: 'Cepat' }], st.rate, v => st.rate = v)), h('div', { style: { height: '10px' } }),
        UI.btn('Buat suara', 'mic', async () => { await TTS.make(st.text, st.lang, S.time, st.rate); if (opts.mobile) App.closeSheet(); }, 'accent block'));
    } else {
      root.append(h('div', { class: 'hint box' }, 'Rekam suara narasi langsung dari mikrofon. Hasilnya ditaruh di trek audio mulai dari posisi playhead.'));
      root.append(h('div', { style: { height: '10px' } }), UI.btn('Mulai rekam suara', 'mic', () => Recorder.open(), 'accent block'));
    }
    root.append(list);
  },
  audioItem(name, sub, getUrl, onAdd, drag, ic = 'music') {
    const play = h('button', { class: 'icon-btn', type: 'button', title: 'Dengarkan' }, icon('play'));
    const add = h('button', { class: 'icon-btn', type: 'button', title: 'Tambah' }, icon('plus'));
    const it = h('div', { class: 'litem' }, h('div', { class: 'li-ico' }, icon(ic)), h('div', { class: 'li-main' }, h('div', { class: 'li-t' }, name), h('div', { class: 'li-s' }, sub)), h('div', { class: 'li-act' }, play, add));
    play.onclick = async e => {
      e.stopPropagation();
      const a = this.audioPrev || (this.audioPrev = new Audio());
      if (this._prevEl === it && !a.paused) { a.pause(); return; }
      $$('.litem.playing').forEach(x => { x.classList.remove('playing'); const b = x.querySelector('.li-act .icon-btn'); if (b) setIcon(b, 'play'); });
      const url = await getUrl(); if (!url) return;
      a.src = url; a.currentTime = 0; a.play().catch(() => { });
      this._prevEl = it; it.classList.add('playing'); setIcon(play, 'pause');
      a.onended = a.onpause = () => { it.classList.remove('playing'); setIcon(play, 'play'); };
    };
    add.onclick = e => { e.stopPropagation(); if (this.audioPrev) this.audioPrev.pause(); onAdd(); };
    it.onclick = () => add.click();
    if (drag) this.dragData(it, drag);
    return it;
  },
  async synthUrl(key, d, fn) {
    if (!this.synthCache[key]) this.synthCache[key] = await synthAudio(d, fn);
    return URL.createObjectURL(this.synthCache[key]);
  },
  async addSynth(key, name, d, fn) {
    if (!this.synthCache[key]) this.synthCache[key] = await synthAudio(d, fn);
    const ex = P().media.find(m => m.synth === key);
    const m = ex || await Media.addBlob(this.synthCache[key], name + '.wav', 'audio');
    m.synth = key;
    App.onMediaChanged();
    App.addAudioClip(m.id);
  },

  /* ---------------- TEKS ---------------- */
  p_text(root, opts) {
    const sel = S.sel.size === 1 ? clipById([...S.sel][0]) : null;
    const selText = sel && sel.type === 'text' ? sel : null;
    root.append(h('button', { class: 'btn accent block', type: 'button', style: { height: '40px', marginBottom: '14px' }, onclick: () => { App.addTextClip(); if (opts.mobile) App.closeSheet(); } }, icon('plus'), 'Tambah teks'));
    this.title(root, 'Gaya teks', selText ? h('span', { class: 'tag ac' }, 'klik = terapkan ke teks terpilih') : null);
    const grid = h('div', { class: 'tiles' });
    TEXT_STYLES.forEach((ts, i) => {
      const cv = h('canvas', { width: 220, height: 90 });
      const tile = h('div', { class: 'tile' }, h('div', { class: 'th txtstyle' }, cv), h('div', { class: 'nm' }, ts.n));
      this.drawStylePreview(cv, makeTextStyle(ts.s), 'p' + i);
      tile.onclick = () => {
        if (selText) { Hist.save(); const keep = { size: selText.style.size, align: selText.style.align }; selText.style = makeTextStyle(Object.assign({}, ts.s)); if (!ts.s.size) selText.style.size = keep.size; selText.style.align = keep.align; App.changed({ tl: true, insp: true }); }
        else { App.addTextClip(ts.s); if (opts.mobile) App.closeSheet(); }
      };
      grid.append(tile);
    });
    root.append(grid);
    this.title(root, 'Teks cepat');
    const quick = [
      { n: 'Judul', t: 'JUDUL VIDEO', s: { size: 120, font: 'Anton', bold: false, shadow: { on: true, color: '#000000', blur: 20, x: 0, y: 6, a: .6 } } },
      { n: 'Subjudul', t: 'Subjudul di sini', s: { size: 60, font: 'Montserrat' }, y: .12 },
      { n: 'Teks bawah', t: 'Nama Narasumber\nJabatan', s: { size: 46, align: 'left', bg: { on: true, color: '#111111', a: .8, r: 6, p: 18 } }, x: -.22, y: .33 },
      { n: 'Kutipan', t: '"Kata-kata bijak\ndi sini"', s: { size: 64, font: 'Playfair Display', italic: true } },
      { n: 'Basmalah', t: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ', s: { size: 96, font: 'Amiri', color: '#f9d77e', bold: false } },
      { n: 'Terima kasih', t: 'Terima kasih\ntelah menonton', s: { size: 72, font: 'Pacifico', bold: false } },
      { n: 'Hitung mundur', t: '3', s: { size: 260, font: 'Anton', bold: false }, anim: { in: { id: 'bounce', dur: .4 }, out: { id: 'fade', dur: .3 } }, dur: 1 },
      { n: 'Ikuti kami', t: '@akunanda', s: { size: 56, color: '#17130a', bg: { on: true, color: '#ffc93c', a: 1, r: 40, p: 20 } }, y: .36 },
    ];
    const ql = h('div', { class: 'list' });
    for (const q of quick) ql.append(h('div', { class: 'litem', onclick: () => { App.addTextClip(q.s, q.t, { x: q.x, y: q.y, anim: q.anim, dur: q.dur }); if (opts.mobile) App.closeSheet(); } }, h('div', { class: 'li-ico' }, icon('text')), h('div', { class: 'li-main' }, h('div', { class: 'li-t' }, q.n), h('div', { class: 'li-s' }, q.t.split('\n')[0])), icon('plus')));
    root.append(ql);
    this.title(root, 'Font');
    root.append(h('div', { class: 'btn-row' }, UI.btn('Impor font (.ttf/.otf)', 'upload', async () => { const f = await pickFiles('.ttf,.otf,.woff,.woff2'); for (const x of f) await Fonts.importFile(x); })));
    root.append(h('p', { class: 'hint', style: { marginTop: '8px' } }, 'Font Google dimuat otomatis saat online lalu tersimpan untuk dipakai offline.'));
  },
  drawStylePreview(cv, st, id) {
    const draw = () => {
      const fake = { id: '__prev_' + id, text: 'Teks', style: Object.assign({}, st, { size: 80 }), scale: 1 };
      const unitFix = 1080 / Math.min(P().width, P().height);
      const tc = Comp.textCanvas(fake, 1, unitFix * .6);
      const g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, cv.height);
      const s = Math.min(cv.width * .9 / tc.canvas.width, cv.height * .9 / tc.canvas.height);
      g.drawImage(tc.canvas, (cv.width - tc.canvas.width * s) / 2, (cv.height - tc.canvas.height * s) / 2, tc.canvas.width * s, tc.canvas.height * s);
      delete Comp.textCache[fake.id];
    };
    draw();
    Fonts.ensure(st.font).then(() => draw());
  },

  /* ---------------- STIKER ---------------- */
  p_sticker(root, opts) {
    const cats = ['Grafis', 'Bentuk', ...Object.keys(EMOJI), 'Gambar'];
    const cat = this.cats.sticker || 'Grafis';
    root.append(UI.cats(cats, cat, c => { this.cats.sticker = c; this.render('sticker', root, opts); }));
    const done = () => { if (opts.mobile) App.closeSheet(); };
    if (cat === 'Gambar') {
      root.append(h('p', { class: 'hint box' }, 'Impor gambar PNG (transparan) / GIF untuk dijadikan stiker di atas video.'));
      root.append(h('div', { style: { height: '10px' } }), UI.btn('Impor gambar stiker', 'upload', async () => { const f = await pickFiles('image/*'); const ms = await Media.importFiles(f, { toast: false }); for (const m of ms) { const c = App.addMediaClip(m.id, { overlay: true }); if (c) { c.scale = .45; c.dur = S.settings.textDur; } } App.changed({ tl: true }); done(); }, 'accent block'));
      return;
    }
    const grid = h('div', { class: 'tiles sm' });
    if (cat === 'Grafis') {
      for (const s of SVG_STICKERS) {
        const img = h('img', { src: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">${s.svg}</svg>`), alt: s.n });
        const tile = h('div', { class: 'tile', title: s.n }, h('div', { class: 'th' }, img));
        tile.onclick = () => { App.addStickerClip({ type: 'svg', v: s.id }); done(); };
        grid.append(tile);
      }
    } else if (cat === 'Bentuk') {
      for (const s of SHAPES) {
        const cv = h('canvas', { width: 120, height: 120 });
        const sk = { type: 'shape', v: s.id, color: '#ffc93c', aw: s.id === 'bar' ? 3 : s.id === 'pill' ? 2.2 : s.id === 'line' ? 2.5 : 1, ah: s.id === 'bar' ? .5 : s.id === 'pill' ? .8 : 1 };
        const g = cv.getContext('2d'); const sc = Math.min(120 / sk.aw, 120 / sk.ah) * .78;
        const w = sc * sk.aw, hh = sc * sk.ah; g.translate((120 - w) / 2, (120 - hh) / 2);
        Comp.drawShape(g, sk, w, hh);
        const tile = h('div', { class: 'tile', title: s.n }, h('div', { class: 'th' }, cv), h('div', { class: 'nm' }, s.n));
        tile.onclick = () => { App.addStickerClip(Object.assign({}, sk)); done(); };
        grid.append(tile);
      }
    } else {
      for (const e of EMOJI[cat]) {
        const tile = h('div', { class: 'tile' }, h('div', { class: 'th' }, h('span', { class: 'emo' }, e)));
        tile.onclick = () => { App.addStickerClip({ type: 'emoji', v: e }); done(); };
        grid.append(tile);
      }
    }
    root.append(grid);
  },

  /* ---------------- EFEK ---------------- */
  p_effects(root, opts) {
    const tgt = this.targetToggle(root);
    const cats = EFFECT_CATS;
    const cat = this.cats.effects || cats[0];
    root.append(h('div', { style: { height: '10px' } }), UI.cats(cats, cat, c => { this.cats.effects = c; this.render('effects', root, opts); }));
    const grid = h('div', { class: 'tiles' });
    const selC = this.selVisual();
    const hues = { Dasar: 210, Kamera: 280, Distorsi: 330, Retro: 30, Cahaya: 45, Partikel: 190, Gaya: 150, Bingkai: 250 };
    EFFECTS.filter(e => e.c === cat).forEach((e, i) => {
      const hue = (hues[e.c] || 200) + i * 9;
      const on = selC && (selC.fx || []).some(f => f.id === e.id);
      const tile = h('div', { class: 'tile' + (on ? ' on' : '') }, h('div', { class: 'th', style: { background: `linear-gradient(135deg,hsl(${hue},55%,32%),hsl(${hue + 40},60%,18%))` } }, h('span', { class: 'ico-big', style: { color: `hsl(${hue},90%,80%)` } }, icon('effects'))), h('button', { class: 'add', type: 'button' }, icon('plus')), h('div', { class: 'nm' }, e.n));
      tile.onclick = () => {
        const c = this.selVisual();
        if (tgt === 'clip' && this.target === 'clip' && c) { Act.addClipFx(c, e.id); }
        else App.addEffectClip(e.id);
        if (opts.mobile) App.closeSheet(); else this.refresh();
      };
      this.dragData(tile, { kind: 'effect', id: e.id });
      grid.append(tile);
    });
    root.append(grid);
  },

  /* ---------------- TRANSISI ---------------- */
  p_transition(root, opts) {
    const cut = S.selCut ? clipById(S.selCut) : null;
    if (!cut) root.append(h('p', { class: 'hint box' }, 'Ketuk kotak kecil di antara dua klip pada timeline, atau pilih klip lalu klik transisi (diterapkan di akhir klip itu).'));
    else root.append(h('p', { class: 'hint box' }, h('b', null, 'Titik potong terpilih. '), cut.trans ? 'Transisi saat ini: ' + (TRANS_BY_ID[cut.trans.id] || {}).n : 'Belum ada transisi.'));
    const durRow = UI.slider({ label: 'Durasi', min: .1, max: 3, step: .1, value: cut && cut.trans ? cut.trans.dur : this.transDur, onStart: () => { if (cut && cut.trans) Hist.save(); }, onInput: v => { this.transDur = v; if (cut && cut.trans) { cut.trans.dur = v; Comp.invalidate(); Engine.requestRender(); } }, onChange: () => { if (cut && cut.trans) App.changed({ tl: true }); } });
    root.append(h('div', { style: { margin: '12px 0' } }, durRow));
    root.append(h('div', { class: 'btn-row', style: { marginBottom: '12px' } },
      UI.btn('Terapkan ke semua', 'layers', () => { const id = cut && cut.trans ? cut.trans.id : 'fade'; Act.transitionAll(id, this.transDur); }),
      cut && cut.trans ? UI.btn('Hapus', 'trash', () => { Hist.save(); cut.trans = null; App.changed({ tl: true }); this.refresh(); }, 'danger') : null));
    const cat = this.cats.transition || TRANS_CATS[0];
    root.append(UI.cats(TRANS_CATS, cat, c => { this.cats.transition = c; this.render('transition', root, opts); }));
    const grid = h('div', { class: 'tiles' });
    TRANSITIONS.filter(t => t.c === cat).forEach((t, i) => {
      const on = cut && cut.trans && cut.trans.id === t.id;
      const tile = h('div', { class: 'tile' + (on ? ' on' : '') }, h('div', { class: 'th', style: { background: `linear-gradient(90deg,hsl(${200 + i * 13},45%,30%) 50%,hsl(${30 + i * 13},65%,45%) 50%)` } }, h('span', { class: 'ico-big', style: { color: '#fff' } }, icon('transition'))), h('div', { class: 'nm' }, t.n));
      tile.onclick = () => {
        const ok = S.selCut ? Act.applyTransition(S.selCut, t.id, this.transDur) : Act.applyTransitionFromSelection(t.id, this.transDur);
        if (ok && opts.mobile) App.closeSheet(); else this.refresh();
      };
      this.dragData(tile, { kind: 'transition', id: t.id });
      grid.append(tile);
    });
    root.append(grid);
  },

  /* ---------------- FILTER ---------------- */
  p_filter(root, opts) {
    const tgt = this.targetToggle(root);
    const c = this.selVisual();
    if (c && c.filter && tgt === 'clip') {
      root.append(h('div', { style: { marginTop: '10px' } }, UI.slider({ label: 'Intensitas', min: 0, max: 100, step: 1, scale: 100, value: c.filter.int, onStart: () => Hist.save(), onInput: v => { c.filter.int = v; Engine.requestRender(); }, onChange: () => Store.saveSoon() })));
    }
    const cat = this.cats.filter || FILTER_CATS[0];
    root.append(h('div', { style: { height: '10px' } }), UI.cats(FILTER_CATS, cat, x => { this.cats.filter = x; this.render('filter', root, opts); }));
    const grid = h('div', { class: 'tiles' });
    const img = sampleImage();
    if (c && tgt === 'clip') {
      const none = h('div', { class: 'tile' + (!c.filter ? ' on' : '') }, h('div', { class: 'th' }, h('span', { class: 'ico-big' }, icon('close'))), h('div', { class: 'nm' }, 'Tanpa'));
      none.onclick = () => { Hist.save(); c.filter = null; App.changed({ insp: true }); this.refresh(); };
      grid.append(none);
    }
    for (const f of FILTERS.filter(x => x.c === cat)) {
      const on = c && c.filter && c.filter.id === f.id && tgt === 'clip';
      const th = h('div', { class: 'th', style: { backgroundImage: `url(${img})`, filter: filterCss(f.p) } });
      const tile = h('div', { class: 'tile' + (on ? ' on' : '') }, th, h('div', { class: 'nm' }, f.n));
      tile.onclick = () => {
        const cc = this.selVisual();
        if (this.target === 'clip' && cc) Act.setClipFilter(cc, f.id); else App.addFilterClip(f.id);
        if (opts.mobile && !(this.target === 'clip' && cc)) App.closeSheet(); else this.refresh();
      };
      this.dragData(tile, { kind: 'filter', id: f.id });
      grid.append(tile);
    }
    root.append(grid);
  },

  /* ---------------- PENYESUAIAN ---------------- */
  p_adjust(root, opts) {
    const c = this.selVisual();
    root.append(h('button', { class: 'btn block', type: 'button', style: { marginBottom: '12px' }, onclick: () => { App.addAdjustClip(); if (opts.mobile) App.closeSheet(); } }, icon('plus'), 'Tambah lapisan penyesuaian'));
    if (c) {
      root.append(h('p', { class: 'hint' }, 'Penyesuaian untuk klip terpilih:'));
      root.append(Insp.adjustBody(c));
    } else root.append(h('p', { class: 'hint box' }, 'Pilih klip video/foto untuk mengatur warnanya, atau tambahkan lapisan penyesuaian yang mengenai semua klip di bawahnya.'));
  },

  /* ---------------- SUBTITLE / TEKS OTOMATIS ---------------- */
  p_captions(root, opts) {
    root.append(h('div', { class: 'hint box' }, h('b', null, 'Teks otomatis (AI). '), 'Mengubah suara di video/audio menjadi subtitle. Saat pertama dipakai perlu internet untuk mengunduh model (±40–250 MB), setelah itu tersimpan di perangkat.'));
    const st = this.capOpts || (this.capOpts = { lang: 'indonesian', model: 'base' });
    root.append(h('div', { style: { height: '10px' } }),
      UI.row('Bahasa', UI.select([{ value: 'indonesian', label: 'Indonesia' }, { value: 'english', label: 'Inggris' }, { value: 'arabic', label: 'Arab' }, { value: 'malay', label: 'Melayu' }, { value: 'javanese', label: 'Jawa' }, { value: 'sundanese', label: 'Sunda' }, { value: 'korean', label: 'Korea' }, { value: 'japanese', label: 'Jepang' }, { value: 'chinese', label: 'Mandarin' }, { value: 'auto', label: 'Deteksi otomatis' }], st.lang, v => st.lang = v)),
      h('div', { style: { height: '8px' } }),
      UI.row('Akurasi', UI.select([{ value: 'tiny', label: 'Cepat (kecil)' }, { value: 'base', label: 'Seimbang' }, { value: 'small', label: 'Akurat (besar)' }], st.model, v => st.model = v)),
      h('div', { style: { height: '10px' } }),
      UI.btn('Buat subtitle otomatis', 'ai', () => Captions.auto(st), 'accent block'));
    this.title(root, 'Subtitle manual');
    root.append(h('div', { class: 'btn-row' },
      UI.btn('Tambah baris', 'plus', () => { Captions.addLine(); if (opts.mobile) App.closeSheet(); }),
      UI.btn('Impor SRT', 'upload', async () => { const f = await pickFiles('.srt,.vtt', false); if (f[0]) await Captions.importSrt(f[0]); }),
      UI.btn('Ekspor SRT', 'download', () => Captions.exportSrt())));
    const caps = P().clips.filter(c => c.cap).sort((a, b) => a.start - b.start);
    if (caps.length) {
      this.title(root, 'Animasi subtitle');
      const setAnim = (inId, loopId) => { Hist.save(); caps.forEach(c => { c.anim = {}; if (inId) c.anim.in = { id: inId, dur: inId === 'typewriter' || inId === 'wordPop' ? Math.min(c.dur * .7, 1.5) : .3 }; if (loopId) c.anim.loop = { id: loopId, speed: 1 }; }); App.changed({ tl: true }); toast('Animasi diterapkan ke semua subtitle'); };
      root.append(h('div', { class: 'btn-row' }, UI.btn('Tanpa', null, () => setAnim(null)), UI.btn('Kata demi kata', null, () => setAnim('wordPop')), UI.btn('Karaoke', null, () => setAnim(null, 'karaoke')), UI.btn('Mesin ketik', null, () => setAnim('typewriter')), UI.btn('Muncul', null, () => setAnim('fade'))));
      this.title(root, 'Gaya semua subtitle (' + caps.length + ')');
      const grid = h('div', { class: 'tiles' });
      TEXT_STYLES.filter(s => /Subtitle|Garis|Kotak|Bayangan|Polos|Kuning/.test(s.n)).forEach((ts, i) => {
        const cv = h('canvas', { width: 220, height: 90 });
        const tile = h('div', { class: 'tile' }, h('div', { class: 'th txtstyle' }, cv), h('div', { class: 'nm' }, ts.n));
        this.drawStylePreview(cv, makeTextStyle(Object.assign({}, CAPTION_STYLE, ts.s)), 'c' + i);
        tile.onclick = () => { Hist.save(); caps.forEach(c => { c.style = makeTextStyle(Object.assign({}, CAPTION_STYLE, ts.s, { size: c.style.size })); }); App.changed({ tl: true }); toast('Gaya diterapkan ke semua subtitle'); };
        grid.append(tile);
      });
      root.append(grid);
      this.title(root, 'Daftar subtitle');
      const list = h('div', { class: 'list' });
      for (const c of caps.slice(0, 300)) {
        const inp = h('input', { class: 'inp', value: c.text });
        inp.addEventListener('keydown', e => e.stopPropagation());
        inp.addEventListener('change', () => { Hist.save(); c.text = inp.value; App.changed({ tl: true }); });
        inp.addEventListener('focus', () => { Engine.seek(c.start + .01); });
        list.append(h('div', { class: 'litem', style: { cursor: 'default' } }, h('div', { class: 'li-s', style: { width: '62px', flex: 'none', fontFamily: 'var(--mono)' } }, fmtDur(c.start) + '\n'), h('div', { class: 'li-main' }, inp)));
      }
      root.append(list);
    }
  },
};

/* =========================================================
   Perekam suara (voice-over)
   ========================================================= */
const Recorder = {
  async open() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { toast('Perekaman tidak didukung di browser ini', 'err'); return; }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch (e) { toast('Izin mikrofon ditolak', 'err'); return; }
    const dot = h('div', { class: 'rec-dot' }, icon('mic'));
    const time = h('div', { class: 'rec-time' }, '00:00');
    const meter = h('div', { class: 'meter' }, h('i'));
    let playAlong = true;
    const body = h('div', { class: 'rec-ui' }, dot, time, meter,
      UI.row('Putar video', UI.toggle(true, v => playAlong = v)),
      h('p', { class: 'hint', style: { textAlign: 'center' } }, 'Rekaman dimulai di posisi playhead (' + fmtDur(S.time) + '). Pakai earphone agar suara video tidak ikut terekam.'));
    const AC = window.AudioContext || window.webkitAudioContext;
    const ac = new AC(); const an = ac.createAnalyser(); an.fftSize = 512; ac.createMediaStreamSource(stream).connect(an);
    const buf = new Uint8Array(an.fftSize);
    let raf, rec, chunks = [], t0 = 0, startAt = S.time, recording = false;
    const loop = () => { raf = requestAnimationFrame(loop); an.getByteTimeDomainData(buf); let m = 0; for (const v of buf) m = Math.max(m, Math.abs(v - 128)); meter.firstChild.style.width = Math.min(100, m / 1.28) + '%'; if (recording) time.textContent = fmtDur((performance.now() - t0) / 1000); };
    loop();
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
    const finish = async save => {
      cancelAnimationFrame(raf);
      if (rec && rec.state !== 'inactive') { await new Promise(r => { rec.onstop = r; rec.stop(); }); }
      if (Engine.playing) Engine.pause();
      stream.getTracks().forEach(t => t.stop()); ac.close();
      if (save && chunks.length) {
        const blob = new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' });
        const ext = /mp4/.test(blob.type) ? 'm4a' : /ogg/.test(blob.type) ? 'ogg' : 'webm';
        try {
          const m = await Media.addBlob(blob, 'Rekaman ' + new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + '.' + ext, 'audio');
          App.onMediaChanged();
          App.addAudioClip(m.id, startAt);
          toast('Rekaman ditambahkan ke timeline');
        } catch (e) { toast('Gagal menyimpan rekaman', 'err'); }
      }
    };
    const res = await modal({
      title: 'Rekam suara', body, dismiss: false,
      buttons: [
        { label: 'Batal', value: 'cancel', cls: 'ghost' },
        { label: 'Mulai rekam', cls: 'accent', onClick: () => {
          if (recording) return true;
          rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
          rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
          startAt = S.time; rec.start(250); t0 = performance.now(); recording = true; dot.classList.add('on');
          if (playAlong) Engine.play();
          const btn = $$('.modal .m-f .btn').pop(); if (btn) btn.textContent = 'Selesai & simpan';
          return false;
        } },
      ],
    });
    await finish(res !== 'cancel' && recording);
  },
};
