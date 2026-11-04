'use strict';
/* =========================================================
   KLM Cut — compositor WebGL
   Setiap lapisan dirender ke framebuffer sendiri (transform, crop,
   warna, chroma key, masker), lalu dipadukan ke komposit dengan mode blend.
   ========================================================= */
const GLSL_COMMON = `
float hash(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f); return mix(mix(hash(i),hash(i+vec2(1.,0.)),u.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),u.x),u.y); }
float L(vec3 c){ return dot(c,vec3(.299,.587,.114)); }
float ASP(){ return u_res.x/u_res.y; }
`;
const VS = `attribute vec2 a_pos; varying vec2 v_uv; void main(){ v_uv=a_pos*.5+.5; gl_Position=vec4(a_pos,0.,1.); }`;
const FS_LAYER = `precision highp float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_center, u_size, u_texel, u_flip;
uniform float u_rot, u_colorOn, u_maskType;
uniform vec4 u_crop, u_a1, u_a2, u_a3, u_a4, u_sT, u_hT, u_key, u_mask, u_mask2;
uniform vec3 u_key2;
uniform sampler2D u_seg; uniform float u_segOn; uniform vec3 u_seg2;
float lum(vec3 c){ return dot(c,vec3(.2126,.7152,.0722)); }
float hash(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
vec3 hueRot(vec3 c,float a){ vec3 k=vec3(.57735); float cs=cos(a),sn=sin(a); return c*cs+cross(k,c)*sn+k*dot(k,c)*(1.-cs); }
float dot2(vec2 v){ return dot(v,v); }
float sdHeart(vec2 p){ p.x=abs(p.x); if(p.y+p.x>1.) return sqrt(dot2(p-vec2(.25,.75)))-sqrt(2.)/4.; return sqrt(min(dot2(p-vec2(0.,1.)),dot2(p-.5*max(p.x+p.y,0.))))*sign(p.x-p.y); }
float sdStar(vec2 p,float r,float rf){ vec2 k1=vec2(.809016994,-.587785252); vec2 k2=vec2(-.809016994,-.587785252); p.x=abs(p.x); p-=2.*max(dot(k1,p),0.)*k1; p-=2.*max(dot(k2,p),0.)*k2; p.x=abs(p.x); p.y-=r; vec2 ba=rf*vec2(-k1.y,k1.x)-vec2(0.,1.); float h=clamp(dot(p,ba)/dot(ba,ba),0.,r); return length(p-ba*h)*sign(p.y*ba.x-p.x*ba.y); }
void main(){
  vec2 p=gl_FragCoord.xy-u_center;
  float cs=cos(u_rot), sn=sin(u_rot);
  vec2 q=vec2(cs*p.x-sn*p.y, sn*p.x+cs*p.y);
  vec2 lp=q+u_size*.5;
  vec2 luv=lp/u_size;
  if(luv.x<-.002||luv.y<-.002||luv.x>1.002||luv.y>1.002){ gl_FragColor=vec4(0.); return; }
  float edge=min(min(lp.x,u_size.x-lp.x),min(lp.y,u_size.y-lp.y));
  float a=clamp(edge+.5,0.,1.);
  vec2 tuv=clamp(luv,0.,1.);
  if(u_flip.x>.5) tuv.x=1.-tuv.x;
  if(u_flip.y>.5) tuv.y=1.-tuv.y;
  tuv=u_crop.xy+tuv*u_crop.zw;
  vec4 src=texture2D(u_tex,tuv);
  vec3 col=src.rgb; a*=src.a;
  if(u_segOn>.5){ float sm=texture2D(u_seg,tuv).r; sm=smoothstep(u_seg2.x-u_seg2.y,u_seg2.x+u_seg2.y+.001,sm); if(u_seg2.z>.5) sm=1.-sm; a*=sm; }
  if(u_key.a>.5){
    vec2 kc=vec2(dot(u_key.rgb,vec3(-.1687,-.3313,.5)),dot(u_key.rgb,vec3(.5,-.4187,-.0813)));
    vec2 pc=vec2(dot(src.rgb,vec3(-.1687,-.3313,.5)),dot(src.rgb,vec3(.5,-.4187,-.0813)));
    float d=distance(kc,pc);
    float sim=u_key2.x*.35, sm=u_key2.y*.25+.002;
    a*=smoothstep(sim,sim+sm,d);
    float sp=(1.-smoothstep(sim,sim+sm+.15,d))*u_key2.z;
    col=mix(col,vec3(lum(col)),sp);
  }
  if(u_colorOn>.5){
    col*=exp2(u_a1.w);
    col+=u_a1.x*.3;
    col=(col-.5)*(1.+u_a1.y)+.5;
    col.r+=u_a2.x*.12; col.b-=u_a2.x*.12;
    col.g-=u_a2.y*.1; col.r+=u_a2.y*.04; col.b+=u_a2.y*.04;
    if(abs(u_a2.z)>.001) col=hueRot(col,u_a2.z*3.14159);
    float l=lum(col);
    col+=u_a3.x*.3*smoothstep(.45,1.,l);
    col+=u_a3.y*.3*(1.-smoothstep(0.,.55,l));
    l=lum(col);
    col=mix(vec3(l),col,1.+u_a1.z);
    if(u_a4.y>0.){ vec3 sp=vec3(dot(col,vec3(.393,.769,.189)),dot(col,vec3(.349,.686,.168)),dot(col,vec3(.272,.534,.131))); col=mix(col,sp,u_a4.y); }
    if(u_a4.z>0.) col=mix(col,vec3(lum(col)),u_a4.z);
    l=clamp(lum(col),0.,1.);
    col+=(u_sT.rgb-.5)*u_sT.a*(1.-l)*.6;
    col+=(u_hT.rgb-.5)*u_hT.a*l*.6;
    col=col*(1.-u_a2.w*.35)+u_a2.w*.12;
    if(u_a4.x>0.){ vec3 b=(texture2D(u_tex,tuv+vec2(u_texel.x,0.)).rgb+texture2D(u_tex,tuv-vec2(u_texel.x,0.)).rgb+texture2D(u_tex,tuv+vec2(0.,u_texel.y)).rgb+texture2D(u_tex,tuv-vec2(0.,u_texel.y)).rgb)*.25; col+=(src.rgb-b)*u_a4.x*2.; }
    if(abs(u_a3.z)>.001){ float dv=distance(luv,vec2(.5)); col*=1.-u_a3.z*smoothstep(.25,.85,dv); }
    if(u_a3.w>0.) col+=(hash(gl_FragCoord.xy+u_a4.w*61.)-.5)*u_a3.w*.25;
  }
  if(u_maskType>.5){
    vec2 mp=lp-u_mask.xy*u_size;
    float c2=cos(u_mask2.x), s2=sin(u_mask2.x);
    mp=vec2(c2*mp.x-s2*mp.y, s2*mp.x+c2*mp.y);
    vec2 hs=max(u_mask.zw*u_size*.5,vec2(1.));
    float fe=max(u_mask2.y*min(u_size.x,u_size.y)*.25,.75);
    float d;
    if(u_maskType<1.5) d=mp.y;
    else if(u_maskType<2.5) d=abs(mp.y)-hs.y;
    else if(u_maskType<3.5) d=(length(mp/hs)-1.)*min(hs.x,hs.y);
    else if(u_maskType<4.5){ float rr=u_mask2.w*min(hs.x,hs.y); vec2 qd=abs(mp)-hs+rr; d=length(max(qd,0.))+min(max(qd.x,qd.y),0.)-rr; }
    else if(u_maskType<5.5){ float s=min(hs.x,hs.y)*2.; vec2 hp=mp/s; hp.y+=.5; d=sdHeart(hp)*s; }
    else { float s=min(hs.x,hs.y); d=sdStar(mp/s,1.,.45)*s; }
    float m=1.-smoothstep(-fe,fe,d);
    if(u_mask2.z>.5) m=1.-m;
    a*=m;
  }
  gl_FragColor=vec4(clamp(col,0.,1.),a);
}`;
const FS_COMP = `precision highp float;
varying vec2 v_uv; uniform sampler2D u_base, u_layer; uniform float u_opacity, u_mode;
vec3 bl(vec3 b, vec3 s){
  float m=u_mode;
  if(m<.5) return s;
  if(m<1.5) return min(b,s);
  if(m<2.5) return b*s;
  if(m<3.5) return 1.-min(vec3(1.),(1.-b)/max(s,vec3(.001)));
  if(m<4.5) return max(b,s);
  if(m<5.5) return 1.-(1.-b)*(1.-s);
  if(m<6.5) return min(vec3(1.),b/max(1.-s,vec3(.001)));
  if(m<7.5) return min(b+s,vec3(1.));
  if(m<8.5) return mix(2.*b*s,1.-2.*(1.-b)*(1.-s),step(.5,b));
  if(m<9.5) return mix(2.*b*s+b*b*(1.-2.*s),sqrt(b)*(2.*s-1.)+2.*b*(1.-s),step(.5,s));
  if(m<10.5) return mix(2.*b*s,1.-2.*(1.-b)*(1.-s),step(.5,s));
  if(m<11.5) return abs(b-s);
  return b+s-2.*b*s;
}
void main(){ vec4 b=texture2D(u_base,v_uv); vec4 l=texture2D(u_layer,v_uv); float a=l.a*u_opacity; gl_FragColor=vec4(mix(b.rgb,bl(b.rgb,l.rgb),a),1.); }`;
const FS_COPY = `precision highp float; varying vec2 v_uv; uniform sampler2D u_tex; void main(){ gl_FragColor=vec4(texture2D(u_tex,v_uv).rgb,1.); }`;
const FS_BLUR = `precision highp float; varying vec2 v_uv; uniform sampler2D u_tex; uniform vec2 u_dir;
void main(){ vec4 s=texture2D(u_tex,v_uv)*.227027; s+=texture2D(u_tex,v_uv+u_dir*1.384615)*.316216; s+=texture2D(u_tex,v_uv-u_dir*1.384615)*.316216; s+=texture2D(u_tex,v_uv+u_dir*3.230769)*.070270; s+=texture2D(u_tex,v_uv-u_dir*3.230769)*.070270; gl_FragColor=s; }`;

const Renderer = {
  gl: null, canvas: null, W: 0, H: 0, maxTex: 4096,
  progs: {}, fxProgs: {}, trProgs: {}, tex: {}, pool: [], comp: [], small: [], frame: 0, lost: false,
  init(canvas) {
    this.canvas = canvas;
    const opts = { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' };
    const gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
    if (!gl) { toast('WebGL tidak tersedia di perangkat ini — pratinjau tidak bisa ditampilkan', 'err', 6000); return false; }
    this.gl = gl;
    this.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.lost = true; });
    canvas.addEventListener('webglcontextrestored', () => { this.lost = false; this.setup(); Engine.requestRender(); });
    this.setup();
    return true;
  },
  setup() {
    const gl = this.gl;
    this.buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.progs = {
      layer: this.program(FS_LAYER), comp: this.program(FS_COMP), copy: this.program(FS_COPY), blur: this.program(FS_BLUR),
    };
    this.fxProgs = {}; this.trProgs = {}; this.tex = {}; this.pool = []; this.comp = []; this.small = [];
    this.empty = this.mkTex(1, 1);
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
    if (this.W) { const w = this.W, h = this.H; this.W = 0; this.resize(w, h); }
  },
  shader(type, src) {
    const gl = this.gl, s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(s), src); gl.deleteShader(s); return null; }
    return s;
  },
  program(fs) {
    const gl = this.gl;
    const v = this.shader(gl.VERTEX_SHADER, VS), f = this.shader(gl.FRAGMENT_SHADER, fs);
    if (!v || !f) return null;
    const p = gl.createProgram(); gl.attachShader(p, v); gl.attachShader(p, f);
    gl.bindAttribLocation(p, 0, 'a_pos'); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(p)); return null; }
    const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name); }
    return { p, u };
  },
  fxProg(id) {
    if (id in this.fxProgs) return this.fxProgs[id];
    const e = EFFECT_BY_ID[id];
    let pr = null;
    if (e) pr = this.program(`precision highp float; varying vec2 v_uv; uniform sampler2D u_tex; uniform vec2 u_res; uniform float u_time, u_int, u_speed, u_dur;
${GLSL_COMMON}
vec4 T(vec2 uv){ vec4 c=texture2D(u_tex,uv); return vec4(c.rgb*c.a,c.a); }
#define TT (u_time*u_speed)
${e.g}
void main(){ vec4 c=clamp(fx(v_uv),0.,1.); gl_FragColor=c.a>.001?vec4(clamp(c.rgb/c.a,0.,1.),c.a):vec4(0.); }`);
    this.fxProgs[id] = pr;
    return pr;
  },
  trProg(id) {
    if (id in this.trProgs) return this.trProgs[id];
    const t = TRANS_BY_ID[id] || TRANS_BY_ID.fade;
    const pr = this.program(`precision highp float; varying vec2 v_uv; uniform sampler2D u_from, u_to; uniform float u_p; uniform vec2 u_res;
${GLSL_COMMON}
vec4 A(vec2 uv){ vec4 c=texture2D(u_from,uv); return vec4(c.rgb*c.a,c.a); }
vec4 B(vec2 uv){ vec4 c=texture2D(u_to,uv); return vec4(c.rgb*c.a,c.a); }
bool inside(vec2 u){ return u.x>=0.&&u.y>=0.&&u.x<=1.&&u.y<=1.; }
vec4 Ai(vec2 u){ return inside(u)?A(u):vec4(0.); }
vec4 Bi(vec2 u){ return inside(u)?B(u):vec4(0.); }
#define P u_p
${t.g}
void main(){ vec4 c=clamp(tr(v_uv),0.,1.); gl_FragColor=c.a>.001?vec4(clamp(c.rgb/c.a,0.,1.),c.a):vec4(0.); }`);
    this.trProgs[id] = pr;
    return pr;
  },
  mkTex(w, h) {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (w) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    return t;
  },
  mkFbo(w, h) {
    const gl = this.gl, tex = this.mkTex(w, h), fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { fb, tex, w, h, busy: false };
  },
  delFbo(f) { if (!f) return; this.gl.deleteFramebuffer(f.fb); this.gl.deleteTexture(f.tex); },
  resize(w, h) {
    w = Math.max(2, Math.round(w)); h = Math.max(2, Math.round(h));
    if (w > this.maxTex || h > this.maxTex) { const s = this.maxTex / Math.max(w, h); w = Math.floor(w * s); h = Math.floor(h * s); }
    if (w === this.W && h === this.H) return;
    this.W = w; this.H = h;
    this.canvas.width = w; this.canvas.height = h;
    if (!this.gl) return;
    this.pool.forEach(f => this.delFbo(f)); this.comp.forEach(f => this.delFbo(f)); this.small.forEach(f => this.delFbo(f));
    this.pool = [];
    this.comp = [this.mkFbo(w, h), this.mkFbo(w, h)];
    const sw = Math.max(16, Math.round(w / 8)), sh = Math.max(16, Math.round(h / 8));
    this.small = [this.mkFbo(sw, sh), this.mkFbo(sw, sh)];
  },
  acquire() {
    let f = this.pool.find(x => !x.busy);
    if (!f) { f = this.mkFbo(this.W, this.H); this.pool.push(f); }
    f.busy = true;
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, f.fb); gl.viewport(0, 0, f.w, f.h);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    return f;
  },
  release(f) { if (f) f.busy = false; },
  run(pr, target, uni, texs) {
    const gl = this.gl;
    if (!pr) return false;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
    gl.viewport(0, 0, target ? target.w : this.W, target ? target.h : this.H);
    gl.useProgram(pr.p);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    let unit = 0;
    for (const k in texs) {
      if (!pr.u[k]) continue;
      gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, texs[k]); gl.uniform1i(pr.u[k], unit); unit++;
    }
    for (const k in uni) {
      const loc = pr.u[k]; if (!loc) continue; const v = uni[k];
      if (typeof v === 'number') gl.uniform1f(loc, v);
      else if (v.length === 2) gl.uniform2fv(loc, v);
      else if (v.length === 3) gl.uniform3fv(loc, v);
      else gl.uniform4fv(loc, v);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return true;
  },
  /* unggah sumber (video/gambar/kanvas) ke tekstur */
  source(src) {
    if (!src || !src.el) return null;
    const gl = this.gl, el = src.el;
    let e = this.tex[src.key];
    const isV = el instanceof HTMLVideoElement;
    const w = isV ? el.videoWidth : (el.naturalWidth || el.width), hh = isV ? el.videoHeight : (el.naturalHeight || el.height);
    if (!w || !hh) return e && e.w ? e : null;
    if (!e) e = this.tex[src.key] = { t: this.mkTex(), ver: null, w: 0, h: 0, used: 0 };
    e.used = this.frame;
    let need;
    if (isV) { if (el.readyState < 2 || el.seeking) return e.w ? e : null; need = !el.paused || el.currentTime !== e.vt || e.w !== w; }
    else need = e.ver !== src.ver;
    if (need) {
      gl.bindTexture(gl.TEXTURE_2D, e.t);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, el); }
      catch (err) { return e.w ? e : null; }
      e.w = w; e.h = hh; e.ver = src.ver; if (isV) e.vt = el.currentTime;
    }
    return e;
  },
  colorUni(c) {
    if (!c) return { u_colorOn: 0 };
    const g = k => c[k] || 0;
    return {
      u_colorOn: 1,
      u_a1: [g('bri'), g('con'), g('sat'), g('exp')],
      u_a2: [g('temp'), g('tint'), g('hue'), Math.max(0, g('fade'))],
      u_a3: [g('hl'), g('sh'), g('vig'), Math.max(0, g('grain'))],
      u_a4: [Math.max(0, g('sharp')), Math.max(0, g('sepia')), Math.max(0, g('bw')), (this.frame % 997)],
      u_sT: c.sT || [.5, .5, .5, 0], u_hT: c.hT || [.5, .5, .5, 0],
    };
  },
  layerPass(texInfo, L, target, sc) {
    // L: deskripsi lapisan dalam piksel proyek (y ke bawah). sc: skala piksel render/proyek
    const k = sc.k, PH = sc.PH;
    const crop = L.crop || [0, 0, 1, 1];
    const m = L.mask;
    const u = Object.assign({
      u_center: [L.cx * k, (PH - L.cy) * k], u_size: [Math.max(.5, L.w * k), Math.max(.5, L.h * k)], u_rot: L.rot || 0,
      u_crop: crop, u_flip: [L.flipH ? 1 : 0, L.flipV ? 1 : 0], u_texel: [1 / texInfo.w, 1 / texInfo.h],
      u_key: L.chroma ? [L.chroma.r, L.chroma.g, L.chroma.b, 1] : [0, 0, 0, 0], u_key2: L.chroma ? [L.chroma.sim, L.chroma.smooth, L.chroma.spill] : [0, 0, 0],
      u_maskType: m ? m.t : 0, u_mask: m ? [m.x, m.y, m.w, m.h] : [0, 0, 0, 0], u_mask2: m ? [m.rot, m.feather, m.invert ? 1 : 0, m.round || 0] : [0, 0, 0, 0],
    }, this.colorUni(L.col));
    let segT = this.empty;
    if (L.seg && L.seg.data) { segT = this.segTex(L.src.key, L.seg); u.u_segOn = 1; u.u_seg2 = [L.seg.th == null ? .5 : L.seg.th, L.seg.soft == null ? .12 : L.seg.soft, L.seg.inv ? 1 : 0]; }
    else { u.u_segOn = 0; u.u_seg2 = [0, 0, 0]; }
    return this.run(this.progs.layer, target, u, { u_tex: texInfo.t, u_seg: segT });
  },
  segTex(key, seg) {
    const gl = this.gl, k = 'seg:' + key;
    let e = this.tex[k];
    if (!e) e = this.tex[k] = { t: this.mkTex(), ver: -1, used: 0 };
    e.used = this.frame;
    if (e.ver !== seg.ver) {
      gl.bindTexture(gl.TEXTURE_2D, e.t);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, seg.w, seg.h, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, seg.data);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      e.ver = seg.ver;
    }
    return e.t;
  },
  effectPass(srcTex, dst, f) {
    const pr = this.fxProg(f.id); if (!pr) return false;
    return this.run(pr, dst, { u_res: [dst.w, dst.h], u_time: f.time || 0, u_int: f.int == null ? 1 : f.int, u_speed: f.speed || 1, u_dur: f.dur || 3 }, { u_tex: srcTex });
  },
  renderLayer(L, sc) {
    const ti = this.source(L.src); if (!ti) return null;
    let F = this.acquire();
    this.layerPass(ti, L, F, sc);
    for (const f of (L.fx || [])) {
      if (f.int <= 0.001) continue;
      const F2 = this.acquire();
      if (this.effectPass(F.tex, F2, f)) { this.release(F); F = F2; } else this.release(F2);
    }
    return F;
  },
  render(fr) {
    const gl = this.gl; if (!gl || this.lost || !this.W) return;
    this.frame++;
    const sc = { k: this.W / fr.PW, PH: fr.PH };
    let A = this.comp[0], B = this.comp[1];
    const swap = () => { const t = A; A = B; B = t; };
    gl.bindFramebuffer(gl.FRAMEBUFFER, A.fb); gl.viewport(0, 0, A.w, A.h);
    const bc = fr.bg.color || [0, 0, 0];
    gl.clearColor(bc[0], bc[1], bc[2], 1); gl.clear(gl.COLOR_BUFFER_BIT);
    if (fr.bgLayer) {
      const ti = this.source(fr.bgLayer.src);
      if (ti && fr.bg.type === 'blur') {
        const [S1, S2] = this.small;
        gl.bindFramebuffer(gl.FRAMEBUFFER, S1.fb); gl.viewport(0, 0, S1.w, S1.h); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
        this.layerPass(ti, fr.bgLayer, S1, { k: S1.w / fr.PW, PH: fr.PH });
        const it = 1 + Math.round((fr.bg.blur || .5) * 4), spread = .6 + (fr.bg.blur || .5) * 1.6;
        for (let i = 0; i < it; i++) {
          this.run(this.progs.blur, S2, { u_dir: [spread / S1.w, 0] }, { u_tex: S1.tex });
          this.run(this.progs.blur, S1, { u_dir: [0, spread / S1.h] }, { u_tex: S2.tex });
        }
        this.run(this.progs.copy, A, {}, { u_tex: S1.tex });
      } else if (ti) {
        const F = this.acquire(); this.layerPass(ti, fr.bgLayer, F, sc);
        this.run(this.progs.comp, B, { u_opacity: 1, u_mode: 0 }, { u_base: A.tex, u_layer: F.tex }); this.release(F); swap();
      }
    }
    for (const it of fr.items) {
      if (it.kind === 'layer' || it.kind === 'trans') {
        let F;
        if (it.kind === 'layer') F = this.renderLayer(it.layer, sc);
        else {
          const a = it.from ? this.renderLayer(it.from, sc) : null;
          const b = it.to ? this.renderLayer(it.to, sc) : null;
          F = this.acquire();
          const pr = this.trProg(it.trId);
          this.run(pr, F, { u_p: clamp(it.p, 0, 1), u_res: [F.w, F.h] }, { u_from: a ? a.tex : this.empty, u_to: b ? b.tex : this.empty });
          this.release(a); this.release(b);
        }
        if (!F) continue;
        this.run(this.progs.comp, B, { u_opacity: it.opacity == null ? 1 : it.opacity, u_mode: BLEND_ID[it.blend] || 0 }, { u_base: A.tex, u_layer: F.tex });
        this.release(F); swap();
      } else if (it.kind === 'fx') {
        if (this.effectPass(A.tex, B, it)) swap();
      } else if (it.kind === 'adj') {
        const F = this.acquire();
        this.layerPass({ t: A.tex, w: A.w, h: A.h }, { cx: fr.PW / 2, cy: fr.PH / 2, w: fr.PW, h: fr.PH, rot: 0, col: it.col }, F, sc);
        this.run(this.progs.comp, B, { u_opacity: it.opacity == null ? 1 : it.opacity, u_mode: 0 }, { u_base: A.tex, u_layer: F.tex });
        this.release(F); swap();
      }
    }
    this.run(this.progs.copy, null, {}, { u_tex: A.tex });
    this.pool.forEach(f => f.busy = false);
    if (this.frame % 120 === 0) this.gc();
  },
  gc() {
    for (const k in this.tex) {
      if (this.frame - this.tex[k].used > 600) { this.gl.deleteTexture(this.tex[k].t); delete this.tex[k]; }
    }
    while (this.pool.length > 6) this.delFbo(this.pool.pop());
  },
  dropKey(key) { const e = this.tex[key]; if (e) { this.gl.deleteTexture(e.t); delete this.tex[key]; } },
  thumbnail(w = 320) {
    if (!this.canvas || !this.W) return null;
    try {
      const h2 = Math.round(w * this.H / this.W);
      const c = document.createElement('canvas'); c.width = w; c.height = h2;
      c.getContext('2d').drawImage(this.canvas, 0, 0, w, h2);
      return c.toDataURL('image/jpeg', .7);
    } catch (e) { return null; }
  },
};
