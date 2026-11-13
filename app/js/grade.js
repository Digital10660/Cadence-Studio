/* Cadence — cinematic colour grading on the GPU (WebGL).
   Exposure, white balance, filmic contrast curve, saturation/vibrance, split-toning (shadows/highlights),
   faded blacks, black & white, all blended by an intensity amount. Applied to the footage only. */
import { W, H } from './core.js';

/* each look: exp, con (S-curve 0..1), sat, vib, temp (-1 cool .. +1 warm), tint (-1 green .. +1 magenta),
   sh / hi (split-tone colours 0..1) + split amount, fade (black lift), bw, gamma */
export const LOOKS = {
  none: { label: 'Naturel', cat: 'Base' },
  clean: { label: 'Propre', cat: 'Base', exp: .05, con: .25, sat: 1.06, vib: .15, temp: .02 },
  creator: { label: 'Créateur vif', cat: 'Base', exp: .04, con: .4, sat: 1.12, vib: .3, temp: .04, sh: [.05, .1, .2], hi: [1, .9, .8], split: .08 },
  teal: { label: 'Teal & Orange', cat: 'Cinéma', exp: 0, con: .45, sat: 1.08, vib: .2, temp: .05, sh: [0, .32, .4], hi: [1, .62, .3], split: .2, fade: .02 },
  film: { label: 'Film chaud', cat: 'Cinéma', exp: .02, con: .32, sat: .92, vib: .05, temp: .18, tint: .04, sh: [.18, .12, .1], hi: [1, .86, .66], split: .12, fade: .06, gamma: .97 },
  blockbuster: { label: 'Blockbuster', cat: 'Cinéma', exp: -.04, con: .6, sat: 1.02, vib: .1, temp: .02, sh: [0, .22, .32], hi: [1, .7, .42], split: .24, fade: 0 },
  cold: { label: 'Cinéma froid', cat: 'Cinéma', exp: -.02, con: .42, sat: .82, temp: -.2, tint: -.02, sh: [.05, .16, .28], hi: [.86, .93, 1], split: .14, fade: .03 },
  moody: { label: 'Moody', cat: 'Ambiance', exp: -.12, con: .55, sat: .74, temp: .02, sh: [.04, .14, .12], hi: [1, .88, .74], split: .16, fade: .05, gamma: 1.06 },
  golden: { label: 'Golden hour', cat: 'Ambiance', exp: .06, con: .3, sat: 1.05, vib: .15, temp: .32, tint: .03, sh: [.3, .16, .08], hi: [1, .82, .52], split: .14, fade: .03 },
  pastel: { label: 'Pastel doux', cat: 'Ambiance', exp: .1, con: .1, sat: .85, vib: .1, temp: .06, tint: .05, sh: [.3, .26, .34], hi: [1, .93, .9], split: .1, fade: .12 },
  night: { label: 'Néon nuit', cat: 'Ambiance', exp: -.06, con: .5, sat: 1.15, vib: .25, temp: -.1, tint: .12, sh: [.12, .05, .3], hi: [.7, .9, 1], split: .2, fade: .02 },
  bw: { label: 'Noir & blanc ciné', cat: 'Noir & blanc', exp: .02, con: .55, bw: 1, fade: .04 },
  bwsoft: { label: 'N&B doux', cat: 'Noir & blanc', exp: .06, con: .25, bw: 1, fade: .1, sh: [.06, .05, .04], hi: [1, .96, .9], split: .1 },
};

const VS = `attribute vec2 p; varying vec2 uv; void main(){ uv = vec2(p.x*.5+.5, .5-p.y*.5); gl_Position = vec4(p,0.,1.); }`;
const FS = `precision mediump float; varying vec2 uv; uniform sampler2D tex;
uniform float exp_, con, sat, vib, temp, tint, split, fade, bw, gamma, amt;
uniform vec3 sh, hi;
uniform sampler2D lutTex; uniform float useLut, lutAmt, lutN;
vec3 applyLut(vec3 c){ c = clamp(c, 0., 1.); float n = lutN, b = c.b * (n - 1.), b0 = floor(b), b1 = min(b0 + 1., n - 1.), f = b - b0;
  float x = c.r * (n - 1.) + .5, y = (c.g * (n - 1.) + .5) / n;
  vec3 a = texture2D(lutTex, vec2((b0 * n + x) / (n * n), y)).rgb, d = texture2D(lutTex, vec2((b1 * n + x) / (n * n), y)).rgb;
  return mix(a, d, f); }
void main(){
  vec3 o = texture2D(tex, uv).rgb, c = o;
  c *= exp2(exp_);
  c *= vec3(1. + temp * .14 + tint * .03, 1. - tint * .08, 1. - temp * .16 + tint * .05);
  c = pow(max(c, 0.), vec3(gamma));
  vec3 s = c * c * (3. - 2. * c); c = mix(c, s, con);
  float l = dot(c, vec3(.2126, .7152, .0722));
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
  float vb = vib * (1. - (mx - mn));
  c = mix(vec3(l), c, sat + vb);
  float ws = 1. - smoothstep(0., .55, l), wh = smoothstep(.45, 1., l);
  c = mix(c, c * (sh * 2.), ws * split) ; c = mix(c, c * (hi * 1.15) + hi * .03, wh * split);
  if (bw > .5) { float g = dot(c, vec3(.3, .59, .11)); c = vec3(g); c = mix(c, c * sh * 2., ws * split); c = mix(c, c * hi * 1.1, wh * split); }
  c = fade + c * (1. - fade);
  c = mix(o, clamp(c, 0., 1.), amt);
  if (useLut > .5) c = mix(c, applyLut(c), lutAmt);
  gl_FragColor = vec4(c, 1.);
}`;

let gl = null, glc = null, prog = null, tex = null, lutTex = null, lutLoaded = null, U = {};
function init() {
  if (gl !== null) return !!prog;
  glc = document.createElement('canvas'); glc.width = W; glc.height = H;
  gl = glc.getContext('webgl', { premultipliedAlpha: false, preserveDrawingBuffer: true });
  if (!gl) { gl = false; return false; }
  const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) console.warn(gl.getShaderInfoLog(x)); return x; };
  prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.warn(gl.getProgramInfoLog(prog)); prog = null; return false; }
  gl.useProgram(prog);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  lutTex = gl.createTexture(); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, lutTex);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  gl.activeTexture(gl.TEXTURE0);
  for (const n of ['useLut', 'lutAmt', 'lutN', 'lutTex', 'tex', 'exp_', 'con', 'sat', 'vib', 'temp', 'tint', 'split', 'fade', 'bw', 'gamma', 'amt', 'sh', 'hi']) U[n] = gl.getUniformLocation(prog, n);
  gl.viewport(0, 0, W, H);
  return true;
}

/** final look = preset + user tweaks {exp, con, sat, temp} */
export function lookParams(id, amt = 1, adj = {}) {
  const L = LOOKS[id] || LOOKS.none;
  return {
    exp: (L.exp || 0) + (adj.exp || 0), con: Math.max(0, (L.con || 0) + (adj.con || 0)), sat: Math.max(0, (L.sat ?? 1) * (1 + (adj.sat || 0))), vib: L.vib || 0,
    temp: (L.temp || 0) + (adj.temp || 0), tint: L.tint || 0, sh: L.sh || [.5, .5, .5], hi: L.hi || [.87, .87, .87], split: L.split || 0,
    fade: L.fade || 0, bw: L.bw || 0, gamma: L.gamma || 1, amt,
  };
}
export const isNeutral = (id, adj = {}, lut = null) => (!id || id === 'none') && !adj.exp && !adj.con && !adj.sat && !adj.temp && !lut;

/** Grade the whole content of a 2D context in place. */
export function gradeCtx(g, p) {
  if (!init()) return false;
  gl.uniform1i(U.tex, 0); gl.uniform1i(U.lutTex, 1);
  const L = p.lut;
  if (L && lutLoaded !== L) { gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, lutTex); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, L.n * L.n, L.n, 0, gl.RGB, gl.UNSIGNED_BYTE, L.data); lutLoaded = L; }
  gl.uniform1f(U.useLut, L ? 1 : 0); gl.uniform1f(U.lutAmt, p.lutAmt ?? 1); gl.uniform1f(U.lutN, L ? L.n : 2);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, g.canvas);
  gl.uniform1f(U.exp_, p.exp); gl.uniform1f(U.con, p.con); gl.uniform1f(U.sat, p.sat); gl.uniform1f(U.vib, p.vib);
  gl.uniform1f(U.temp, p.temp); gl.uniform1f(U.tint, p.tint); gl.uniform1f(U.split, p.split); gl.uniform1f(U.fade, p.fade);
  gl.uniform1f(U.bw, p.bw); gl.uniform1f(U.gamma, p.gamma); gl.uniform1f(U.amt, p.amt); gl.uniform3fv(U.sh, p.sh); gl.uniform3fv(U.hi, p.hi);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'copy'; g.drawImage(glc, 0, 0, g.canvas.width, g.canvas.height); g.restore();
  return true;
}

/* ---------- 3D LUTs (.cube) ---------- */
const LUTC = new Map();
/** parse a .cube file into an atlas (N*N x N, slices along blue) usable by the shader */
export function parseCube(txt) {
  let n = 0; const vals = [];
  let dmin = [0, 0, 0], dmax = [1, 1, 1];
  for (const raw of txt.split(/\r?\n/)) {
    const ln = raw.trim(); if (!ln || ln[0] === '#') continue;
    const up = ln.toUpperCase();
    if (up.startsWith('LUT_3D_SIZE')) { n = parseInt(ln.split(/\s+/)[1]); continue; }
    if (up.startsWith('DOMAIN_MIN')) { dmin = ln.split(/\s+/).slice(1).map(Number); continue; }
    if (up.startsWith('DOMAIN_MAX')) { dmax = ln.split(/\s+/).slice(1).map(Number); continue; }
    if (/^[A-Z_]/.test(up)) continue;
    const p = ln.split(/\s+/); if (p.length >= 3) vals.push(+p[0], +p[1], +p[2]);
  }
  if (!n || vals.length < n * n * n * 3) throw new Error('LUT .cube invalide (seuls les LUTs 3D sont acceptés)');
  const data = new Uint8Array(n * n * n * 3);
  for (let b = 0; b < n; b++) for (let g = 0; g < n; g++) for (let r = 0; r < n; r++) {
    const i = (r + g * n + b * n * n) * 3, o = (g * n * n + b * n + r) * 3;
    for (let k = 0; k < 3; k++) data[o + k] = Math.max(0, Math.min(255, Math.round((vals[i + k] - dmin[k]) / ((dmax[k] - dmin[k]) || 1) * 255)));
  }
  return { n, data };
}
export async function loadLut(url) {
  if (!url) return null;
  if (LUTC.has(url)) return LUTC.get(url);
  const L = parseCube(await (await fetch(url)).text()); LUTC.set(url, L); return L;
}
export const lutCached = url => (url ? LUTC.get(url) || null : null);
