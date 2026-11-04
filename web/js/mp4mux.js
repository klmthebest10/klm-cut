'use strict';
/* =========================================================
   KLM Cut — muxer MP4 sederhana (H.264 + AAC/Opus) untuk hasil WebCodecs
   Struktur: ftyp | moov | mdat  (faststart: moov di depan)
   ========================================================= */
const MP4Mux = {
  enc: new TextEncoder(),
  cat(parts) {
    let n = 0; for (const p of parts) n += p.length;
    const out = new Uint8Array(n); let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  },
  u8(v) { return new Uint8Array([v & 255]); },
  u16(v) { return new Uint8Array([(v >> 8) & 255, v & 255]); },
  u24(v) { return new Uint8Array([(v >> 16) & 255, (v >> 8) & 255, v & 255]); },
  u32(v) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v >>> 0); return b; },
  i32(v) { const b = new Uint8Array(4); new DataView(b.buffer).setInt32(0, v | 0); return b; },
  u64(v) { const b = new Uint8Array(8); const dv = new DataView(b.buffer); dv.setUint32(0, Math.floor(v / 4294967296)); dv.setUint32(4, v >>> 0); return b; },
  str(s) { return this.enc.encode(s); },
  box(type, ...p) { const body = this.cat(p.flat(Infinity)); return this.cat([this.u32(body.length + 8), this.str(type), body]); },
  full(type, ver, flags, ...p) { return this.box(type, this.u8(ver), this.u24(flags), ...p); },
  matrix() { return [0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000].map(v => this.u32(v)); },
  desc(tag, body) {
    const len = body.length; const lb = [];
    let l = len; const bytes = [];
    do { bytes.unshift(l & 0x7f); l >>= 7; } while (l > 0);
    for (let i = 0; i < bytes.length; i++) lb.push(i < bytes.length - 1 ? bytes[i] | 0x80 : bytes[i]);
    return this.cat([this.u8(tag), new Uint8Array(lb), body]);
  },
  /* tabel sampel umum */
  stbl(entry, samples, offsets, opts = {}) {
    const B = this;
    // stts (durasi run-length)
    const stts = []; for (const s of samples) { const l = stts[stts.length - 1]; if (l && l[1] === s.dur) l[0]++; else stts.push([1, s.dur]); }
    const parts = [
      B.full('stsd', 0, 0, B.u32(1), entry),
      B.full('stts', 0, 0, B.u32(stts.length), stts.map(([c, d]) => [B.u32(c), B.u32(d)])),
    ];
    if (opts.ctts) {
      const ct = []; for (const s of samples) { const l = ct[ct.length - 1]; if (l && l[1] === s.cts) l[0]++; else ct.push([1, s.cts]); }
      parts.push(B.full('ctts', 1, 0, B.u32(ct.length), ct.map(([c, d]) => [B.u32(c), B.i32(d)])));
    }
    if (opts.sync) { const ss = []; samples.forEach((s, i) => { if (s.key) ss.push(i + 1); }); parts.push(B.full('stss', 0, 0, B.u32(ss.length), ss.map(v => B.u32(v)))); }
    parts.push(B.full('stsc', 0, 0, B.u32(1), B.u32(1), B.u32(1), B.u32(1)));
    parts.push(B.full('stsz', 0, 0, B.u32(0), B.u32(samples.length), samples.map(s => B.u32(s.size))));
    const big = opts.big != null ? opts.big : (offsets.length && offsets[offsets.length - 1] > 0xffffffff);
    parts.push(big ? B.full('co64', 0, 0, B.u32(offsets.length), offsets.map(o => B.u64(o))) : B.full('stco', 0, 0, B.u32(offsets.length), offsets.map(o => B.u32(o))));
    return B.box('stbl', ...parts);
  },
  trak(id, kind, ts, durTs, durMs, entry, samples, offsets, o = {}) {
    const B = this;
    const tkhd = B.full('tkhd', 0, 3, B.u32(0), B.u32(0), B.u32(id), B.u32(0), B.u32(durMs), B.u32(0), B.u32(0), B.u16(0), B.u16(0), B.u16(kind === 'soun' ? 0x0100 : 0), B.u16(0), B.matrix(), B.u32((o.w || 0) * 65536), B.u32((o.h || 0) * 65536));
    const mdhd = B.full('mdhd', 0, 0, B.u32(0), B.u32(0), B.u32(ts), B.u32(durTs), B.u16(0x55c4), B.u16(0));
    const hdlr = B.full('hdlr', 0, 0, B.u32(0), B.str(kind), B.u32(0), B.u32(0), B.u32(0), B.str(kind === 'vide' ? 'VideoHandler\0' : 'SoundHandler\0'));
    const mh = kind === 'vide' ? B.full('vmhd', 0, 1, B.u16(0), B.u16(0), B.u16(0), B.u16(0)) : B.full('smhd', 0, 0, B.u16(0), B.u16(0));
    const dinf = B.box('dinf', B.full('dref', 0, 0, B.u32(1), B.full('url ', 0, 1)));
    const edts = o.edit ? B.box('edts', B.full('elst', 0, 0, B.u32(1), B.u32(durMs), B.u32(o.edit), B.u32(0x00010000))) : null;
    return B.box('trak', tkhd, edts || [], B.box('mdia', mdhd, hdlr, B.box('minf', mh, dinf, B.stbl(entry, samples, offsets, o))));
  },
  avcEntry(w, h, avcC) {
    const B = this;
    const name = new Uint8Array(32); const nm = B.str('KLM Cut AVC'); name[0] = nm.length; name.set(nm, 1);
    return B.box('avc1', new Uint8Array(6), B.u16(1), B.u16(0), B.u16(0), B.u32(0), B.u32(0), B.u32(0), B.u16(w), B.u16(h), B.u32(0x00480000), B.u32(0x00480000), B.u32(0), B.u16(1), name, B.u16(0x18), B.u16(0xffff), B.box('avcC', avcC));
  },
  audioEntryBase(type, ch, sr, extra) {
    const B = this;
    return B.box(type, new Uint8Array(6), B.u16(1), B.u32(0), B.u32(0), B.u16(ch), B.u16(16), B.u16(0), B.u16(0), B.u32(Math.min(sr, 65535) * 65536), extra);
  },
  aacEntry(ch, sr, asc, bitrate) {
    const B = this;
    if (!asc || !asc.length) {
      const fi = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000].indexOf(sr);
      asc = new Uint8Array([(2 << 3) | (fi >> 1), ((fi & 1) << 7) | (ch << 3)]);
    }
    const dsi = B.desc(0x05, asc);
    const dcd = B.desc(0x04, B.cat([B.u8(0x40), B.u8(0x15), B.u24(0), B.u32(bitrate), B.u32(bitrate), dsi]));
    const esd = B.desc(0x03, B.cat([B.u16(2), B.u8(0), dcd, B.desc(0x06, B.u8(0x02))]));
    return B.audioEntryBase('mp4a', ch, sr, B.full('esds', 0, 0, esd));
  },
  opusEntry(ch, sr, preSkip) {
    const B = this;
    const dops = B.box('dOps', B.u8(0), B.u8(ch), B.u16(preSkip), B.u32(sr), B.u16(0), B.u8(0));
    return B.audioEntryBase('Opus', ch, sr, dops);
  },
  /* v: {w,h,fps,avcC,chunks:[{pts(us),key,data}]}, a: {kind,sr,ch,config,bitrate,chunks:[{data,dur(samples)}]} */
  build(v, a) {
    const B = this;
    const ftyp = B.box('ftyp', B.str('isom'), B.u32(0x200), B.str('isom'), B.str('iso2'), B.str('avc1'), B.str('mp41'));
    const vts = v.fps * 1000, fd = 1000;
    // urutan decode = urutan output encoder; hitung DTS & CTS
    const pts = v.chunks.map(c => Math.round(c.pts * vts / 1e6));
    const sorted = [...pts].sort((x, y) => x - y);
    let dts = sorted.map((p, i) => i === 0 ? p : p);
    let shift = 0; for (let i = 0; i < pts.length; i++) shift = Math.max(shift, dts[i] - pts[i]);
    dts = dts.map(d => d - shift);
    const needCtts = pts.some((p, i) => p - dts[i] !== 0);
    const vs = v.chunks.map((c, i) => ({ size: c.data.length, dur: i < pts.length - 1 ? Math.max(1, dts[i + 1] - dts[i]) : fd, key: c.key, cts: pts[i] - dts[i] }));
    const vDurTs = vs.reduce((s, x) => s + x.dur, 0);
    const as = a ? a.chunks.map(c => ({ size: c.data.length, dur: c.dur })) : [];
    const aDurTs = as.reduce((s, x) => s + x.dur, 0);
    const durMs = Math.max(Math.round(vDurTs / vts * 1000), a ? Math.round(aDurTs / a.sr * 1000) : 0);
    const totalData = v.chunks.reduce((s, c) => s + c.data.length, 0) + (a ? a.chunks.reduce((s, c) => s + c.data.length, 0) : 0);
    const big = totalData > 0xffff0000;
    const mk = (offV, offA) => {
      const tr = [B.trak(1, 'vide', vts, vDurTs, Math.round(vDurTs / vts * 1000), B.avcEntry(v.w, v.h, v.avcC), vs, offV, { w: v.w, h: v.h, sync: true, ctts: needCtts, edit: shift ? shift : 0, big })];
      if (a && as.length) tr.push(B.trak(2, 'soun', a.sr, aDurTs, Math.round(aDurTs / a.sr * 1000), a.kind === 'aac' ? B.aacEntry(a.ch, a.sr, a.config, a.bitrate || 192000) : B.opusEntry(a.ch, a.sr, a.preSkip || 312), as, offA, { big }));
      const mvhd = B.full('mvhd', 0, 0, B.u32(0), B.u32(0), B.u32(1000), B.u32(durMs), B.u32(0x00010000), B.u16(0x0100), B.u16(0), B.u32(0), B.u32(0), B.matrix(), new Uint8Array(24), B.u32(tr.length + 1));
      return B.box('moov', mvhd, ...tr);
    };
    // ukuran moov dengan offset sementara, lalu offset sebenarnya
    const dummy = (n, val) => new Array(n).fill(val);
    const moov0 = mk(dummy(vs.length, big ? 2 ** 33 : 0), dummy(as.length, big ? 2 ** 33 : 0));
    const mdatHead = 16;
    let off = ftyp.length + moov0.length + mdatHead;
    const offV = vs.map(s => { const o = off; off += s.size; return o; });
    const offA = as.map(s => { const o = off; off += s.size; return o; });
    const moov = mk(offV, offA);
    if (moov.length !== moov0.length) throw new Error('ukuran moov berubah');
    const mdatH = B.cat([B.u32(1), B.str('mdat'), B.u64(totalData + mdatHead)]);
    const parts = [ftyp, moov, mdatH];
    for (const c of v.chunks) parts.push(c.data);
    if (a) for (const c of a.chunks) parts.push(c.data);
    return new Blob(parts, { type: 'video/mp4' });
  },
};
