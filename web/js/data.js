'use strict';
/* =========================================================
   KLM Cut — data bawaan: rasio, filter, efek (GLSL), transisi (GLSL),
   animasi, gaya teks, font, stiker, efek suara & musik sintesis
   ========================================================= */

const RATIOS = [
  { id: 'original', name: 'Asli' }, { id: '16:9', name: '16:9 YouTube' }, { id: '9:16', name: '9:16 TikTok/Reels' },
  { id: '1:1', name: '1:1 Persegi' }, { id: '4:5', name: '4:5 Instagram' }, { id: '4:3', name: '4:3' }, { id: '3:4', name: '3:4' },
  { id: '21:9', name: '21:9 Sinema' }, { id: '2.35:1', name: '2.35:1 Layar Lebar' }, { id: '2:1', name: '2:1' },
];
const RESOLUTIONS = [{ v: 480, n: '480p' }, { v: 720, n: '720p' }, { v: 1080, n: '1080p' }, { v: 1440, n: '2K' }, { v: 2160, n: '4K' }];
const FPS_LIST = [24, 25, 30, 50, 60];
const BLENDS = [
  { id: 'normal', n: 'Normal' }, { id: 'darken', n: 'Gelapkan' }, { id: 'multiply', n: 'Kalikan' }, { id: 'burn', n: 'Bakar Warna' },
  { id: 'lighten', n: 'Terangkan' }, { id: 'screen', n: 'Layar' }, { id: 'dodge', n: 'Hindari Warna' }, { id: 'add', n: 'Tambah' },
  { id: 'overlay', n: 'Overlay' }, { id: 'soft', n: 'Cahaya Lembut' }, { id: 'hard', n: 'Cahaya Keras' }, { id: 'diff', n: 'Selisih' }, { id: 'excl', n: 'Eksklusi' },
];
const BLEND_ID = Object.fromEntries(BLENDS.map((b, i) => [b.id, i]));

/* Penyesuaian warna (nilai UI -100..100, kecuali disebut) */
const ADJUSTS = [
  { k: 'bri', n: 'Kecerahan' }, { k: 'con', n: 'Kontras' }, { k: 'sat', n: 'Saturasi' }, { k: 'exp', n: 'Eksposur' },
  { k: 'temp', n: 'Suhu' }, { k: 'tint', n: 'Rona' }, { k: 'hue', n: 'Warna (Hue)', min: -180, max: 180 },
  { k: 'hl', n: 'Sorotan' }, { k: 'sh', n: 'Bayangan' }, { k: 'fade', n: 'Pudar', min: 0 }, { k: 'vig', n: 'Vinyet' },
  { k: 'sharp', n: 'Ketajaman', min: 0 }, { k: 'grain', n: 'Butiran', min: 0 },
];

/* ---------------- FILTER (preset warna) ---------------- */
const FILTERS = [
  { id: 'cerah', n: 'Cerah', c: 'Populer', p: { bri: .05, con: .1, sat: .15 } },
  { id: 'vivid', n: 'Vivid', c: 'Populer', p: { sat: .45, con: .15 } },
  { id: 'hangat', n: 'Hangat', c: 'Populer', p: { temp: .45, sat: .1, con: .05 } },
  { id: 'sejuk', n: 'Sejuk', c: 'Populer', p: { temp: -.45, con: .05 } },
  { id: 'lembut', n: 'Lembut', c: 'Populer', p: { con: -.15, fade: .25, sat: -.05, bri: .04 } },
  { id: 'kristal', n: 'Kristal', c: 'Populer', p: { con: .2, sat: .15, hl: -.15, sh: .15, sharp: .3 } },
  { id: 'tealorange', n: 'Teal Oranye', c: 'Film', p: { sT: [0, .45, .55, .45], hT: [1, .6, .25, .35], con: .15, sat: .1 } },
  { id: 'filmklasik', n: 'Film Klasik', c: 'Film', p: { con: .12, sat: -.1, fade: .18, sT: [.1, .25, .3, .25], hT: [1, .85, .6, .2], grain: .25 } },
  { id: 'bioskop', n: 'Bioskop', c: 'Film', p: { con: .25, sat: -.05, sT: [0, .3, .4, .35], hT: [1, .75, .45, .25], vig: .25 } },
  { id: 'moody', n: 'Moody', c: 'Film', p: { exp: -.15, con: .2, sat: -.25, sT: [.1, .15, .25, .35], vig: .35 } },
  { id: 'dramatis', n: 'Dramatis', c: 'Film', p: { con: .4, sat: -.15, hl: -.25, sh: -.15, vig: .3 } },
  { id: 'matte', n: 'Matte', c: 'Film', p: { fade: .35, con: -.05 } },
  { id: 'malam', n: 'Malam', c: 'Film', p: { temp: -.5, exp: -.2, con: .15, sat: -.1 } },
  { id: 'retro70', n: 'Retro 70', c: 'Retro', p: { sepia: .35, fade: .2, con: -.05, sat: -.1, grain: .3, vig: .35 } },
  { id: 'polaroid', n: 'Polaroid', c: 'Retro', p: { fade: .3, temp: .2, con: -.1, hT: [1, .95, .8, .2] } },
  { id: 'vintage', n: 'Vintage', c: 'Retro', p: { sepia: .6, vig: .4, grain: .3, con: .05 } },
  { id: 'kenangan', n: 'Kenangan', c: 'Retro', p: { fade: .25, sepia: .25, grain: .4, vig: .3, sat: -.2 } },
  { id: 'sepia', n: 'Sepia', c: 'Retro', p: { sepia: 1, con: .05 } },
  { id: 'kodachrome', n: 'Pita 80an', c: 'Retro', p: { con: .2, sat: .25, temp: .15, sT: [.2, .1, .3, .3], grain: .2 } },
  { id: 'mono', n: 'Mono', c: 'Hitam Putih', p: { bw: 1, con: .1 } },
  { id: 'noir', n: 'Noir', c: 'Hitam Putih', p: { bw: 1, con: .45, vig: .45, exp: -.1 } },
  { id: 'perak', n: 'Perak', c: 'Hitam Putih', p: { bw: 1, con: -.05, fade: .2, bri: .05 } },
  { id: 'arang', n: 'Arang', c: 'Hitam Putih', p: { bw: 1, con: .6, sh: -.2, grain: .3 } },
  { id: 'kulitcerah', n: 'Kulit Cerah', c: 'Potret', p: { bri: .08, sh: .2, sat: -.05, tint: .08, hl: -.1 } },
  { id: 'pink', n: 'Pink Manis', c: 'Potret', p: { hT: [1, .7, .85, .3], sat: .05, bri: .05, fade: .1 } },
  { id: 'pastel', n: 'Pastel', c: 'Potret', p: { sat: -.3, fade: .3, bri: .08 } },
  { id: 'susu', n: 'Susu', c: 'Potret', p: { bri: .12, con: -.1, sat: -.15, temp: .08, fade: .15 } },
  { id: 'alam', n: 'Hijau Alam', c: 'Alam', p: { sat: .25, hue: -.03, temp: -.05, tint: -.15, con: .08 } },
  { id: 'langit', n: 'Langit Biru', c: 'Alam', p: { temp: -.25, sat: .25, hl: -.2 } },
  { id: 'senja', n: 'Senja', c: 'Alam', p: { temp: .6, tint: .2, sat: .2, vig: .3 } },
  { id: 'emas', n: 'Jam Emas', c: 'Alam', p: { temp: .4, hT: [1, .8, .35, .35], con: .1 } },
  { id: 'tropis', n: 'Tropis', c: 'Alam', p: { sat: .35, temp: .15, tint: -.1, hue: .02 } },
  { id: 'gugur', n: 'Musim Gugur', c: 'Alam', p: { temp: .5, sat: .15, hue: -.04, tint: .1 } },
  { id: 'salju', n: 'Salju', c: 'Alam', p: { temp: -.3, bri: .12, sat: -.25, fade: .1 } },
  { id: 'makanan', n: 'Lezat', c: 'Alam', p: { sat: .3, temp: .2, con: .1, bri: .04 } },
  { id: 'siber', n: 'Siberpunk', c: 'Gaya', p: { sT: [.2, 0, .5, .5], hT: [0, 1, 1, .35], con: .2, sat: .3, tint: .2 } },
  { id: 'neon', n: 'Neon', c: 'Gaya', p: { sat: .6, con: .25, hue: .05, hT: [1, .2, .8, .25] } },
  { id: 'lembab', n: 'Lembab', c: 'Gaya', p: { temp: .15, tint: -.1, fade: .15, sat: -.05 } },
  { id: 'infra', n: 'Infra', c: 'Gaya', p: { hue: .5, sat: .4, con: .2 } },
  { id: 'ungu', n: 'Ungu Mimpi', c: 'Gaya', p: { hT: [.75, .5, 1, .35], sT: [.25, .1, .4, .35], fade: .1 } },
  { id: 'hijaumatrix', n: 'Matriks', c: 'Gaya', p: { tint: -.6, con: .3, sat: -.3, sT: [0, .3, .1, .4] } },
];
const FILTER_CATS = [...new Set(FILTERS.map(f => f.c))];
const FILTER_BY_ID = Object.fromEntries(FILTERS.map(f => [f.id, f]));
function filterCss(p) {
  p = p || {};
  const b = 1 + (p.bri || 0) * .6 + (p.exp || 0) * .5, c = 1 + (p.con || 0), s = Math.max(0, 1 + (p.sat || 0));
  return `brightness(${b}) contrast(${c}) saturate(${s}) hue-rotate(${(p.hue || 0) * 180}deg) sepia(${Math.min(1, (p.sepia || 0) + Math.max(0, p.temp || 0) * .35)}) grayscale(${p.bw || 0})`;
}

/* ---------------- EFEK (shader GLSL ES 1.0) ----------------
   tersedia: T(uv) (premultiplied), L(rgb), hash(vec2), noise(vec2), ASP(), TT (=waktu*kecepatan),
   uniform u_res, u_time, u_int (0..1), u_speed, u_dur. Fungsi wajib: vec4 fx(vec2 uv) */
const FX_LT = `float Lt(vec2 u){ return L(T(u).rgb); }\n`;
const EFFECTS = [
  { id: 'fadeIn', n: 'Muncul dari Hitam', c: 'Dasar', g: `vec4 fx(vec2 uv){ vec4 c=T(uv); float k=smoothstep(0.,max(.2,u_dur*.5),u_time); c.rgb*=mix(1.,k,u_int); return c; }` },
  { id: 'fadeOut', n: 'Pudar ke Hitam', c: 'Dasar', g: `vec4 fx(vec2 uv){ vec4 c=T(uv); float k=smoothstep(0.,max(.2,u_dur*.5),u_dur-u_time); c.rgb*=mix(1.,k,u_int); return c; }` },
  { id: 'fadeWhite', n: 'Pudar ke Putih', c: 'Dasar', g: `vec4 fx(vec2 uv){ vec4 c=T(uv); float k=1.-smoothstep(0.,max(.2,u_dur*.5),u_dur-u_time); c.rgb=mix(c.rgb,vec3(c.a),k*u_int); return c; }` },
  { id: 'blur', n: 'Buram', c: 'Dasar', g: `vec4 fx(vec2 uv){ float r=u_int*u_res.y*0.011; vec4 s=vec4(0.); float tot=0.; for(int i=-4;i<=4;i++){ for(int j=-4;j<=4;j++){ vec2 o=vec2(float(i),float(j)); float w=exp(-dot(o,o)/10.); s+=T(uv+o*r/u_res)*w; tot+=w; } } return s/tot; }` },
  { id: 'vignette', n: 'Vinyet', c: 'Dasar', g: `vec4 fx(vec2 uv){ vec4 c=T(uv); vec2 p=(uv-.5)*vec2(ASP(),1.); float d=length(p)/length(vec2(ASP(),1.)*.5); c.rgb*=1.-u_int*smoothstep(.35,1.05,d); return c; }` },
  { id: 'invert', n: 'Negatif', c: 'Dasar', g: `vec4 fx(vec2 uv){ vec4 c=T(uv); c.rgb=mix(c.rgb,vec3(c.a)-c.rgb,u_int); return c; }` },
  { id: 'zoomPunch', n: 'Zoom Hentak', c: 'Kamera', g: `vec4 fx(vec2 uv){ float z=1.+.28*u_int*exp(-u_time*u_speed*5.); return T((uv-.5)/z+.5); }` },
  { id: 'pulse', n: 'Detak Zoom', c: 'Kamera', g: `vec4 fx(vec2 uv){ float b=fract(TT*1.2); float z=1.+.1*u_int*exp(-b*5.); return T((uv-.5)/z+.5); }` },
  { id: 'kenburns', n: 'Zoom Lambat', c: 'Kamera', g: `vec4 fx(vec2 uv){ float p=clamp(u_time/max(u_dur,.1),0.,1.); float z=1.+.22*u_int*p; return T((uv-.5)/z+.5); }` },
  { id: 'shake', n: 'Guncang', c: 'Kamera', g: `vec4 fx(vec2 uv){ float t=floor(TT*20.); vec2 o=(vec2(hash(vec2(t,1.)),hash(vec2(t,7.)))-.5)*.035*u_int; float z=1.+.05*u_int; return T((uv-.5)/z+.5+o); }` },
  { id: 'quake', n: 'Gempa', c: 'Kamera', g: `vec4 fx(vec2 uv){ float t=floor(TT*30.); vec2 o=(vec2(hash(vec2(t,3.)),hash(vec2(t,5.)))-.5)*.07*u_int; float a=(hash(vec2(t,9.))-.5)*.06*u_int; vec2 p=(uv-.5)*vec2(ASP(),1.); p=mat2(cos(a),-sin(a),sin(a),cos(a))*p; p.x/=ASP(); float z=1.+.12*u_int; vec2 u=p/z+.5+o; vec4 c=T(u); c.r=T(u+vec2(.006*u_int,0.)).r; return c; }` },
  { id: 'sway', n: 'Goyang', c: 'Kamera', g: `vec4 fx(vec2 uv){ float a=sin(TT*2.)*.04*u_int; vec2 p=(uv-.5)*vec2(ASP(),1.); p=mat2(cos(a),-sin(a),sin(a),cos(a))*p; p.x/=ASP(); float z=1.+.08*u_int; return T(p/z+.5); }` },
  { id: 'spin', n: 'Putar', c: 'Kamera', g: `vec4 fx(vec2 uv){ float a=TT*.9*u_int; vec2 p=(uv-.5)*vec2(ASP(),1.); p=mat2(cos(a),-sin(a),sin(a),cos(a))*p; p.x/=ASP(); float z=1.+.6*u_int; return T(p/z+.5); }` },
  { id: 'zoomblur', n: 'Buram Zoom', c: 'Kamera', g: `vec4 fx(vec2 uv){ vec2 d=uv-.5; vec4 s=vec4(0.); for(int i=0;i<20;i++){ float k=1.-float(i)/19.*.18*u_int; s+=T(.5+d*k); } return s/20.; }` },
  { id: 'motionblur', n: 'Buram Gerak', c: 'Kamera', g: `vec4 fx(vec2 uv){ vec4 s=vec4(0.); for(int i=0;i<16;i++){ float o=(float(i)/15.-.5)*.045*u_int; s+=T(uv+vec2(o,0.)); } return s/16.; }` },
  { id: 'rgbsplit', n: 'RGB Terpisah', c: 'Distorsi', g: `vec4 fx(vec2 uv){ float a=.012*u_int*(.65+.35*sin(TT*3.)); vec4 c=T(uv); vec4 r=T(uv+vec2(a,0.)); vec4 b=T(uv-vec2(a,0.)); return vec4(r.r,c.g,b.b,max(c.a,max(r.a,b.a))); }` },
  { id: 'glitch', n: 'Glitch', c: 'Distorsi', g: `vec4 fx(vec2 uv){ float t=floor(TT*12.); float band=floor(uv.y*24.); vec2 u=uv; if(hash(vec2(band,t))>1.-.3*u_int) u.x+=(hash(vec2(band,t+1.))-.5)*.18*u_int; float a=.012*u_int*step(.4,hash(vec2(t,9.))); vec4 c=T(u); c.r=T(u+vec2(a,0.)).r; c.b=T(u-vec2(a,0.)).b; if(hash(vec2(t,band*1.7))>.985-.02*u_int) c.rgb=vec3(c.a)-c.rgb; return c; }` },
  { id: 'wave', n: 'Gelombang', c: 'Distorsi', g: `vec4 fx(vec2 uv){ vec2 u=uv; u.x+=sin(uv.y*18.+TT*4.)*.012*u_int; u.y+=cos(uv.x*14.+TT*3.)*.01*u_int; return T(u); }` },
  { id: 'ripple', n: 'Riak Air', c: 'Distorsi', g: `vec4 fx(vec2 uv){ vec2 p=(uv-.5)*vec2(ASP(),1.); float r=length(p); float w=sin(r*40.-TT*6.)*.008*u_int; vec2 d=r>.0001?p/r:vec2(0.); p+=d*w; p.x/=ASP(); return T(p+.5); }` },
  { id: 'fisheye', n: 'Mata Ikan', c: 'Distorsi', g: `vec4 fx(vec2 uv){ vec2 p=(uv-.5)*vec2(ASP(),1.); float k=.9*u_int; p=p/(1.+k*.25)*(1.+k*dot(p,p)); p.x/=ASP(); vec2 u=p+.5; if(u.x<0.||u.y<0.||u.x>1.||u.y>1.) return vec4(0.,0.,0.,1.); return T(u); }` },
  { id: 'pixelate', n: 'Mosaik', c: 'Distorsi', g: `vec4 fx(vec2 uv){ float n=max(1.,u_res.y*.05*u_int); vec2 px=vec2(n)/u_res; return T((floor(uv/px)+.5)*px); }` },
  { id: 'mirror', n: 'Cermin', c: 'Distorsi', g: `vec4 fx(vec2 uv){ vec2 u=uv; if(u.x>.5) u.x=1.-u.x; return mix(T(uv),T(u),u_int); }` },
  { id: 'mirrorV', n: 'Cermin Vertikal', c: 'Distorsi', g: `vec4 fx(vec2 uv){ vec2 u=uv; if(u.y<.5) u.y=1.-u.y; return mix(T(uv),T(u),u_int); }` },
  { id: 'kaleido', n: 'Kaleidoskop', c: 'Distorsi', g: `vec4 fx(vec2 uv){ vec2 p=(uv-.5)*vec2(ASP(),1.); float a=atan(p.y,p.x)+TT*.3; float r=length(p); float s=6.2831853/6.; a=mod(a,s); a=abs(a-s*.5); vec2 q=vec2(cos(a),sin(a))*r; q.x/=ASP(); return mix(T(uv),T(q+.5),u_int); }` },
  { id: 'split2', n: 'Layar 2', c: 'Bingkai', g: `vec4 fx(vec2 uv){ return T(vec2(.25+fract(uv.x*2.)*.5,uv.y)); }` },
  { id: 'split3', n: 'Layar 3', c: 'Bingkai', g: `vec4 fx(vec2 uv){ return T(vec2(1./3.+fract(uv.x*3.)/3.,uv.y)); }` },
  { id: 'split4', n: 'Grid 4', c: 'Bingkai', g: `vec4 fx(vec2 uv){ return T(fract(uv*2.)); }` },
  { id: 'split9', n: 'Grid 9', c: 'Bingkai', g: `vec4 fx(vec2 uv){ return T(fract(uv*3.)); }` },
  { id: 'letterbox', n: 'Bar Sinematik', c: 'Bingkai', g: `vec4 fx(vec2 uv){ float b=.12*u_int*smoothstep(0.,.6,u_time); if(uv.y<b||uv.y>1.-b) return vec4(0.,0.,0.,1.); return T(uv); }` },
  { id: 'irisOpen', n: 'Buka Lingkaran', c: 'Bingkai', g: `vec4 fx(vec2 uv){ vec2 p=(uv-.5)*vec2(ASP(),1.); float r=smoothstep(0.,max(.3,u_dur*.6),u_time*u_speed)*length(vec2(ASP(),1.))*.55; float m=smoothstep(r,r-.01,length(p)); return mix(T(uv),T(uv)*m+vec4(0.,0.,0.,1.)*(1.-m),u_int); }` },
  { id: 'irisClose', n: 'Tutup Lingkaran', c: 'Bingkai', g: `vec4 fx(vec2 uv){ vec2 p=(uv-.5)*vec2(ASP(),1.); float r=smoothstep(0.,max(.3,u_dur*.6),(u_dur-u_time)*u_speed)*length(vec2(ASP(),1.))*.55; float m=smoothstep(r,r-.01,length(p)); return mix(T(uv),T(uv)*m+vec4(0.,0.,0.,1.)*(1.-m),u_int); }` },
  { id: 'border', n: 'Bingkai Putih', c: 'Bingkai', g: `vec4 fx(vec2 uv){ float m=.05*u_int; vec2 s=vec2(m*u_res.y/u_res.x,m); vec2 p=(uv-s)/(1.-2.*s); if(p.x<0.||p.y<0.||p.x>1.||p.y>1.) return vec4(1.); return T(p); }` },
  { id: 'crt', n: 'TV Tabung', c: 'Retro', g: `vec4 fx(vec2 uv){ vec2 p=uv-.5; p*=1.+dot(p,p)*.25*u_int; vec2 u=p+.5; if(u.x<0.||u.y<0.||u.x>1.||u.y>1.) return vec4(0.,0.,0.,1.); vec4 c=T(u); c.r=T(u+vec2(.0025,0.)).r; c.b=T(u-vec2(.0025,0.)).b; float sl=.82+.18*sin(u.y*u_res.y*2.); c.rgb*=mix(1.,sl,u_int); c.rgb*=1.-u_int*.5*smoothstep(.3,.75,length(p)); return c; }` },
  { id: 'vhs', n: 'VHS', c: 'Retro', g: `vec4 fx(vec2 uv){ float t=TT; vec2 u=uv; u.x+=(noise(vec2(uv.y*90.,t*9.))-.5)*.006*u_int; float tr=fract(t*.13); float band=smoothstep(.03,0.,abs(uv.y-(1.-tr))); u.x+=band*.025*u_int; vec4 c=T(u); c.r=T(u+vec2(.004*u_int,0.)).r; c.b=T(u-vec2(.004*u_int,0.)).b; float sl=.9+.1*sin(uv.y*u_res.y*1.6); c.rgb*=mix(1.,sl,u_int); c.rgb+=(hash(uv*u_res+t*60.)-.5)*.14*u_int*c.a; c.rgb=mix(c.rgb,c.rgb*vec3(1.06,.95,1.1),u_int); c.rgb+=band*.15*u_int*c.a; return c; }` },
  { id: 'oldfilm', n: 'Film Lama', c: 'Retro', g: `vec4 fx(vec2 uv){ float t=TT; vec2 u=uv+vec2(0.,(hash(vec2(floor(t*12.),2.))-.5)*.004); vec4 c=T(u); float l=L(c.rgb); c.rgb=mix(c.rgb,vec3(l)*vec3(1.07,.86,.66),u_int); float fl=.92+.08*hash(vec2(floor(t*24.),5.)); c.rgb*=mix(1.,fl,u_int); float sx=hash(vec2(floor(t*8.),11.)); float sc=smoothstep(.0015,0.,abs(uv.x-sx))*step(.6,hash(vec2(floor(t*8.),13.))); c.rgb=mix(c.rgb,vec3(.9)*c.a,sc*.6*u_int); c.rgb+=(hash(uv*u_res+t)-.5)*.15*u_int*c.a; float v=smoothstep(.85,.3,distance(uv,vec2(.5))); c.rgb*=mix(1.,v,u_int); return c; }` },
  { id: 'grain', n: 'Butiran Film', c: 'Retro', g: `vec4 fx(vec2 uv){ vec4 c=T(uv); float g=hash(uv*u_res+fract(TT*24.)*100.)-.5; c.rgb+=g*.25*u_int*c.a; return c; }` },
  { id: 'bwflash', n: 'Kedip Hitam Putih', c: 'Retro', g: `vec4 fx(vec2 uv){ vec4 c=T(uv); float on=step(.5,fract(TT*2.)); c.rgb=mix(c.rgb,vec3(L(c.rgb)),on*u_int); return c; }` },
  { id: 'posterize', n: 'Posterisasi', c: 'Gaya', g: `vec4 fx(vec2 uv){ vec4 c=T(uv); float n=mix(24.,3.,u_int); vec3 q=floor(c.rgb/max(c.a,.001)*n+.5)/n; c.rgb=q*c.a; return c; }` },
  { id: 'halftone', n: 'Titik Komik', c: 'Gaya', g: `vec4 fx(vec2 uv){ float n=mix(220.,60.,u_int); vec2 p=uv*vec2(ASP(),1.)*n; vec2 cell=floor(p)+.5; vec4 c=T(cell/(vec2(ASP(),1.)*n)); float l=L(c.rgb/max(c.a,.001)); float r=sqrt(1.-l)*.62; float m=smoothstep(r+.08,r-.08,length(p-cell)); vec4 o=T(uv); return vec4(mix(o.rgb,vec3(1.-m)*o.a,u_int),o.a); }` },
  { id: 'sketch', n: 'Sketsa', c: 'Gaya', g: FX_LT + `vec4 fx(vec2 uv){ vec2 e=1.2/u_res; float gx=-Lt(uv+vec2(-e.x,e.y))-2.*Lt(uv+vec2(-e.x,0.))-Lt(uv-e)+Lt(uv+e)+2.*Lt(uv+vec2(e.x,0.))+Lt(uv+vec2(e.x,-e.y)); float gy=-Lt(uv-e)-2.*Lt(uv+vec2(0.,-e.y))-Lt(uv+vec2(e.x,-e.y))+Lt(uv+vec2(-e.x,e.y))+2.*Lt(uv+vec2(0.,e.y))+Lt(uv+e); float g=clamp(length(vec2(gx,gy))*2.5,0.,1.); vec4 c=T(uv); return vec4(mix(c.rgb,vec3(1.-g)*c.a,u_int),c.a); }` },
  { id: 'neon', n: 'Garis Neon', c: 'Gaya', g: FX_LT + `vec4 fx(vec2 uv){ vec2 e=1.5/u_res; float g=abs(Lt(uv+vec2(e.x,0.))-Lt(uv-vec2(e.x,0.)))+abs(Lt(uv+vec2(0.,e.y))-Lt(uv-vec2(0.,e.y))); g=clamp(g*4.,0.,1.); vec3 col=.5+.5*cos(6.2831*(TT*.2+uv.x*.5+vec3(0.,.33,.67))); vec4 c=T(uv); vec3 o=c.rgb*.25+col*g*1.5*c.a; return vec4(mix(c.rgb,o,u_int),c.a); }` },
  { id: 'thermal', n: 'Termal', c: 'Gaya', g: `vec4 fx(vec2 uv){ vec4 c=T(uv); float l=L(c.rgb/max(c.a,.001)); vec3 a=vec3(0.,0.,.4),b=vec3(.6,0.,.7),d=vec3(1.,.2,0.),e=vec3(1.,.9,0.); vec3 t=l<.33?mix(a,b,l/.33):l<.66?mix(b,d,(l-.33)/.33):mix(d,e,(l-.66)/.34); return vec4(mix(c.rgb,t*c.a,u_int),c.a); }` },
  { id: 'duotone', n: 'Duotone', c: 'Gaya', g: `vec4 fx(vec2 uv){ vec4 c=T(uv); float l=L(c.rgb/max(c.a,.001)); vec3 t=mix(vec3(.22,.05,.45),vec3(1.,.72,.25),l); return vec4(mix(c.rgb,t*c.a,u_int),c.a); }` },
  { id: 'disco', n: 'Disko', c: 'Gaya', g: `vec4 fx(vec2 uv){ vec4 c=T(uv); float a=TT*3.; vec3 k=vec3(.57735); float cs=cos(a),sn=sin(a); vec3 r=c.rgb*cs+cross(k,c.rgb)*sn+k*dot(k,c.rgb)*(1.-cs); return vec4(mix(c.rgb,r,u_int),c.a); }` },
  { id: 'ghost', n: 'Bayangan Ganda', c: 'Gaya', g: `vec4 fx(vec2 uv){ vec2 o=vec2(sin(TT*2.),cos(TT*1.6))*.02*u_int; vec4 a=T(uv),b=T(uv+o); return mix(a,max(a,b),.6*u_int); }` },
  { id: 'dreamy', n: 'Mimpi', c: 'Cahaya', g: `vec4 fx(vec2 uv){ vec4 c=T(uv); vec4 s=vec4(0.); float r=u_res.y*.01; for(int i=0;i<12;i++){ float a=float(i)*.5236; s+=T(uv+vec2(cos(a),sin(a))*r/u_res*2.); } s/=12.; vec3 o=1.-(1.-c.rgb)*(1.-s.rgb*.7); o=mix(o,o*vec3(1.05,.98,1.08),.5); return vec4(mix(c.rgb,o,u_int),c.a); }` },
  { id: 'glow', n: 'Cahaya Pendar', c: 'Cahaya', g: `vec4 fx(vec2 uv){ vec4 c=T(uv); vec3 b=vec3(0.); float r=u_res.y*.012; for(int i=0;i<16;i++){ float a=float(i)*.3927; for(int k=1;k<=3;k++){ vec2 o=vec2(cos(a),sin(a))*r*float(k)/u_res; b+=max(T(uv+o).rgb-vec3(.6),0.); } } b/=48.; c.rgb+=b*3.*u_int; return c; }` },
  { id: 'flash', n: 'Kilat', c: 'Cahaya', g: `vec4 fx(vec2 uv){ vec4 c=T(uv); float b=fract(TT*1.5); float f=exp(-b*7.); c.rgb=mix(c.rgb,vec3(c.a),f*u_int); return c; }` },
  { id: 'lightleak', n: 'Bocoran Cahaya', c: 'Cahaya', g: `vec4 fx(vec2 uv){ vec4 c=T(uv); float t=TT*.3; vec2 p1=vec2(.2+.3*sin(t),.8+.2*cos(t*1.3)); vec2 p2=vec2(.9+.2*sin(t*.7+2.),.2+.3*cos(t)); vec3 l=vec3(1.,.45,.15)*smoothstep(.75,0.,distance(uv,p1))+vec3(1.,.2,.5)*smoothstep(.6,0.,distance(uv,p2)); c.rgb=vec3(c.a)-(vec3(c.a)-c.rgb)*(1.-l*.8*u_int); return c; }` },
  { id: 'sunray', n: 'Sinar Matahari', c: 'Cahaya', g: `vec4 fx(vec2 uv){ vec4 c=T(uv); vec2 s=vec2(.85,.95); vec2 d=uv-s; float a=atan(d.y,d.x); float ray=pow(.5+.5*sin(a*14.+TT*.6),6.)*smoothstep(1.3,0.,length(d)); vec3 l=vec3(1.,.85,.55)*(ray*.5+smoothstep(.5,0.,length(d))*.6); c.rgb=vec3(c.a)-(vec3(c.a)-c.rgb)*(1.-l*u_int); return c; }` },
  { id: 'sparkle', n: 'Kilau', c: 'Partikel', g: `vec4 fx(vec2 uv){ vec4 c=T(uv); float s=0.; for(int l=0;l<2;l++){ float fl=float(l); vec2 p=uv*vec2(ASP(),1.)*(10.+fl*7.); vec2 id=floor(p); vec2 f=fract(p)-.5; vec2 o=(vec2(hash(id+fl),hash(id+5.+fl))-.5)*.6; float tw=.5+.5*sin(TT*3.+hash(id+2.)*6.28); vec2 q=f-o; float d=length(q); float st=(.0025/(d*d+.0025))*step(.72,hash(id+11.+fl)); st+=(.0008/(abs(q.x*q.y)+.0008))*smoothstep(.25,0.,d)*step(.72,hash(id+11.+fl))*.5; s+=st*tw; } c.rgb+=vec3(1.,.95,.8)*clamp(s,0.,2.)*.5*u_int*c.a; return c; }` },
  { id: 'bokeh', n: 'Bokeh', c: 'Partikel', g: `vec4 fx(vec2 uv){ vec4 c=T(uv); vec3 acc=vec3(0.); for(int i=0;i<3;i++){ float fi=float(i); vec2 p=uv*vec2(ASP(),1.)*(4.+fi*2.); p.y-=TT*(.1+fi*.05); vec2 id=floor(p); vec2 f=fract(p)-.5; vec2 o=(vec2(hash(id+fi*3.),hash(id+fi*7.+1.))-.5)*.5; float r=.18+.15*hash(id+9.); float m=smoothstep(r,r-.06,length(f-o))*step(.55,hash(id+fi*13.)); vec3 col=.6+.4*cos(6.28*(hash(id)+vec3(0.,.33,.67))); acc+=col*m*.35; } c.rgb=vec3(c.a)-(vec3(c.a)-c.rgb)*(1.-acc*u_int); return c; }` },
  { id: 'snow', n: 'Salju Turun', c: 'Partikel', g: `vec4 fx(vec2 uv){ vec4 c=T(uv); float t=TT; float s=0.; for(int i=0;i<3;i++){ float fi=float(i); float sc=8.+fi*6.; vec2 p=vec2(uv.x*ASP(),uv.y)*sc; p.y+=t*(.6+fi*.3); p.x+=sin(t*.7+p.y*.5+fi)*.3; vec2 id=floor(p); vec2 f=fract(p)-.5; vec2 o=vec2(hash(id+fi)-.5,hash(id+fi*7.)-.5)*.6; float r=.05+.05*hash(id+2.); s+=smoothstep(r,r*.3,length(f-o))*step(.5,hash(id+9.+fi)); } c.rgb=mix(c.rgb,vec3(c.a),clamp(s,0.,1.)*u_int); return c; }` },
  { id: 'rain', n: 'Hujan', c: 'Partikel', g: `vec4 fx(vec2 uv){ vec4 c=T(uv); vec2 p=uv*vec2(ASP(),1.)*vec2(60.,4.); p.y+=TT*6.; p.x+=p.y*.08; vec2 id=floor(p); vec2 f=fract(p); float r=hash(id); float d=smoothstep(.04,0.,abs(f.x-r))*smoothstep(0.,.3,f.y)*smoothstep(1.,.6,f.y)*step(.7,hash(id+3.1)); c.rgb*=mix(1.,.85,u_int); c.rgb=mix(c.rgb,vec3(.85,.9,1.)*c.a,d*.6*u_int); return c; }` },
  { id: 'confetti', n: 'Konfeti', c: 'Partikel', g: `vec4 fx(vec2 uv){ vec4 c=T(uv); vec3 acc=vec3(0.); float m=0.; for(int i=0;i<3;i++){ float fi=float(i); vec2 p=uv*vec2(ASP(),1.)*(9.+fi*5.); p.y+=TT*(1.2+fi*.4); vec2 id=floor(p); vec2 f=fract(p)-.5; float a=TT*3.*(hash(id)-.5)*4.; f=mat2(cos(a),-sin(a),sin(a),cos(a))*f; vec2 o=(vec2(hash(id+fi),hash(id+3.+fi))-.5)*.5; vec2 q=abs(f-o); float k=step(q.x,.09)*step(q.y,.04)*step(.6,hash(id+7.+fi)); vec3 col=.55+.45*cos(6.28*(hash(id+1.)+vec3(0.,.33,.67))); acc+=col*k; m+=k; } c.rgb=mix(c.rgb,clamp(acc,0.,1.)*c.a,clamp(m,0.,1.)*u_int); return c; }` },
  { id: 'retouch', n: 'Haluskan Kulit', c: 'Pro', g: `float skin(vec3 c){ float y=dot(c,vec3(.299,.587,.114)); float cb=(c.b-y)*.564+.5; float cr=(c.r-y)*.713+.5; return smoothstep(.26,.31,cb)*(1.-smoothstep(.49,.54,cb))*smoothstep(.51,.55,cr)*(1.-smoothstep(.67,.72,cr)); } vec4 fx(vec2 uv){ vec4 c=T(uv); if(c.a<.01) return c; vec3 base=c.rgb/c.a; vec3 acc=base; float tw=1.; float r=u_res.y*.006; for(int i=0;i<12;i++){ float a=float(i)*.5236; for(int k=1;k<=2;k++){ vec2 o=vec2(cos(a),sin(a))*r*float(k)/u_res; vec4 s=T(uv+o); vec3 sc=s.rgb/max(s.a,.001); vec3 d=sc-base; float w=exp(-dot(d,d)*60.); acc+=sc*w; tw+=w; } } vec3 sm=acc/tw; float m=skin(base)*u_int; vec3 o=mix(base,sm,m); o+=m*.05; return vec4(clamp(o,0.,1.)*c.a,c.a); }` },
  { id: 'oilpaint', n: 'Lukisan Minyak', c: 'Pro', g: `vec4 fx(vec2 uv){ vec2 px=1./u_res*(1.+2.*u_int); vec3 m[4]; vec3 s[4]; for(int k=0;k<4;k++){ m[k]=vec3(0.); s[k]=vec3(0.); } for(int j=-3;j<=0;j++){ for(int i=-3;i<=0;i++){ vec3 c0=T(uv+vec2(float(i),float(j))*px).rgb; m[0]+=c0; s[0]+=c0*c0; vec3 c1=T(uv+vec2(float(i+3),float(j))*px).rgb; m[1]+=c1; s[1]+=c1*c1; vec3 c2=T(uv+vec2(float(i+3),float(j+3))*px).rgb; m[2]+=c2; s[2]+=c2*c2; vec3 c3=T(uv+vec2(float(i),float(j+3))*px).rgb; m[3]+=c3; s[3]+=c3*c3; } } float best=1e9; vec3 res=vec3(0.); for(int k=0;k<4;k++){ vec3 mm=m[k]/16.; vec3 v=abs(s[k]/16.-mm*mm); float sg=v.r+v.g+v.b; if(sg<best){ best=sg; res=mm; } } return vec4(res,T(uv).a); }` },
  { id: 'cartoon', n: 'Kartun', c: 'Pro', g: FX_LT + `vec4 fx(vec2 uv){ vec4 c=T(uv); vec2 e=1.2/u_res; float g=abs(Lt(uv+vec2(e.x,0.))-Lt(uv-vec2(e.x,0.)))+abs(Lt(uv+vec2(0.,e.y))-Lt(uv-vec2(0.,e.y))); float edge=smoothstep(.08,.22,g); vec3 q=floor(c.rgb/max(c.a,.001)*5.+.5)/5.; vec3 o=q*(1.-edge*.9)*c.a; return vec4(mix(c.rgb,o,u_int),c.a); }` },
  { id: 'hologram', n: 'Hologram', c: 'Pro', g: `vec4 fx(vec2 uv){ float t=TT; vec2 u=uv; u.x+=(hash(vec2(floor(uv.y*60.),floor(t*10.)))-.5)*.01*u_int; vec4 c=T(u); float l=L(c.rgb/max(c.a,.001)); vec3 h=vec3(.2,.9,1.)*l*1.3; h*=.75+.25*sin(uv.y*u_res.y*.8-t*20.); h+=vec3(.1,.4,.5)*step(.98,hash(vec2(floor(t*12.),3.)))*.6; vec4 o=vec4(h*c.a,c.a); o.r=T(u+vec2(.005,0.)).a*.3*l; return mix(c,o,u_int); }` },
  { id: 'lensflare', n: 'Suar Lensa', c: 'Pro', g: `vec4 fx(vec2 uv){ vec4 c=T(uv); vec2 p=(uv-.5)*vec2(ASP(),1.); vec2 s=vec2(.55*sin(TT*.3)*ASP()*.6,.3+.08*cos(TT*.4)); vec2 d=p-s; float core=.012/(dot(d,d)+.012); float streak=.004/(abs(d.y)+.004)*smoothstep(1.2,0.,abs(d.x)); vec3 f=vec3(1.,.9,.7)*core*.6+vec3(.6,.8,1.)*streak*.25; for(int i=1;i<5;i++){ float fi=float(i); vec2 g=-s*(fi*.45-.2); float r=.03+fi*.02; f+=vec3(.5+.2*fi,.6,1.-.15*fi)*smoothstep(r,r*.6,length(p-g))*.15; } c.rgb=vec3(c.a)-(vec3(c.a)-c.rgb)*(1.-clamp(f*u_int,0.,1.)); return c; }` },
  { id: 'chromazoom', n: 'Zoom Kromatik', c: 'Pro', g: `vec4 fx(vec2 uv){ float b=fract(TT*1.2); float k=exp(-b*5.)*u_int; vec2 d=uv-.5; vec4 r=T(.5+d/(1.+.06*k)); vec4 g=T(.5+d/(1.+.03*k)); vec4 bl=T(.5+d); return vec4(r.r,g.g,bl.b,max(bl.a,r.a)); }` },
  { id: 'prism', n: 'Prisma', c: 'Pro', g: `vec4 fx(vec2 uv){ vec4 c=T(uv); vec2 o=vec2(.015*u_int,0.); vec4 a=T(uv+o), b=T(uv-o), d=T(uv+o.yx*1.5); vec3 p=vec3(a.r,d.g,b.b); return vec4(mix(c.rgb,max(c.rgb,p),.8*u_int),max(c.a,a.a)); }` },
  { id: 'colorpop', n: 'Sorot Merah', c: 'Pro', g: `vec4 fx(vec2 uv){ vec4 c=T(uv); vec3 b=c.rgb/max(c.a,.001); float mx=max(b.r,max(b.g,b.b)), mn=min(b.r,min(b.g,b.b)); float sat=mx-mn; float red=step(b.g,b.r)*step(b.b,b.r)*smoothstep(.15,.3,sat)*smoothstep(.0,.15,b.r-max(b.g,b.b)); vec3 g=vec3(L(b)); vec3 o=mix(g,b,red); return vec4(mix(b,o,u_int)*c.a,c.a); }` },
  { id: 'pixel8', n: 'Retro 8-bit', c: 'Pro', g: `vec4 fx(vec2 uv){ float n=max(2.,u_res.y*.012*(.5+u_int)); vec2 px=vec2(n)/u_res; vec4 c=T((floor(uv/px)+.5)*px); vec3 b=c.rgb/max(c.a,.001); b=floor(b*3.+.5)/3.; return vec4(b*c.a,c.a); }` },
  { id: 'tiltshift', n: 'Miniatur', c: 'Pro', g: `vec4 fx(vec2 uv){ float m=smoothstep(.12,.38,abs(uv.y-.5))*u_int; vec4 s=vec4(0.); float tot=0.; for(int i=-4;i<=4;i++){ for(int j=-4;j<=4;j++){ vec2 o=vec2(float(i),float(j))*m*u_res.y*.004/u_res; float w=exp(-float(i*i+j*j)/10.); s+=T(uv+o)*w; tot+=w; } } vec4 c=s/tot; vec3 b=c.rgb; float l=L(b); b=mix(vec3(l),b,1.+.35*u_int); return vec4(b,c.a); }` },
  { id: 'lightsweep', n: 'Sapuan Cahaya', c: 'Pro', g: `vec4 fx(vec2 uv){ vec4 c=T(uv); float x=fract(TT*.45)*2.4-.7; float d=(uv.x+uv.y*.5)*.8-x; float band=exp(-d*d*120.); c.rgb+=vec3(1.,.97,.9)*band*.55*u_int*c.a; return c; }` },
  { id: 'filmburn', n: 'Film Terbakar', c: 'Pro', g: `vec4 fx(vec2 uv){ vec4 c=T(uv); float t=TT*.6; float n=noise(uv*3.+vec2(t,-t*.7))*.6+noise(uv*7.-t)*.4; float e=length((uv-.5)*vec2(1.2,1.)); float burn=smoothstep(.45,.95,e+n*.45-.15)*u_int; vec3 fire=mix(vec3(1.,.55,.1),vec3(1.,.95,.7),n); c.rgb=mix(c.rgb,fire*c.a,burn*.85); return c; }` },
  { id: 'shatter', n: 'Kaca Pecah', c: 'Pro', g: `vec4 fx(vec2 uv){ vec2 p=uv*vec2(ASP(),1.)*5.; vec2 ip=floor(p); float md=9.; vec2 mid=vec2(0.); for(int j=-1;j<=1;j++){ for(int i=-1;i<=1;i++){ vec2 g=vec2(float(i),float(j)); vec2 o=vec2(hash(ip+g),hash(ip+g+7.)); float d=length(g+o-fract(p)); if(d<md){ md=d; mid=ip+g; } } } vec2 off=(vec2(hash(mid+3.),hash(mid+9.))-.5)*.03*u_int; vec4 c=T(uv+off); c.rgb*=1.-.15*u_int*hash(mid); return c; }` },
  { id: 'redpulse', n: 'Denyut Merah', c: 'Pro', g: `vec4 fx(vec2 uv){ vec4 c=T(uv); float b=fract(TT*1.1); float k=(exp(-b*6.)+exp(-abs(b-.25)*10.)*.6)*u_int; float v=smoothstep(.3,.9,length(uv-.5)); c.rgb=mix(c.rgb,vec3(.85,0.,.05)*c.a,v*k*.8); return c; }` },
];
const EFFECT_CATS = [...new Set(EFFECTS.map(e => e.c))];
const EFFECT_BY_ID = Object.fromEntries(EFFECTS.map(e => [e.id, e]));

/* ---------------- TRANSISI (shader) ----------------
   tersedia: A(uv), B(uv) (premultiplied), Ai/Bi (transparan di luar), P (0..1), ASP(), hash, L */
const TRANSITIONS = [
  { id: 'fade', n: 'Larut', c: 'Dasar', g: `vec4 tr(vec2 uv){ return mix(A(uv),B(uv),P); }` },
  { id: 'dipBlack', n: 'Celup Hitam', c: 'Dasar', g: `vec4 tr(vec2 uv){ vec4 k=vec4(0.,0.,0.,1.); return P<.5?mix(A(uv),k,P*2.):mix(k,B(uv),(P-.5)*2.); }` },
  { id: 'dipWhite', n: 'Celup Putih', c: 'Dasar', g: `vec4 tr(vec2 uv){ vec4 k=vec4(1.); return P<.5?mix(A(uv),k,P*2.):mix(k,B(uv),(P-.5)*2.); }` },
  { id: 'flash', n: 'Kilat Putih', c: 'Dasar', g: `vec4 tr(vec2 uv){ float f=1.-abs(P-.5)*2.; vec4 c=P<.5?A(uv):B(uv); return mix(c,vec4(1.),pow(f,2.)); }` },
  { id: 'burn', n: 'Luma', c: 'Dasar', g: `vec4 tr(vec2 uv){ float l=L(A(uv).rgb); return mix(A(uv),B(uv),smoothstep(l-.1,l+.1,P*1.2-.1)); }` },
  { id: 'pushL', n: 'Dorong Kiri', c: 'Geser', g: `vec4 tr(vec2 uv){ float p=P*P*(3.-2.*P); if(uv.x<1.-p) return A(uv+vec2(p,0.)); return B(uv-vec2(1.-p,0.)); }` },
  { id: 'pushR', n: 'Dorong Kanan', c: 'Geser', g: `vec4 tr(vec2 uv){ float p=P*P*(3.-2.*P); if(uv.x>p) return A(uv-vec2(p,0.)); return B(uv+vec2(1.-p,0.)); }` },
  { id: 'pushU', n: 'Dorong Atas', c: 'Geser', g: `vec4 tr(vec2 uv){ float p=P*P*(3.-2.*P); if(uv.y>p) return A(uv-vec2(0.,p)); return B(uv+vec2(0.,1.-p)); }` },
  { id: 'pushD', n: 'Dorong Bawah', c: 'Geser', g: `vec4 tr(vec2 uv){ float p=P*P*(3.-2.*P); if(uv.y<1.-p) return A(uv+vec2(0.,p)); return B(uv-vec2(0.,1.-p)); }` },
  { id: 'slideL', n: 'Tutup Kiri', c: 'Geser', g: `vec4 tr(vec2 uv){ float p=1.-pow(1.-P,3.); if(uv.x>1.-p) return B(uv-vec2(1.-p,0.)); return A(uv); }` },
  { id: 'slideR', n: 'Tutup Kanan', c: 'Geser', g: `vec4 tr(vec2 uv){ float p=1.-pow(1.-P,3.); if(uv.x<p) return B(uv+vec2(1.-p,0.)); return A(uv); }` },
  { id: 'slideU', n: 'Tutup Atas', c: 'Geser', g: `vec4 tr(vec2 uv){ float p=1.-pow(1.-P,3.); if(uv.y<p) return B(uv+vec2(0.,1.-p)); return A(uv); }` },
  { id: 'wipeR', n: 'Sapu Kanan', c: 'Sapu', g: `vec4 tr(vec2 uv){ float e=.04; float m=smoothstep(P*(1.+e)-e,P*(1.+e),uv.x); return mix(B(uv),A(uv),m); }` },
  { id: 'wipeL', n: 'Sapu Kiri', c: 'Sapu', g: `vec4 tr(vec2 uv){ float e=.04; float m=smoothstep(P*(1.+e)-e,P*(1.+e),1.-uv.x); return mix(B(uv),A(uv),m); }` },
  { id: 'wipeU', n: 'Sapu Atas', c: 'Sapu', g: `vec4 tr(vec2 uv){ float e=.04; float m=smoothstep(P*(1.+e)-e,P*(1.+e),uv.y); return mix(B(uv),A(uv),m); }` },
  { id: 'wipeD', n: 'Sapu Bawah', c: 'Sapu', g: `vec4 tr(vec2 uv){ float e=.04; float m=smoothstep(P*(1.+e)-e,P*(1.+e),1.-uv.y); return mix(B(uv),A(uv),m); }` },
  { id: 'diag', n: 'Diagonal', c: 'Sapu', g: `vec4 tr(vec2 uv){ float d=(uv.x+1.-uv.y)*.5; float m=smoothstep(P*1.2-.1,P*1.2,d); return mix(B(uv),A(uv),m); }` },
  { id: 'blinds', n: 'Tirai', c: 'Sapu', g: `vec4 tr(vec2 uv){ float s=fract(uv.x*10.); return s<P?B(uv):A(uv); }` },
  { id: 'doors', n: 'Buka Pintu', c: 'Sapu', g: `vec4 tr(vec2 uv){ float p=P*P*(3.-2.*P); float d=abs(uv.x-.5); if(d<p*.5) return B(uv); vec2 u=uv; u.x=uv.x<.5?uv.x+p*.5:uv.x-p*.5; return A(u); }` },
  { id: 'clock', n: 'Jarum Jam', c: 'Sapu', g: `vec4 tr(vec2 uv){ vec2 q=(uv-.5)*vec2(ASP(),1.); float a=fract(atan(q.x,q.y)/6.2831853+1.); return mix(A(uv),B(uv),smoothstep(a-.01,a+.01,P)); }` },
  { id: 'circleOpen', n: 'Lingkaran Buka', c: 'Bentuk', g: `vec4 tr(vec2 uv){ vec2 q=(uv-.5)*vec2(ASP(),1.); float r=P*length(vec2(ASP(),1.))*.52; return mix(A(uv),B(uv),smoothstep(r,r-.015,length(q))); }` },
  { id: 'circleClose', n: 'Lingkaran Tutup', c: 'Bentuk', g: `vec4 tr(vec2 uv){ vec2 q=(uv-.5)*vec2(ASP(),1.); float r=(1.-P)*length(vec2(ASP(),1.))*.52; return mix(B(uv),A(uv),smoothstep(r,r-.015,length(q))); }` },
  { id: 'diamond', n: 'Berlian', c: 'Bentuk', g: `vec4 tr(vec2 uv){ vec2 q=abs(uv-.5)*vec2(ASP(),1.); float d=q.x+q.y; float r=P*(ASP()+1.)*.52; return mix(A(uv),B(uv),smoothstep(r,r-.015,d)); }` },
  { id: 'heart', n: 'Hati', c: 'Bentuk', g: `float dot2(vec2 v){return dot(v,v);} float sdH(vec2 p){ p.x=abs(p.x); if(p.y+p.x>1.) return sqrt(dot2(p-vec2(.25,.75)))-sqrt(2.)/4.; return sqrt(min(dot2(p-vec2(0.,1.)),dot2(p-.5*max(p.x+p.y,0.))))*sign(p.x-p.y); } vec4 tr(vec2 uv){ vec2 q=(uv-.5)*vec2(ASP(),1.); float s=P*2.6+.001; vec2 p=q/s; p.y+=.5; float d=sdH(p)*s; return mix(A(uv),B(uv),smoothstep(.01,-.01,d)); }` },
  { id: 'mosaic', n: 'Kotak Acak', c: 'Bentuk', g: `vec4 tr(vec2 uv){ vec2 c=floor(uv*vec2(ASP(),1.)*8.); float r=hash(c); return mix(A(uv),B(uv),smoothstep(r-.1,r+.1,P*1.2-.1)); }` },
  { id: 'zoomIn', n: 'Zoom Masuk', c: 'Zoom', g: `vec4 tr(vec2 uv){ float e=P*P*(3.-2.*P); vec4 a=A((uv-.5)/(1.+e*1.5)+.5); vec4 b=Bi((uv-.5)/(.5+.5*e)+.5); return mix(a,b,smoothstep(.2,.8,e)); }` },
  { id: 'zoomOut', n: 'Zoom Keluar', c: 'Zoom', g: `vec4 tr(vec2 uv){ float e=P*P*(3.-2.*P); vec4 a=Ai((uv-.5)/(1.-e*.5)+.5); vec4 b=B((uv-.5)/(1.6-.6*e)+.5); return mix(a,b,smoothstep(.2,.8,e)); }` },
  { id: 'crosszoom', n: 'Zoom Silang', c: 'Zoom', g: `vec4 tr(vec2 uv){ float s=sin(P*3.14159); vec2 d=uv-.5; vec4 a=vec4(0.),b=vec4(0.); for(int i=0;i<16;i++){ float k=1.-float(i)/15.*.25*s; a+=A(.5+d*k); b+=B(.5+d*k); } return mix(a/16.,b/16.,smoothstep(.35,.65,P)); }` },
  { id: 'spin', n: 'Putar', c: 'Zoom', g: `vec4 tr(vec2 uv){ float e=P*P*(3.-2.*P); float a=e*6.2831; float z=1.+sin(P*3.14159)*1.2; vec2 p=(uv-.5)*vec2(ASP(),1.)*z; p=mat2(cos(a),-sin(a),sin(a),cos(a))*p; p.x/=ASP(); vec2 u=p+.5; return mix(Ai(u),Bi(u),smoothstep(.4,.6,P)); }` },
  { id: 'blur', n: 'Buram', c: 'Efek', g: `vec4 tr(vec2 uv){ float b=sin(P*3.14159)*u_res.y*.012; vec4 a=vec4(0.),c=vec4(0.); float tot=0.; for(int i=-3;i<=3;i++){ for(int j=-3;j<=3;j++){ vec2 o=vec2(float(i),float(j))*b/u_res; float w=exp(-float(i*i+j*j)/6.); a+=A(uv+o)*w; c+=B(uv+o)*w; tot+=w; } } return mix(a/tot,c/tot,smoothstep(.3,.7,P)); }` },
  { id: 'glitch', n: 'Glitch', c: 'Efek', g: `vec4 tr(vec2 uv){ float s=sin(P*3.14159); float t=floor(P*20.); float band=floor(uv.y*18.); vec2 u=uv; if(hash(vec2(band,t))>.6) u.x+=(hash(vec2(band,t+1.))-.5)*.25*s; vec4 a=P<.5?A(u):B(u); a.r=(P<.5?A(u+vec2(.02*s,0.)):B(u+vec2(.02*s,0.))).r; return a; }` },
  { id: 'pixel', n: 'Piksel', c: 'Efek', g: `vec4 tr(vec2 uv){ float n=1.+sin(P*3.14159)*u_res.y*.06; vec2 px=vec2(n)/u_res; vec2 q=(floor(uv/px)+.5)*px; return P<.5?A(q):B(q); }` },
  { id: 'swirl', n: 'Pusaran', c: 'Efek', g: `vec4 tr(vec2 uv){ vec2 q=(uv-.5)*vec2(ASP(),1.); float r=length(q); float s=sin(P*3.14159); float a=s*6.*(1.-smoothstep(0.,.8,r)); q=mat2(cos(a),-sin(a),sin(a),cos(a))*q; q.x/=ASP(); vec2 u=q+.5; return mix(A(u),B(u),smoothstep(.35,.65,P)); }` },
  { id: 'ripple', n: 'Riak', c: 'Efek', g: `vec4 tr(vec2 uv){ vec2 q=uv-.5; float r=length(q); float s=sin(P*3.14159); vec2 u=uv+(r>.0001?q/r:vec2(0.))*sin(r*50.-P*30.)*.02*s; return mix(A(u),B(u),smoothstep(.3,.7,P)); }` },
  { id: 'cube', n: 'Kubus', c: 'Efek', g: `vec4 tr(vec2 uv){ float p=P*P*(3.-2.*P); if(uv.x<1.-p){ float x=uv.x/(1.-p); vec4 c=Ai(vec2(x,(uv.y-.5)*(1.+p*.3*x)+.5)); c.rgb*=1.-p*.5; return c; } float x=(uv.x-(1.-p))/p; vec4 c=Bi(vec2(x,(uv.y-.5)*(1.+(1.-p)*.3*(1.-x))+.5)); c.rgb*=.5+p*.5; return c; }` },
  { id: 'shatterT', n: 'Kaca Pecah', c: 'Pro', g: `vec4 tr(vec2 uv){ vec2 p=uv*vec2(ASP(),1.)*6.; vec2 ip=floor(p); float md=9.; vec2 mid=vec2(0.); for(int j=-1;j<=1;j++){ for(int i=-1;i<=1;i++){ vec2 g=vec2(float(i),float(j)); vec2 o=vec2(hash(ip+g),hash(ip+g+7.)); float d=length(g+o-fract(p)); if(d<md){ md=d; mid=ip+g; } } } float h=hash(mid); float lp=clamp((P-h*.5)*2.,0.,1.); vec2 dir=normalize(vec2(hash(mid+1.),hash(mid+2.))-.5+.001); vec4 a=Ai(uv-dir*lp*lp*.6); return mix(B(uv),a,a.a*(1.-lp)); }` },
  { id: 'fold', n: 'Lipat', c: 'Pro', g: `vec4 tr(vec2 uv){ float p=P*P*(3.-2.*P); float w=1.-p; if(abs(uv.x-.5)<w*.5){ float x=(uv.x-.5)/max(w,.001)+.5; vec4 c=Ai(vec2(x,uv.y)); c.rgb*=1.-p*.6*abs(x-.5)*2.; return mix(B(uv),c,c.a); } return B(uv); }` },
  { id: 'waveT', n: 'Gelombang', c: 'Pro', g: `vec4 tr(vec2 uv){ float s=sin(P*3.14159); vec2 u=uv+vec2(sin(uv.y*25.+P*12.)*.04*s,0.); return mix(A(u),B(u),smoothstep(.35,.65,P)); }` },
  { id: 'twist', n: 'Pelintir', c: 'Pro', g: `vec4 tr(vec2 uv){ vec2 q=(uv-.5)*vec2(ASP(),1.); float r=length(q); float s=sin(P*3.14159); float a=s*3.*r*3.; q=mat2(cos(a),-sin(a),sin(a),cos(a))*q; q.x/=ASP(); vec2 u=q+.5; return mix(A(u),B(u),smoothstep(.4,.6,P)); }` },
  { id: 'ink', n: 'Tinta', c: 'Pro', g: `vec4 tr(vec2 uv){ float n=noise(uv*4.)*.5+noise(uv*9.)*.3+noise(uv*20.)*.2; float m=smoothstep(n-.08,n+.08,P*1.2-.1); return mix(A(uv),B(uv),m); }` },
  { id: 'rgbT', n: 'RGB Geser', c: 'Pro', g: `vec4 tr(vec2 uv){ float s=sin(P*3.14159); vec4 r=P<.5?A(uv+vec2(.06*s,0.)):B(uv+vec2(.06*s,0.)); vec4 g=P<.5?A(uv):B(uv); vec4 b=P<.5?A(uv-vec2(.06*s,0.)):B(uv-vec2(.06*s,0.)); return vec4(r.r,g.g,b.b,1.); }` },
  { id: 'slideBlur', n: 'Geser Buram', c: 'Pro', g: `vec4 tr(vec2 uv){ float p=P*P*(3.-2.*P); float s=sin(P*3.14159); vec4 acc=vec4(0.); for(int i=0;i<12;i++){ float o=(float(i)/11.-.5)*.08*s; vec2 u=uv+vec2(o,0.); acc+=(u.x<1.-p)?A(u+vec2(p,0.)):B(u-vec2(1.-p,0.)); } return acc/12.; }` },
  { id: 'lightT', n: 'Cahaya Hangat', c: 'Pro', g: `vec4 tr(vec2 uv){ float f=1.-abs(P-.5)*2.; vec4 c=mix(A(uv),B(uv),smoothstep(.4,.6,P)); vec3 l=mix(vec3(1.,.55,.2),vec3(1.,.9,.7),uv.x); c.rgb=1.-(1.-c.rgb)*(1.-l*pow(f,1.5)); return c; }` },
  { id: 'squeeze', n: 'Peras', c: 'Pro', g: `vec4 tr(vec2 uv){ float p=P*P*(3.-2.*P); if(uv.y>p){ float y=(uv.y-p)/max(1.-p,.001); return A(vec2(uv.x,y)); } float y=uv.y/max(p,.001); return B(vec2(uv.x,y)); }` },
];
const TRANS_CATS = [...new Set(TRANSITIONS.map(t => t.c))];
const TRANS_BY_ID = Object.fromEntries(TRANSITIONS.map(t => [t.id, t]));

/* ---------------- ANIMASI ----------------
   fungsi mengembalikan pengubah: x,y (fraksi kanvas), s (skala), sx, r (derajat), a (alpha), blur (0..1), chars (0..1 khusus teks) */
const ANIM_IN = [
  { id: 'fade', n: 'Muncul', css: 'a-fade', f: p => ({ a: p }) },
  { id: 'zoomIn', n: 'Zoom Masuk', css: 'a-zoom', f: p => ({ s: lerp(.4, 1, Ease.outCubic(p)), a: Math.min(1, p * 2) }) },
  { id: 'zoomOut', n: 'Zoom Keluar', css: 'a-zoom', f: p => ({ s: lerp(1.7, 1, Ease.outCubic(p)), a: Math.min(1, p * 2) }) },
  { id: 'slideL', n: 'Dari Kiri', css: 'a-slide', f: p => ({ x: -(1 - Ease.outCubic(p)) * .6, a: Math.min(1, p * 2) }) },
  { id: 'slideR', n: 'Dari Kanan', css: 'a-slide', f: p => ({ x: (1 - Ease.outCubic(p)) * .6, a: Math.min(1, p * 2) }) },
  { id: 'slideU', n: 'Dari Bawah', css: 'a-slide', f: p => ({ y: (1 - Ease.outCubic(p)) * .5, a: Math.min(1, p * 2) }) },
  { id: 'slideD', n: 'Dari Atas', css: 'a-slide', f: p => ({ y: -(1 - Ease.outCubic(p)) * .5, a: Math.min(1, p * 2) }) },
  { id: 'rotIn', n: 'Putar Masuk', css: 'a-rot', f: p => ({ r: -180 * (1 - Ease.outCubic(p)), s: lerp(.3, 1, Ease.outCubic(p)), a: p }) },
  { id: 'spinIn', n: 'Berputar', css: 'a-rot', f: p => ({ r: 360 * (1 - Ease.outCubic(p)), a: Math.min(1, p * 2) }) },
  { id: 'bounce', n: 'Memantul', css: 'a-bounce', f: p => ({ s: Ease.outBack(p), a: Math.min(1, p * 3) }) },
  { id: 'drop', n: 'Jatuh', css: 'a-slide', f: p => ({ y: -(1 - Ease.outBounce(p)) * .6, a: Math.min(1, p * 3) }) },
  { id: 'flip', n: 'Balik', css: 'a-zoom', f: p => ({ sx: Ease.outCubic(p), a: Math.min(1, p * 2) }) },
  { id: 'blurIn', n: 'Buram Masuk', css: 'a-fade', f: p => ({ blur: 1 - p, a: Math.min(1, p * 1.5) }) },
  { id: 'swingIn', n: 'Ayun Masuk', css: 'a-rot', f: p => ({ r: 25 * (1 - Ease.outElastic(p)), a: Math.min(1, p * 3) }) },
  { id: 'elastic', n: 'Elastis', css: 'a-bounce', f: p => ({ s: Ease.outElastic(p), a: Math.min(1, p * 4) }) },
  { id: 'shakeIn', n: 'Guncang Masuk', css: 'a-fade', f: p => ({ x: Math.sin(p * 40) * .03 * (1 - p), a: Math.min(1, p * 3) }) },
  { id: 'typewriter', n: 'Mesin Ketik', css: 'a-fade', text: true, f: p => ({ chars: p }) },
  { id: 'wordPop', n: 'Kata demi Kata', css: 'a-bounce', text: true, f: p => ({ words: p }) },
];
const ANIM_OUT = [
  { id: 'fade', n: 'Menghilang', css: 'a-fade', f: p => ({ a: 1 - p }) },
  { id: 'zoomOut', n: 'Mengecil', css: 'a-zoom', f: p => ({ s: lerp(1, .4, Ease.inCubic(p)), a: 1 - p }) },
  { id: 'zoomIn', n: 'Membesar', css: 'a-zoom', f: p => ({ s: lerp(1, 1.7, Ease.inCubic(p)), a: 1 - p }) },
  { id: 'slideL', n: 'Ke Kiri', css: 'a-slide', f: p => ({ x: -Ease.inCubic(p) * .6, a: 1 - p }) },
  { id: 'slideR', n: 'Ke Kanan', css: 'a-slide', f: p => ({ x: Ease.inCubic(p) * .6, a: 1 - p }) },
  { id: 'slideU', n: 'Ke Atas', css: 'a-slide', f: p => ({ y: -Ease.inCubic(p) * .5, a: 1 - p }) },
  { id: 'slideD', n: 'Ke Bawah', css: 'a-slide', f: p => ({ y: Ease.inCubic(p) * .5, a: 1 - p }) },
  { id: 'rotOut', n: 'Putar Keluar', css: 'a-rot', f: p => ({ r: 180 * Ease.inCubic(p), s: lerp(1, .3, Ease.inCubic(p)), a: 1 - p }) },
  { id: 'spinOut', n: 'Berputar', css: 'a-rot', f: p => ({ r: -360 * Ease.inCubic(p), a: 1 - p }) },
  { id: 'flip', n: 'Balik', css: 'a-zoom', f: p => ({ sx: 1 - Ease.inCubic(p), a: 1 - p * .5 }) },
  { id: 'blurOut', n: 'Buram Keluar', css: 'a-fade', f: p => ({ blur: p, a: 1 - p }) },
  { id: 'shrinkBack', n: 'Tarik Mundur', css: 'a-bounce', f: p => ({ s: Math.max(0, 1 - Ease.inBack(p)), a: 1 - p * p }) },
  { id: 'typeout', n: 'Hapus Ketik', css: 'a-fade', text: true, f: p => ({ chars: 1 - p }) },
];
const ANIM_LOOP = [
  { id: 'pulse', n: 'Denyut', css: 'a-loop', f: (t, s) => ({ s: 1 + .08 * Math.sin(t * 6.28 * s) }) },
  { id: 'swing', n: 'Ayun', css: 'a-rot', f: (t, s) => ({ r: 8 * Math.sin(t * 6.28 * s) }) },
  { id: 'float', n: 'Melayang', css: 'a-slide', f: (t, s) => ({ y: .02 * Math.sin(t * 6.28 * s * .7) }) },
  { id: 'shake', n: 'Getar', css: 'a-slide', f: (t, s) => ({ x: .008 * Math.sin(t * 60 * s), y: .006 * Math.cos(t * 47 * s) }) },
  { id: 'spin', n: 'Putar Terus', css: 'a-rot', f: (t, s) => ({ r: (t * 120 * s) % 360 }) },
  { id: 'heartbeat', n: 'Detak', css: 'a-loop', f: (t, s) => { const p = (t * s) % 1; return { s: 1 + .12 * (Math.exp(-p * 12) + Math.exp(-Math.abs(p - .25) * 18) * .7) }; } },
  { id: 'blink', n: 'Kedip', css: 'a-fade', f: (t, s) => ({ a: (t * s * 2) % 1 < .5 ? 1 : .15 }) },
  { id: 'wobble', n: 'Goyang', css: 'a-rot', f: (t, s) => ({ r: 5 * Math.sin(t * 10 * s), x: .01 * Math.sin(t * 5 * s) }) },
  { id: 'jelly', n: 'Jeli', css: 'a-bounce', f: (t, s) => ({ sx: 1 + .08 * Math.sin(t * 9 * s), s: 1 - .03 * Math.sin(t * 9 * s) }) },
  { id: 'zoomPingPong', n: 'Zoom Bolak-balik', css: 'a-loop', f: (t, s) => ({ s: 1 + .15 * (.5 - .5 * Math.cos(t * 3 * s)) }) },
  { id: 'karaoke', n: 'Karaoke', css: 'a-fade', text: true, f: (t, s, d) => ({ hl: clamp(t / Math.max(.1, d) * s, 0, 1) }) },
  { id: 'waveText', n: 'Huruf Bergelombang', css: 'a-slide', text: true, f: (t, s) => ({ wave: t * s }) },
];
const ANIM_IN_BY = Object.fromEntries(ANIM_IN.map(a => [a.id, a]));
const ANIM_OUT_BY = Object.fromEntries(ANIM_OUT.map(a => [a.id, a]));
const ANIM_LOOP_BY = Object.fromEntries(ANIM_LOOP.map(a => [a.id, a]));

/* ---------------- FONT ---------------- */
const FONTS = [
  { n: 'Poppins', c: 'Sans', g: 1, w: 1 }, { n: 'Montserrat', c: 'Sans', g: 1, w: 1 }, { n: 'Kanit', c: 'Sans', g: 1, w: 1 },
  { n: 'Baloo 2', c: 'Sans', g: 1, w: 1 }, { n: 'Fredoka', c: 'Sans', g: 1, w: 1 }, { n: 'Comfortaa', c: 'Sans', g: 1, w: 1 },
  { n: 'Oswald', c: 'Judul', g: 1, w: 1 }, { n: 'Anton', c: 'Judul', g: 1 }, { n: 'Bebas Neue', c: 'Judul', g: 1 },
  { n: 'Archivo Black', c: 'Judul', g: 1 }, { n: 'Lilita One', c: 'Judul', g: 1 }, { n: 'Righteous', c: 'Judul', g: 1 },
  { n: 'Russo One', c: 'Judul', g: 1 }, { n: 'Teko', c: 'Judul', g: 1, w: 1 }, { n: 'Abril Fatface', c: 'Judul', g: 1 },
  { n: 'Playfair Display', c: 'Serif', g: 1, w: 1 }, { n: 'Roboto Slab', c: 'Serif', g: 1, w: 1 },
  { n: 'Pacifico', c: 'Tulisan', g: 1 }, { n: 'Lobster', c: 'Tulisan', g: 1 }, { n: 'Dancing Script', c: 'Tulisan', g: 1, w: 1 },
  { n: 'Great Vibes', c: 'Tulisan', g: 1 }, { n: 'Satisfy', c: 'Tulisan', g: 1 }, { n: 'Caveat', c: 'Tulisan', g: 1, w: 1 },
  { n: 'Shadows Into Light', c: 'Tulisan', g: 1 }, { n: 'Permanent Marker', c: 'Unik', g: 1 }, { n: 'Bangers', c: 'Unik', g: 1 },
  { n: 'Luckiest Guy', c: 'Unik', g: 1 }, { n: 'Press Start 2P', c: 'Unik', g: 1 }, { n: 'Orbitron', c: 'Unik', g: 1, w: 1 },
  { n: 'Black Ops One', c: 'Unik', g: 1 }, { n: 'Creepster', c: 'Unik', g: 1 }, { n: 'Amatic SC', c: 'Unik', g: 1, w: 1 },
  { n: 'Amiri', c: 'Arab', g: 1, w: 1 }, { n: 'Cairo', c: 'Arab', g: 1, w: 1 }, { n: 'Reem Kufi', c: 'Arab', g: 1, w: 1 },
  { n: 'Lateef', c: 'Arab', g: 1, w: 1 }, { n: 'Noto Kufi Arabic', c: 'Arab', g: 1, w: 1 },
  { n: 'Arial', c: 'Sistem' }, { n: 'Arial Black', c: 'Sistem' }, { n: 'Impact', c: 'Sistem' }, { n: 'Georgia', c: 'Sistem' },
  { n: 'Times New Roman', c: 'Sistem' }, { n: 'Verdana', c: 'Sistem' }, { n: 'Trebuchet MS', c: 'Sistem' },
  { n: 'Courier New', c: 'Sistem' }, { n: 'Comic Sans MS', c: 'Sistem' }, { n: 'Tahoma', c: 'Sistem' },
];

/* ---------------- GAYA TEKS ---------------- */
const TEXT_DEFAULT = {
  font: 'Poppins', size: 80, color: '#ffffff', bold: true, italic: false, underline: false, align: 'center', ls: 0, lh: 1.2,
  stroke: { on: false, color: '#000000', w: 8 }, shadow: { on: false, color: '#000000', blur: 14, x: 0, y: 5, a: .65 },
  bg: { on: false, color: '#000000', a: .6, r: 14, p: 18 }, grad: { on: false, c1: '#ffe259', c2: '#ff7a59' },
  glow: { on: false, color: '#ffd84d', blur: 26 },
};
const TEXT_STYLES = [
  { n: 'Polos', s: {} },
  { n: 'Garis Hitam', s: { stroke: { on: true, color: '#000000', w: 10 } } },
  { n: 'Kuning Tegas', s: { color: '#ffd400', stroke: { on: true, color: '#000000', w: 12 }, font: 'Anton' } },
  { n: 'Bayangan', s: { shadow: { on: true, color: '#000000', blur: 18, x: 0, y: 6, a: .8 } } },
  { n: 'Kotak Hitam', s: { bg: { on: true, color: '#000000', a: .75, r: 10, p: 20 } } },
  { n: 'Kotak Putih', s: { color: '#111111', bg: { on: true, color: '#ffffff', a: 1, r: 12, p: 20 } } },
  { n: 'Label Kuning', s: { color: '#17130a', bg: { on: true, color: '#ffc93c', a: 1, r: 40, p: 22 }, font: 'Montserrat' } },
  { n: 'Neon Biru', s: { color: '#e6fbff', glow: { on: true, color: '#18c8ff', blur: 30 }, font: 'Orbitron' } },
  { n: 'Neon Pink', s: { color: '#fff0fa', glow: { on: true, color: '#ff2fb3', blur: 30 }, font: 'Pacifico', bold: false } },
  { n: 'Gradasi Senja', s: { grad: { on: true, c1: '#ffe259', c2: '#ff4e50' }, stroke: { on: true, color: '#2b0b0b', w: 6 }, font: 'Archivo Black' } },
  { n: 'Gradasi Laut', s: { grad: { on: true, c1: '#43e97b', c2: '#38f9d7' }, font: 'Lilita One' } },
  { n: 'Komik', s: { color: '#ffffff', stroke: { on: true, color: '#111111', w: 12 }, shadow: { on: true, color: '#e8364a', blur: 0, x: 8, y: 8, a: 1 }, font: 'Bangers', bold: false } },
  { n: 'Elegan', s: { color: '#f6e7c1', font: 'Playfair Display', italic: true, shadow: { on: true, color: '#000000', blur: 12, x: 0, y: 3, a: .5 } } },
  { n: 'Tulisan Tangan', s: { color: '#ffffff', font: 'Dancing Script', shadow: { on: true, color: '#000000', blur: 10, x: 0, y: 3, a: .5 } } },
  { n: 'Judul Besar', s: { font: 'Bebas Neue', size: 140, bold: false, ls: 6, shadow: { on: true, color: '#000000', blur: 22, x: 0, y: 6, a: .6 } } },
  { n: 'Retro', s: { color: '#ffe8a3', stroke: { on: true, color: '#c2410c', w: 8 }, shadow: { on: true, color: '#7c2d12', blur: 0, x: 7, y: 7, a: 1 }, font: 'Righteous' } },
  { n: 'Subtitle', s: { size: 54, font: 'Poppins', bold: true, stroke: { on: true, color: '#000000', w: 7 } } },
  { n: 'Subtitle Kotak', s: { size: 50, font: 'Poppins', bold: false, bg: { on: true, color: '#000000', a: .65, r: 8, p: 14 } } },
  { n: 'Arab Emas', s: { font: 'Amiri', color: '#f9d77e', size: 96, shadow: { on: true, color: '#3b2600', blur: 16, x: 0, y: 4, a: .8 } } },
  { n: 'Merah Berani', s: { color: '#ffffff', bg: { on: true, color: '#e11d48', a: 1, r: 6, p: 18 }, font: 'Oswald' } },
];
const CAPTION_STYLE = { size: 54, font: 'Poppins', bold: true, stroke: { on: true, color: '#000000', w: 7 } };
function makeTextStyle(over) {
  const s = deepClone(TEXT_DEFAULT);
  if (over) for (const k in over) { if (typeof over[k] === 'object' && over[k] && !Array.isArray(over[k])) s[k] = Object.assign({}, s[k], over[k]); else s[k] = over[k]; }
  return s;
}

/* ---------------- STIKER ---------------- */
const EMOJI = {
  'Wajah': '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 😉 😊 😇 🥰 😍 🤩 😘 😋 😛 😜 🤪 😎 🤓 🧐 🤔 🤫 🤭 🫢 😐 😑 😶 🙄 😏 😬 😮 😯 😲 🥱 😴 🤤 😪 😵 🤯 🥳 🥺 😢 😭 😤 😠 😡 🤬 😱 😨 😰 😳 🤗 🫡 🤠 🤡 👻 💀 👽 🤖 💩 😺 😸 😻'.split(' '),
  'Tangan': '👍 👎 👏 🙌 👐 🤲 🙏 🤝 ✌️ 🤞 🤟 🤘 👌 🤌 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 🤙 💪 🫶 ✍️ 👀 👁️ 👄 🫵'.split(' '),
  'Hati': '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❤️‍🔥 💕 💞 💓 💗 💖 💘 💝 💟 ❣️ 💌 💋'.split(' '),
  'Simbol': '✨ ⭐ 🌟 💫 🔥 💥 💢 💯 ✅ ❌ ❗ ❓ ‼️ ⚡ 💡 🎯 🔔 📌 📍 🏆 🥇 🎉 🎊 🎁 🎈 🎀 💎 👑 🚀 💰 💸 📣 📢 ⏰ ⏳ 🔴 🟡 🟢 🔵 ⬆️ ⬇️ ➡️ ⬅️ ↗️ 🔄 ▶️ ⏸️ 🆕 🆗 🆒 🔝'.split(' '),
  'Alam': '☀️ 🌤️ ⛅ 🌧️ ⛈️ 🌈 ❄️ ☃️ 🌙 🌛 ⭐ 🌍 🌊 🌸 🌺 🌻 🌹 🌷 🍀 🌿 🌴 🌵 🍁 🍂 🌾'.split(' '),
  'Hewan': '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🐦 🐤 🦆 🦉 🦋 🐝 🐞 🐢 🐍 🐙 🐬 🐳 🦈 🐠 🦄'.split(' '),
  'Makanan': '🍎 🍊 🍋 🍉 🍇 🍓 🍒 🍑 🥭 🍍 🥥 🥑 🍅 🌶️ 🌽 🥕 🍞 🧀 🍳 🍔 🍟 🍕 🌭 🥪 🌮 🍜 🍝 🍣 🍱 🍛 🍚 🍙 🍡 🍦 🍩 🍪 🎂 🍰 🧁 🍫 🍬 ☕ 🧋 🥤 🍵'.split(' '),
  'Aktivitas': '⚽ 🏀 🏈 ⚾ 🎾 🏐 🏓 🏸 🥊 🎮 🕹️ 🎲 🎨 🎬 🎤 🎧 🎵 🎶 🎸 🎹 🥁 🎻 📷 📸 🎥 📱 💻 ⌚ 📚 ✏️ 🛒 🚗 ✈️ 🏠 🕌 🕋 📿 🤲'.split(' '),
};
const SHAPES = [
  { id: 'rect', n: 'Kotak' }, { id: 'round', n: 'Kotak Bulat' }, { id: 'circle', n: 'Lingkaran' }, { id: 'ring', n: 'Cincin' },
  { id: 'triangle', n: 'Segitiga' }, { id: 'line', n: 'Garis' }, { id: 'star', n: 'Bintang' }, { id: 'heart', n: 'Hati' },
  { id: 'arrow', n: 'Panah' }, { id: 'bar', n: 'Bar Bawah' }, { id: 'pill', n: 'Pil' }, { id: 'frame', n: 'Bingkai' },
];
/* stiker SVG desain sendiri (viewBox 0 0 200 200) */
const SVG_STICKERS = [
  { id: 'arrowR', n: 'Panah', svg: '<path d="M18 80h102V44l66 56-66 56v-36H18z" fill="#ffc93c" stroke="#111" stroke-width="10" stroke-linejoin="round"/>' },
  { id: 'arrowCurve', n: 'Panah Lengkung', svg: '<path d="M30 150C40 80 90 50 140 58" fill="none" stroke="#fff" stroke-width="16" stroke-linecap="round"/><path d="M118 30l42 30-38 32" fill="none" stroke="#fff" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>' },
  { id: 'heart', n: 'Hati', svg: '<path d="M100 172C30 120 16 86 24 60c9-30 50-38 76-6 26-32 67-24 76 6 8 26-6 60-76 112z" fill="#ff3b5c" stroke="#7a0b1f" stroke-width="8"/><ellipse cx="62" cy="66" rx="14" ry="9" fill="#fff" opacity=".6" transform="rotate(-30 62 66)"/>' },
  { id: 'star', n: 'Bintang', svg: '<path d="M100 14l25 54 59 7-44 40 12 58-52-30-52 30 12-58-44-40 59-7z" fill="#ffd23f" stroke="#a15c00" stroke-width="8" stroke-linejoin="round"/>' },
  { id: 'burst', n: 'WOW', svg: '<path d="M100 8l18 34 36-16-4 38 38 8-30 26 26 30-38 4 6 38-34-18-18 36-18-36-34 18 6-38-38-4 26-30-30-26 38-8-4-38 36 16z" fill="#ff4d4d" stroke="#fff" stroke-width="6" stroke-linejoin="round"/><text x="100" y="118" font-family="Arial Black,Impact,sans-serif" font-size="46" font-weight="900" text-anchor="middle" fill="#fff" stroke="#7a0000" stroke-width="3">WOW</text>' },
  { id: 'new', n: 'BARU', svg: '<rect x="14" y="62" width="172" height="76" rx="18" fill="#22c55e" stroke="#064e3b" stroke-width="8"/><text x="100" y="117" font-family="Arial Black,Impact,sans-serif" font-size="46" font-weight="900" text-anchor="middle" fill="#fff">BARU</text>' },
  { id: 'sale', n: 'DISKON', svg: '<path d="M20 60h130l34 40-34 40H20z" fill="#ffc93c" stroke="#111" stroke-width="8" stroke-linejoin="round"/><circle cx="152" cy="100" r="8" fill="#111"/><text x="80" y="114" font-family="Arial Black,Impact,sans-serif" font-size="34" font-weight="900" text-anchor="middle" fill="#111">DISKON</text>' },
  { id: 'live', n: 'LIVE', svg: '<rect x="20" y="66" width="160" height="68" rx="34" fill="#ef233c"/><circle cx="58" cy="100" r="12" fill="#fff"/><text x="120" y="114" font-family="Arial Black,Impact,sans-serif" font-size="40" font-weight="900" text-anchor="middle" fill="#fff">LIVE</text>' },
  { id: 'follow', n: 'IKUTI', svg: '<rect x="12" y="64" width="176" height="72" rx="14" fill="#e11d48"/><path d="M40 84a12 12 0 0124 0v12l6 8H34l6-8z" fill="#fff"/><circle cx="52" cy="112" r="4" fill="#fff"/><text x="122" y="113" font-family="Arial Black,Impact,sans-serif" font-size="32" font-weight="900" text-anchor="middle" fill="#fff">IKUTI</text>' },
  { id: 'bubble', n: 'Balon Kata', svg: '<path d="M100 22c46 0 82 28 82 64s-36 64-82 64c-9 0-18-1-26-3l-38 26 10-36C30 125 18 106 18 86c0-36 36-64 82-64z" fill="#fff" stroke="#111" stroke-width="8" stroke-linejoin="round"/>' },
  { id: 'think', n: 'Balon Pikir', svg: '<ellipse cx="108" cy="80" rx="76" ry="54" fill="#fff" stroke="#111" stroke-width="8"/><circle cx="52" cy="150" r="14" fill="#fff" stroke="#111" stroke-width="7"/><circle cx="28" cy="178" r="8" fill="#fff" stroke="#111" stroke-width="6"/>' },
  { id: 'check', n: 'Centang', svg: '<circle cx="100" cy="100" r="80" fill="#22c55e" stroke="#065f46" stroke-width="8"/><path d="M58 102l28 28 56-58" fill="none" stroke="#fff" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>' },
  { id: 'cross', n: 'Silang', svg: '<circle cx="100" cy="100" r="80" fill="#ef4444" stroke="#7f1d1d" stroke-width="8"/><path d="M66 66l68 68M134 66l-68 68" stroke="#fff" stroke-width="18" stroke-linecap="round"/>' },
  { id: 'ringRed', n: 'Lingkari', svg: '<path d="M40 104c-6-46 46-74 92-62 44 12 52 60 20 90-34 32-104 26-114-20-8-36 30-60 72-62" fill="none" stroke="#ff2d2d" stroke-width="10" stroke-linecap="round"/>' },
  { id: 'brush', n: 'Sapuan', svg: '<path d="M16 120c40-14 120-20 168-12" stroke="#ffc93c" stroke-width="34" stroke-linecap="round" fill="none" opacity=".9"/><path d="M24 132c50-8 110-10 150-4" stroke="#ffb020" stroke-width="10" stroke-linecap="round" fill="none"/>' },
  { id: 'sparkle', n: 'Kilau', svg: '<path d="M100 10c6 52 38 84 90 90-52 6-84 38-90 90-6-52-38-84-90-90 52-6 84-38 90-90z" fill="#fff6c2" stroke="#ffd23f" stroke-width="6" stroke-linejoin="round"/>' },
  { id: 'bolt', n: 'Petir', svg: '<path d="M118 10L36 116h56l-14 74 86-110h-58z" fill="#ffd400" stroke="#8a5a00" stroke-width="8" stroke-linejoin="round"/>' },
  { id: 'flame', n: 'Api', svg: '<path d="M100 186c-44 0-70-30-62-72 6-30 30-44 32-74 22 16 30 36 28 56 10-6 16-18 16-30 26 22 46 52 46 78 0 26-26 42-60 42z" fill="#ff6a00" stroke="#7c2d12" stroke-width="7" stroke-linejoin="round"/><path d="M100 178c-20 0-32-14-28-32 4-14 16-22 20-36 18 14 36 30 36 46 0 14-12 22-28 22z" fill="#ffd23f"/>' },
  { id: 'crown', n: 'Mahkota', svg: '<path d="M24 150l-8-90 50 40 34-62 34 62 50-40-8 90z" fill="#ffc93c" stroke="#7a4a00" stroke-width="8" stroke-linejoin="round"/><rect x="24" y="150" width="152" height="22" rx="6" fill="#e0a200" stroke="#7a4a00" stroke-width="7"/><circle cx="100" cy="122" r="10" fill="#ef4444"/>' },
  { id: 'pin', n: 'Lokasi', svg: '<path d="M100 188S40 120 40 80a60 60 0 01120 0c0 40-60 108-60 108z" fill="#ef4444" stroke="#7f1d1d" stroke-width="8"/><circle cx="100" cy="80" r="22" fill="#fff"/>' },
  { id: 'playbtn', n: 'Tombol Putar', svg: '<circle cx="100" cy="100" r="82" fill="#111" stroke="#fff" stroke-width="8"/><path d="M80 60v80l64-40z" fill="#fff"/>' },
  { id: 'thanks', n: 'Terima Kasih', svg: '<path d="M8 80h30l-12 20 12 20H8zM192 80h-30l12 20-12 20h30z" fill="#b91c1c"/><rect x="30" y="70" width="140" height="60" rx="6" fill="#ef4444"/><text x="100" y="108" font-family="Arial Black,Impact,sans-serif" font-size="22" font-weight="900" text-anchor="middle" fill="#fff">TERIMA KASIH</text>' },
  { id: 'crescent', n: 'Bulan Bintang', svg: '<path d="M120 30a72 72 0 100 140 58 58 0 110-140z" fill="#f9d77e" stroke="#8a6400" stroke-width="6"/><path d="M150 70l7 15 16 2-12 11 3 16-14-8-14 8 3-16-12-11 16-2z" fill="#f9d77e" stroke="#8a6400" stroke-width="4" stroke-linejoin="round"/>' },
  { id: 'lantern', n: 'Lentera', svg: '<path d="M100 10v18" stroke="#8a6400" stroke-width="6"/><path d="M76 28h48l8 18H68z" fill="#d4a017"/><path d="M68 46h64l14 70-14 50H68l-14-50z" fill="#f59e0b" stroke="#7c4a00" stroke-width="6" stroke-linejoin="round"/><path d="M100 46v120M76 46l-8 120M124 46l8 120" stroke="#7c4a00" stroke-width="4"/><ellipse cx="100" cy="112" rx="14" ry="26" fill="#fff3b0" opacity=".9"/><path d="M74 166h52l-6 16H80z" fill="#d4a017"/>' },
  { id: 'ketupat', n: 'Ketupat', svg: '<path d="M100 20l70 70-70 70-70-70z" fill="#65a30d" stroke="#365314" stroke-width="7" stroke-linejoin="round"/><path d="M65 55l70 70M135 55l-70 70M82 37l70 70M118 37l-70 70" stroke="#d9f99d" stroke-width="5"/><path d="M100 160c-6 14-20 24-30 26M100 160c6 14 20 24 30 26" stroke="#65a30d" stroke-width="6" fill="none" stroke-linecap="round"/>' },
  { id: 'sun', n: 'Matahari', svg: '<g stroke="#f59e0b" stroke-width="10" stroke-linecap="round"><path d="M100 10v22M100 168v22M10 100h22M168 100h22M36 36l16 16M148 148l16 16M36 164l16-16M148 52l16-16"/></g><circle cx="100" cy="100" r="46" fill="#ffd23f" stroke="#f59e0b" stroke-width="8"/>' },
  { id: 'cloud', n: 'Awan', svg: '<path d="M52 150a36 36 0 01-4-72 48 48 0 0192-14 38 38 0 0128 86z" fill="#fff" stroke="#94a3b8" stroke-width="8" stroke-linejoin="round"/>' },
];
const SVG_STICKER_BY_ID = Object.fromEntries(SVG_STICKERS.map(s => [s.id, s]));

/* ---------------- WARNA ---------------- */
const SWATCHES = ['#ffffff', '#000000', '#ffc93c', '#ff4d4d', '#ff7a1a', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899', '#94a3b8', '#7c4a00'];
const BG_COLORS = [
  { n: 'Hitam', c: ['#000000'] }, { n: 'Putih', c: ['#ffffff'] }, { n: 'Kuning', c: ['#ffc93c'] }, { n: 'Merah', c: ['#e11d48'] },
  { n: 'Biru', c: ['#1d4ed8'] }, { n: 'Hijau', c: ['#15803d'] }, { n: 'Ungu', c: ['#6d28d9'] }, { n: 'Abu', c: ['#3f3f46'] },
  { n: 'Senja', c: ['#ff7e5f', '#feb47b'] }, { n: 'Laut', c: ['#2193b0', '#6dd5ed'] }, { n: 'Malam', c: ['#0f2027', '#2c5364'] },
  { n: 'Permen', c: ['#f857a6', '#ff5858'] }, { n: 'Daun', c: ['#56ab2f', '#a8e063'] }, { n: 'Galaksi', c: ['#41295a', '#2f0743'] },
  { n: 'Emas', c: ['#f7971e', '#ffd200'] }, { n: 'Aurora', c: ['#00c9ff', '#92fe9d'] },
];

/* ---------------- SUARA (efek & musik sintesis, tanpa hak cipta) ---------------- */
function noiseBuf(ctx, dur) {
  const b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
function envGain(ctx, t0, a, peak, dec, sus = 0, rel = 0) {
  const g = ctx.createGain(); const p = g.gain;
  p.setValueAtTime(0.0001, t0); p.exponentialRampToValueAtTime(Math.max(peak, .0002), t0 + Math.max(a, .001));
  p.exponentialRampToValueAtTime(Math.max(sus, .0001), t0 + a + dec);
  if (rel) p.exponentialRampToValueAtTime(.0001, t0 + a + dec + rel);
  return g;
}
function tone(ctx, out, type, f0, f1, t0, dur, peak = .5, a = .005) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t0);
  if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  const g = envGain(ctx, t0, a, peak, dur);
  o.connect(g).connect(out); o.start(t0); o.stop(t0 + dur + .05);
}
function noiseHit(ctx, out, t0, dur, type, f0, f1, peak = .5, q = 1) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf(ctx, dur + .05);
  const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t0);
  if (f1) f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  const g = envGain(ctx, t0, .005, peak, dur);
  s.connect(f).connect(g).connect(out); s.start(t0); s.stop(t0 + dur + .05);
}
const SFX = [
  { id: 'whoosh', n: 'Whoosh', d: 1.1, f: (c, o) => { const s = c.createBufferSource(); s.buffer = noiseBuf(c, 1.1); const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2; f.frequency.setValueAtTime(300, 0); f.frequency.exponentialRampToValueAtTime(3500, .45); f.frequency.exponentialRampToValueAtTime(500, 1.05); const g = c.createGain(); g.gain.setValueAtTime(.0001, 0); g.gain.exponentialRampToValueAtTime(.9, .45); g.gain.exponentialRampToValueAtTime(.0001, 1.05); s.connect(f).connect(g).connect(o); s.start(0); } },
  { id: 'swooshUp', n: 'Swoosh Naik', d: .8, f: (c, o) => { noiseHit(c, o, 0, .75, 'bandpass', 400, 6000, .7, 3); tone(c, o, 'sine', 300, 1400, 0, .7, .15); } },
  { id: 'swooshDown', n: 'Swoosh Turun', d: .8, f: (c, o) => { noiseHit(c, o, 0, .75, 'bandpass', 6000, 300, .7, 3); tone(c, o, 'sine', 1400, 250, 0, .7, .15); } },
  { id: 'pop', n: 'Pop', d: .3, f: (c, o) => { tone(c, o, 'sine', 900, 140, 0, .18, .8); noiseHit(c, o, 0, .03, 'highpass', 2000, 0, .4); } },
  { id: 'bubble', n: 'Gelembung', d: .3, f: (c, o) => tone(c, o, 'sine', 250, 1000, 0, .22, .6) },
  { id: 'click', n: 'Klik', d: .1, f: (c, o) => noiseHit(c, o, 0, .04, 'highpass', 3000, 0, .8) },
  { id: 'typing', n: 'Mengetik', d: 2, f: (c, o) => { let t = 0; while (t < 1.85) { noiseHit(c, o, t, .03, 'bandpass', 2500 + Math.random() * 2000, 0, .5, 2); t += .07 + Math.random() * .12; } } },
  { id: 'ding', n: 'Ding', d: 1.8, f: (c, o) => { tone(c, o, 'sine', 1318, 0, 0, 1.7, .5); tone(c, o, 'sine', 2636, 0, 0, .9, .15); } },
  { id: 'chime', n: 'Sukses', d: 1.4, f: (c, o) => { [523, 659, 784, 1047].forEach((f, i) => tone(c, o, 'triangle', f, 0, i * .09, .9, .35)); } },
  { id: 'notify', n: 'Notifikasi', d: .8, f: (c, o) => { tone(c, o, 'sine', 880, 0, 0, .3, .5); tone(c, o, 'sine', 1320, 0, .15, .5, .5); } },
  { id: 'error', n: 'Salah', d: .7, f: (c, o) => { tone(c, o, 'square', 180, 0, 0, .22, .25); tone(c, o, 'square', 150, 0, .28, .3, .25); } },
  { id: 'beep', n: 'Bip', d: .4, f: (c, o) => tone(c, o, 'sine', 1000, 0, 0, .32, .5) },
  { id: 'censor', n: 'Sensor Bip', d: .8, f: (c, o) => { const os = c.createOscillator(); os.frequency.value = 1000; const g = c.createGain(); g.gain.value = .4; os.connect(g).connect(o); os.start(0); os.stop(.75); } },
  { id: 'coin', n: 'Koin', d: .6, f: (c, o) => { tone(c, o, 'square', 988, 0, 0, .08, .25); tone(c, o, 'square', 1319, 0, .08, .45, .25); } },
  { id: 'laser', n: 'Laser', d: .5, f: (c, o) => tone(c, o, 'sawtooth', 1600, 180, 0, .4, .3) },
  { id: 'kick', n: 'Drum Kick', d: .6, f: (c, o) => tone(c, o, 'sine', 160, 42, 0, .5, 1) },
  { id: 'snare', n: 'Drum Snare', d: .4, f: (c, o) => { noiseHit(c, o, 0, .25, 'bandpass', 1800, 0, .7, .8); tone(c, o, 'triangle', 200, 120, 0, .12, .5); } },
  { id: 'clap', n: 'Tepuk', d: .5, f: (c, o) => { [0, .012, .025, .04].forEach(t => noiseHit(c, o, t, t === .04 ? .25 : .02, 'bandpass', 1300, 0, .8, 1.2)); } },
  { id: 'applause', n: 'Tepuk Tangan', d: 3.2, f: (c, o) => { for (let i = 0; i < 160; i++) { const t = Math.random() * 2.9; noiseHit(c, o, t, .02 + Math.random() * .03, 'bandpass', 900 + Math.random() * 1600, 0, .25 * Math.sin(Math.PI * t / 3) + .05, 1.2); } } },
  { id: 'riser', n: 'Riser', d: 3, f: (c, o) => { noiseHit(c, o, 0, 2.9, 'bandpass', 200, 8000, .4, 4); const os = c.createOscillator(); os.type = 'sawtooth'; os.frequency.setValueAtTime(110, 0); os.frequency.exponentialRampToValueAtTime(880, 2.9); const g = c.createGain(); g.gain.setValueAtTime(.0001, 0); g.gain.exponentialRampToValueAtTime(.15, 2.8); g.gain.exponentialRampToValueAtTime(.0001, 2.95); os.connect(g).connect(o); os.start(0); os.stop(3); } },
  { id: 'boom', n: 'Boom', d: 2.5, f: (c, o) => { tone(c, o, 'sine', 90, 30, 0, 2.2, 1, .01); noiseHit(c, o, 0, 1.8, 'lowpass', 900, 60, .8); } },
  { id: 'heartbeat', n: 'Detak Jantung', d: 2, f: (c, o) => { [0, .28, 1, 1.28].forEach((t, i) => tone(c, o, 'sine', 70, 40, t, .2, i % 2 ? .6 : 1)); } },
  { id: 'magic', n: 'Sihir', d: 1.6, f: (c, o) => { for (let i = 0; i < 26; i++) tone(c, o, 'sine', 1500 + Math.random() * 3000, 0, i * .05, .35, .12); } },
  { id: 'glitch', n: 'Glitch', d: .8, f: (c, o) => { for (let i = 0; i < 14; i++) tone(c, o, 'square', 80 + Math.random() * 1200, 0, i * .05, .04, .25); } },
  { id: 'shutter', n: 'Kamera', d: .4, f: (c, o) => { noiseHit(c, o, 0, .05, 'highpass', 1500, 0, .9); noiseHit(c, o, .09, .08, 'bandpass', 1200, 0, .6, 1); } },
  { id: 'bell', n: 'Lonceng', d: 3, f: (c, o) => { [1, 2.76, 5.4, 8.93].forEach((m, i) => tone(c, o, 'sine', 440 * m, 0, 0, 2.8 / (i + 1), .4 / (i + 1))); } },
];
const MUSIC = [
  { id: 'lofi', n: 'Santai Lo-fi', d: 24, bpm: 80 },
  { id: 'energik', n: 'Energik', d: 24, bpm: 122 },
  { id: 'ambient', n: 'Ambient Tenang', d: 30, bpm: 60 },
  { id: 'ceria', n: 'Ceria', d: 24, bpm: 110 },
];
function buildMusic(c, o, m) {
  const beat = 60 / m.bpm, bars = Math.floor(m.d / (beat * 4));
  const master = c.createGain(); master.gain.value = .8; master.connect(o);
  const prog = { lofi: [[57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65], [52, 55, 59, 62]], energik: [[45, 52, 57, 60], [41, 48, 53, 57], [43, 50, 55, 59], [40, 47, 52, 55]], ambient: [[48, 55, 60, 64], [45, 52, 57, 64], [41, 48, 53, 60], [43, 50, 55, 62]], ceria: [[60, 64, 67, 72], [55, 59, 62, 67], [57, 60, 64, 69], [53, 57, 60, 65]] }[m.id];
  const mtof = n => 440 * Math.pow(2, (n - 69) / 12);
  for (let b = 0; b < bars; b++) {
    const t0 = b * beat * 4, ch = prog[b % 4];
    ch.forEach(n => {
      const os = c.createOscillator(); os.type = m.id === 'energik' ? 'sawtooth' : 'triangle'; os.frequency.value = mtof(n);
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = m.id === 'energik' ? 1800 : 1100;
      const g = c.createGain(); const len = beat * 4;
      g.gain.setValueAtTime(.0001, t0); g.gain.linearRampToValueAtTime(m.id === 'ambient' ? .07 : .045, t0 + (m.id === 'ambient' ? 1.2 : .05));
      g.gain.setValueAtTime(m.id === 'ambient' ? .07 : .045, t0 + len - .25); g.gain.linearRampToValueAtTime(.0001, t0 + len);
      os.connect(f).connect(g).connect(master); os.start(t0); os.stop(t0 + len + .05);
    });
    if (m.id === 'ambient') continue;
    for (let i = 0; i < 4; i++) {
      const t = t0 + i * beat;
      if (m.id === 'energik' || i % 2 === 0) tone(c, master, 'sine', 150, 42, t, .3, .9);
      if (i % 2 === 1) noiseHit(c, master, t, .18, 'bandpass', 1800, 0, .35, .8);
      for (let k = 0; k < 2; k++) noiseHit(c, master, t + k * beat / 2 + (m.id === 'lofi' && k ? beat * .08 : 0), .04, 'highpass', 7000, 0, .18);
      tone(c, master, m.id === 'energik' ? 'sawtooth' : 'sine', mtof(ch[0] - 12), 0, t, beat * .9, m.id === 'energik' ? .18 : .3, .01);
    }
    if (m.id === 'ceria' || m.id === 'lofi') {
      for (let i = 0; i < 8; i++) if (Math.random() > .35) tone(c, master, 'sine', mtof(ch[(i * 3 + b) % 4] + 12), 0, t0 + i * beat / 2, beat * .45, .08);
    }
  }
}
async function synthAudio(dur, fn) {
  const sr = 44100;
  const c = new OfflineAudioContext(2, Math.ceil(sr * dur), sr);
  const out = c.createGain(); out.gain.value = .9; out.connect(c.destination);
  fn(c, out);
  return encodeWav(await c.startRendering());
}

/* ---------------- EFEK SUARA (pengubah suara) ---------------- */
const VOICES = [
  { id: 'none', n: 'Tanpa' }, { id: 'enhance', n: 'Tingkatkan Suara' }, { id: 'echo', n: 'Gema' }, { id: 'reverb', n: 'Ruangan' }, { id: 'hall', n: 'Aula' },
  { id: 'phone', n: 'Telepon' }, { id: 'radio', n: 'Radio' }, { id: 'megaphone', n: 'Megafon' }, { id: 'underwater', n: 'Bawah Air' },
  { id: 'robot', n: 'Robot' }, { id: 'bass', n: 'Bas Kuat' }, { id: 'treble', n: 'Jernih' }, { id: 'lofi', n: 'Lo-fi' },
];


/* ---------------- KURVA KECEPATAN ----------------
   5 titik kecepatan (rata di sepanjang klip), interpolasi linear */
const SPEED_CURVES = [
  { id: 'montase', n: 'Montase', pts: [1, 3, .4, 3, 1] },
  { id: 'pahlawan', n: 'Pahlawan', pts: [1.5, 1.2, .25, 1.2, 1.5] },
  { id: 'peluru', n: 'Peluru', pts: [2, .2, .2, .2, 2] },
  { id: 'lompat', n: 'Lompatan', pts: [.5, 3, .5, 3, .5] },
  { id: 'kilatMasuk', n: 'Kilat Masuk', pts: [5, 2, 1, 1, 1] },
  { id: 'kilatKeluar', n: 'Kilat Keluar', pts: [1, 1, 1, 2, 5] },
  { id: 'melambat', n: 'Melambat', pts: [2, 1.5, 1, .5, .25] },
  { id: 'mempercepat', n: 'Mempercepat', pts: [.25, .5, 1, 1.5, 2] },
];
const Curve = {
  avg(pts) { let s = 0; for (let i = 0; i < 4; i++) s += (pts[i] + pts[i + 1]) / 2 * .25; return s; },
  at(pts, u) { u = clamp(u, 0, 1) * 4; const i = Math.min(3, Math.floor(u)); return lerp(pts[i], pts[i + 1], u - i); },
  /* integral 0..u dari kecepatan (dalam satuan "u") */
  integ(pts, u) {
    u = clamp(u, 0, 1); let s = 0;
    for (let i = 0; i < 4; i++) {
      const a = i / 4, b = (i + 1) / 4; if (u <= a) break;
      const e = Math.min(u, b), sa = pts[i], se = lerp(pts[i], pts[i + 1], (e - a) * 4);
      s += (sa + se) / 2 * (e - a);
    }
    return s;
  },
  resample(pts, u0, u1) { return [0, 1, 2, 3, 4].map(k => this.at(pts, u0 + (u1 - u0) * k / 4)); },
  svg(pts, w = 64, h = 34) {
    const mx = Math.log(10), y = v => h / 2 - Math.log(v) / mx * (h / 2 - 3);
    const d = pts.map((v, i) => `${i ? 'L' : 'M'}${(i / 4 * (w - 6) + 3).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><line x1="0" y1="${h / 2}" x2="${w}" y2="${h / 2}" stroke="rgba(255,255,255,.18)" stroke-dasharray="2 2"/><path d="${d}" fill="none" stroke="#ffc93c" stroke-width="2" stroke-linejoin="round"/></svg>`;
  },
};
function clipAvgSpeed(c) { return c.curve ? Curve.avg(c.curve.pts) : (c.speed || 1); }
