/**
 * Shaders WGSL du rendu de plongée (WebGPU).
 *
 * Adaptés d'« Abyssal Garden » de Maksymilian Dendura (licence MIT,
 * https://github.com/Noniv/abyssal-garden) : eau et brouillard par canal, caustiques,
 * roche triplanaire, feuilles de kelp instanciées, surface vue de dessous, particules,
 * rayons de lumière, halo et composition finale.
 * Ajouts pour Nautiliar : profondeur jusqu'aux abysses (DK), lumières du jeu (phare,
 * veilleuses, portail), feuilles écartées par le sous-marin, maillages Three.js, déchirure.
 *
 * buildShaders(Q) : Q = { WATER, SHADOW, AA, RAYN, SPOTN, LV, DK }
 */
export function buildShaders(Q) {
const { WATER, SHADOW, AA, RAYN, SPOTN, LV, DK, ECHO_SPEED = 70 } = Q;
const W_NOISE = /*wgsl*/`
fn ss(a: f32, b: f32, x: f32) -> f32 { let t = clamp((x - a) / (b - a), 0., 1.); return t * t * (3. - 2. * t); }
fn h31(p: vec3f) -> f32 { var q = fract(p * vec3f(.1031, .1030, .0973)); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
fn h33(p: vec3f) -> vec3f { var q = fract(p * vec3f(.1031, .1030, .0973)); q += dot(q, q.yxz + 33.33); return fract((q.xxy + q.yxx) * q.zyx); }
fn vn(p: vec3f) -> f32 {
  let i = floor(p); let f = fract(p); let u = f * f * (3. - 2. * f);
  return mix(mix(mix(h31(i), h31(i + vec3f(1., 0., 0.)), u.x), mix(h31(i + vec3f(0., 1., 0.)), h31(i + vec3f(1., 1., 0.)), u.x), u.y),
             mix(mix(h31(i + vec3f(0., 0., 1.)), h31(i + vec3f(1., 0., 1.)), u.x), mix(h31(i + vec3f(0., 1., 1.)), h31(i + vec3f(1., 1., 1.)), u.x), u.y), u.z);
}
fn fbm(p: vec3f, n: i32) -> f32 {
  var a = .5; var s = 0.; var q = p;
  for (var i = 0; i < n; i++) { s += a * vn(q); q = q * 2.03 + vec3f(17.1, 31.7, 5.3); a *= .5; }
  return s / (1. - 2. * a);
}
fn wor(p: vec3f) -> f32 {
  let i = floor(p); let f = fract(p); var d = 9.;
  for (var x = -1; x <= 1; x++) { for (var y = -1; y <= 1; y++) { for (var z = -1; z <= 1; z++) {
    let o = vec3f(f32(x), f32(y), f32(z)); let r = o + h33(i + o) - f; d = min(d, dot(r, r));
  } } }
  return sqrt(d);
}
`;

// ---------------------------------------------------------------- fullscreen helpers
const W_FS = /*wgsl*/`
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f { return vec4f(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1), 0., 1.); }
`;

// rock detail texture (tileable): rg = slope, b = height, a = mottling
const W_DETAIL = W_NOISE + W_FS + /*wgsl*/`
fn hp(p: vec2f, per: f32) -> f32 { return h31(vec3f(p - per * floor(p / per), per)); }
fn tn(p: vec2f, per: f32) -> f32 {
  let i = floor(p); let f = fract(p); let u = f * f * (3. - 2. * f);
  return mix(mix(hp(i, per), hp(i + vec2f(1., 0.), per), u.x), mix(hp(i + vec2f(0., 1.), per), hp(i + vec2f(1., 1.), per), u.x), u.y);
}
fn tf(uv: vec2f, per: f32, n: i32) -> f32 { var a = .5; var s = 0.; var pr = per; for (var i = 0; i < n; i++) { s += a * tn(uv * pr + f32(i) * 7.3, pr); pr *= 2.; a *= .5; } return s / (1. - 2. * a); }
fn tw(p: vec2f, per: f32) -> vec3f {
  let i = floor(p); let f = fract(p); var d = vec2f(9.); var id = 0.;
  for (var x = -1; x <= 1; x++) { for (var y = -1; y <= 1; y++) {
    let o = vec2f(f32(x), f32(y)); let c = i + o; let cw = c - per * floor(c / per);
    let hh = h33(vec3f(cw, per)); let r = o + hh.xy - f; let l = dot(r, r);
    if (l < d.x) { d.y = d.x; d.x = l; id = hh.z; } else if (l < d.y) { d.y = l; }
  } }
  return vec3f(sqrt(d), id);
}
fn H(uv: vec2f) -> f32 {
  let wq = uv + .11 * (vec2f(tf(uv, 3., 4), tf(uv + .5, 3., 4)) - .5);
  let f = tf(wq, 3., 8);
  let r1 = 1. - abs(tf(wq + 1.7, 5., 6) * 2. - 1.);
  let cr = min(abs(tf(wq + 4.1, 4., 5) * 2. - 1.) * 7., 1.);
  let cr2 = min(abs(tf(wq.yx + 2.3, 9., 4) * 2. - 1.) * 9., 1.);
  let pt = tw(wq * 29., 29.);
  let pit = (1. - ss(.0, .34, pt.x)) * step(.62, pt.z);
  return f * .50 + r1 * r1 * .24 + cr * cr2 * .26 - pit * .07;
}
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = fc.xy / 1024.; let e = 1. / 1024.;
  let h = H(uv);
  let gx = H(uv + vec2f(e, 0.)) - H(uv - vec2f(e, 0.)); let gy = H(uv + vec2f(0., e)) - H(uv - vec2f(0., e));
  let s = clamp(vec2f(gx, gy) * 1024. * .5 * .075, vec2f(-1.), vec2f(1.));
  return vec4f(-s * .5 + .5, h, tf(uv + 3.7, 3., 5));
}
`;

// blit / mip / bloom chain
const W_BLIT = W_FS + /*wgsl*/`
@group(0) @binding(0) var t: texture_2d<f32>;
@group(0) @binding(1) var s: sampler;
fn uvOf(fc: vec4f, k: f32) -> vec2f { return fc.xy * k / vec2f(textureDimensions(t)); }
@fragment fn fsMip(@builtin(position) fc: vec4f) -> @location(0) vec4f { return textureSampleLevel(t, s, uvOf(fc, 2.), 0.); }
fn kar(c: vec3f) -> vec4f { let w = 1. / (1. + max(c.r, max(c.g, c.b))); return vec4f(c * w, w); }
@fragment fn fsDown0(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = uvOf(fc, 2.); let e = 1. / vec2f(textureDimensions(t));
  let a = kar(min(textureSampleLevel(t, s, uv + e * vec2f(-1., -1.), 0.).rgb, vec3f(24.)));
  let b = kar(min(textureSampleLevel(t, s, uv + e * vec2f(1., -1.), 0.).rgb, vec3f(24.)));
  let c = kar(min(textureSampleLevel(t, s, uv + e * vec2f(-1., 1.), 0.).rgb, vec3f(24.)));
  let d = kar(min(textureSampleLevel(t, s, uv + e * vec2f(1., 1.), 0.).rgb, vec3f(24.)));
  let m = a + b + c + d;
  return vec4f(m.rgb / m.a, 1.);
}
@fragment fn fsDown(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = uvOf(fc, 2.); let e = 1. / vec2f(textureDimensions(t));
  return (textureSampleLevel(t, s, uv + e * vec2f(-1., -1.), 0.) + textureSampleLevel(t, s, uv + e * vec2f(1., -1.), 0.)
        + textureSampleLevel(t, s, uv + e * vec2f(-1., 1.), 0.) + textureSampleLevel(t, s, uv + e * vec2f(1., 1.), 0.)) * .25;
}
@fragment fn fsUp(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = uvOf(fc, .5); let e = .75 / vec2f(textureDimensions(t));
  return (textureSampleLevel(t, s, uv + e * vec2f(-1., -1.), 0.) + textureSampleLevel(t, s, uv + e * vec2f(1., -1.), 0.)
        + textureSampleLevel(t, s, uv + e * vec2f(-1., 1.), 0.) + textureSampleLevel(t, s, uv + e * vec2f(1., 1.), 0.)) * .25;
}
`;

// animated water texture: r = caustic, ba = surface slope
const W_WATER = W_FS + /*wgsl*/`
@group(0) @binding(0) var<uniform> tm: vec4f;
fn caus(uv: vec2f, t: f32) -> f32 {
  let p = uv * 6.2831853;
  var i = p; var c = 0.;
  for (var n = 1; n <= 5; n++) {
    let tt = t * (1. - 3.5 / f32(n));
    i = p + vec2f(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    let s = sin(i.x + tt); let k = cos(i.y + tt);
    c += abs(s * k) / (1.25 * sqrt(s * s + k * k) + 1e-4);
  }
  c = 1.17 - pow(c / 5., 1.4);
  return pow(abs(c), 8.);
}
const WK = array<vec3f, 10>(vec3f(1., 2., 1.), vec3f(-2., 1., .9), vec3f(3., 1., .6), vec3f(1., -4., .5), vec3f(4., 3., .4),
  vec3f(-3., 5., .32), vec3f(6., -2., .28), vec3f(5., 7., .2), vec3f(-8., 3., .18), vec3f(2., 11., .14));
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = fc.xy / ${WATER}.; let t = tm.x;
  let c = caus(uv, t * .45 + 23.);
  let wu = uv + .02 * vec2f(sin(6.2831853 * (uv.y * 2. + .1 * t)), cos(6.2831853 * (uv.x * 3. - .07 * t)));
  var s = vec2f(0.);
  for (var i = 0; i < 10; i++) {
    let k = WK[i];
    s += k.xy * k.z * cos(dot(k.xy, wu) * 6.2831853 + t * (.5 + .35 * sqrt(length(k.xy))) * select(-1., 1., (i & 1) == 0) + f32(i) * 1.7);
  }
  return vec4f(c, c, s * .06);
}
`;

// ---------------------------------------------------------------- shared scene code
const S_G = /*wgsl*/`
struct G { vp: mat4x4f, sm: mat4x4f, cam: vec4f, right: vec4f, up: vec4f, fwd: vec4f, sun: vec4f, res: vec4f, mis: vec4f,
  sub: vec4f, subv: vec4f, fx: vec4f, lp: array<vec4f, 6>, lc: array<vec4f, 6>, ld: array<vec4f, 6> };
const DK = ${DK};
const SIG = vec3f(.058, .0235, .0195);
const KD = vec3f(.056, .0245, .0170);
const WCOL = vec3f(.16, .58, .90);
const KDZ = vec3f(.034, .023, .018);
const PCOL = vec3f(.58, .66, .98);
const SUNC = vec3f(1.7, 1.6, 1.45);
const TAU = 6.2831853;
const GLOWC = vec3f(.012, .075, .03);
const LOW = ${LV > 1};
fn sat(x: f32) -> f32 { return clamp(x, 0., 1.); }
fn ss(a: f32, b: f32, x: f32) -> f32 { let t = clamp((x - a) / (b - a), 0., 1.); return t * t * (3. - 2. * t); }
fn ign(p: vec2f) -> f32 { return fract(52.9829189 * fract(dot(p, vec2f(.06711056, .00583715)))); }
fn hs(x: f32) -> f32 { return fract(sin(x * 127.1) * 43758.5453); }
fn kd(z: f32) -> vec3f { return mix(KD, KDZ, z); }
fn sg(z: f32) -> vec3f { return mix(SIG, vec3f(.034, .026, .022), z); }
fn fin(c: vec3f) -> vec4f { return vec4f(min(max(c, vec3f(0.)), vec3f(40.)), 1.); }
const KDF = vec3f(.043, .045, .042);
fn fogIn(ro: vec3f, rd: vec3f, d: f32, z: f32, sun: vec3f) -> vec3f {
  let k = mix(KD, KDF, z) * DK;
  let a = sg(z) - k * rd.y;
  let I = (1. - exp(-a * d)) / a;
  let mu = max(dot(rd, sun), 0.);
  let m2 = mu * mu;
  return mix(WCOL, PCOL, z) * sg(z) * exp(k * ro.y) * I * (1.22 + .3 * m2 * m2);
}
`;

const S_B = S_G + /*wgsl*/`
@group(0) @binding(0) var<uniform> g: G;
@group(0) @binding(1) var sR: sampler;
@group(0) @binding(2) var sC: sampler;
@group(0) @binding(3) var sS: sampler_comparison;
@group(0) @binding(4) var tSh: texture_depth_2d;
@group(0) @binding(5) var tW: texture_2d<f32>;
@group(0) @binding(6) var tD: texture_2d<f32>;
@group(0) @binding(7) var tM: texture_2d<f32>;
@group(0) @binding(8) var tB: texture_2d<f32>;
// Flexion d'une algue : chaque tige est une chaîne de 8 points simulée sur le processeur (kelpSim.js).
// col = numéro de tige + 1 (0 = aucune), h = hauteur le long de la tige (m). Renvoie le déplacement.
fn bend(col: f32, h: f32) -> vec3f {
  if (col < .5) { return vec3f(0.); }
  let id = i32(col + .5) - 1; let base = vec2i((id % 64) * 8, id / 64);
  let f = clamp(h / max(textureLoad(tB, base, 0).w, .1), 0., 1.) * 7.;
  let k = i32(min(floor(f), 6.));
  return mix(textureLoad(tB, base + vec2i(k, 0), 0).xyz, textureLoad(tB, base + vec2i(k + 1, 0), 0).xyz, f - f32(k));
}
fn shUV(p: vec3f) -> vec3f { let s = g.sm * vec4f(p, 1.); return vec3f(s.x * .5 + .5, .5 - s.y * .5, select(s.z - .0007, 0., max(abs(s.x), abs(s.y)) > .98)); }
fn shadow1(p: vec3f) -> f32 { let s = shUV(p); return textureSampleCompareLevel(tSh, sS, s.xy, s.z); }
fn shadow4(p: vec3f) -> f32 {
  let s = shUV(p); let e = 1.8 / ${SHADOW}.;
  return (textureSampleCompareLevel(tSh, sS, s.xy + vec2f(-e, -e), s.z) + textureSampleCompareLevel(tSh, sS, s.xy + vec2f(e, -e), s.z)
        + textureSampleCompareLevel(tSh, sS, s.xy + vec2f(-e, e), s.z) + textureSampleCompareLevel(tSh, sS, s.xy + vec2f(e, e), s.z)) * .25;
}
fn shadow9(p: vec3f) -> f32 {
  if (LOW) { return shadow1(p); }
  let s = shUV(p); let e = 2.1 / ${SHADOW}.; var a = 0.;
  for (var x = -1; x <= 1; x++) { for (var y = -1; y <= 1; y++) { a += textureSampleCompareLevel(tSh, sS, s.xy + vec2f(f32(x), f32(y)) * e, s.z); } }
  return a / 9.;
}
fn cuv(p: vec3f) -> vec2f { return p.xz - g.sun.xz * (p.y / g.sun.y); }
fn caus(p: vec3f, d: f32) -> vec3f {
  let q = cuv(p);
  let o = vec2f(.004, .0025);
  let a = vec3f(textureSample(tW, sR, q / 3.3 + o).r, textureSample(tW, sR, q / 3.3).r, textureSample(tW, sR, q / 3.3 - o).r);
  let b = textureSample(tW, sR, q.yx / 6.9 + .37).r;
  let c = min(pow(a, vec3f(2.3)) * 5. * (.45 + b * 1.3), vec3f(4.));
  return mix(c, vec3f(.33), ss(35., 100., d));
}
fn caus2(p: vec3f, d: f32) -> f32 {
  let q = cuv(p);
  let c = min(pow(textureSample(tW, sR, q / 4.1).r, 1.4) * 2.6 * (.45 + textureSample(tW, sR, q.yx / 6.9 + .37).r * 1.3), 2.6);
  return mix(c, .33, ss(35., 100., d));
}
fn sunE(y: f32, z: f32) -> vec3f { return SUNC * exp(kd(z) * DK * (min(y, 0.) / g.sun.y)) * (.5 + .5 * sat(-y / 30.)) * g.fx.y; }
fn vol(p: vec3f) -> vec4f { return vec4f(1.); }
fn muv(p: vec3f) -> vec2f { return vec2f((p.x + 210.) / 420., (p.z + 1180.) / 1400.); }
fn amb(p: vec3f, n: vec3f, sky: f32, z: f32) -> vec3f {
  let up = n.y * .5 + .5;
  return mix(vec3f(.22, .60, .80), vec3f(.34, .56, .82), z) * exp(kd(z) * DK * min(p.y, 0.) * 1.2) * (.3 + .7 * sky) * (.24 + .76 * up * up) * 1.3 * (.55 + .45 * sat(-p.y / 30.)) + vec3f(.003, .010, .016);
}
fn zone(p: vec3f) -> f32 { return 0.; }
fn side(p: vec3f, n: vec3f, open: f32, z: f32) -> vec3f { return mix(WCOL, PCOL, z) * exp(kd(z) * DK * min(p.y, 0.)) * open * (1. - abs(n.y)) * .7; }
// skylight at most 150 m along the ray: past that, terrain and the background behind it (vsB) get the same haze
fn fog(c: vec3f, wp: vec3f, z: f32) -> vec3f {
  let v = wp - g.cam.xyz; let d = length(v); let rd = v / d;
  return c * exp(-sg(z) * d) * ss(230., 185., d) + fogIn(g.cam.xyz, rd, d, z, g.sun.xyz) * g.fx.y + GLOWC * g.fx.x * (1. - exp(-.02 * d));
}
// Lumières du jeu (phare, veilleuses, portail) : éclairement reçu en p, atténué par l'eau.
// two = 1 pour les surfaces fines (feuilles) éclairées des deux côtés.
fn lightAt(i: i32, p: vec3f) -> vec4f {
  let v = g.lp[i].xyz - p; let d = length(v); let r = g.lp[i].w;
  let w = sat(1. - pow(d / r, 4.));
  var a = w * w / max(pow(d, g.lc[i].w), .05);
  let l = v / max(d, 1e-3);
  if (g.ld[i].w > -1.5) { a *= ss(g.ld[i].w, mix(g.ld[i].w, 1., .5), dot(-l, g.ld[i].xyz)); }
  return vec4f(l, a);
}
fn lights(p: vec3f, n: vec3f, two: f32) -> vec3f {
  var s = vec3f(0.);
  for (var i = 0; i < i32(g.fx.z); i++) {
    let la = lightAt(i, p); let nl = dot(n, la.xyz);
    s += g.lc[i].rgb * exp(-SIG * distance(g.lp[i].xyz, p)) * la.w * mix(sat(nl), abs(nl) * .7 + .3, two);
  }
  return s;
}
fn lightsVol(p: vec3f) -> vec3f {
  var s = vec3f(0.);
  for (var i = 0; i < i32(g.fx.z); i++) { s += g.lc[i].rgb * exp(-SIG * distance(g.lp[i].xyz, p)) * lightAt(i, p).w; }
  return s;
}
fn qrot(q: vec4f, v: vec3f) -> vec3f { return v + 2. * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
`;

// ---------------------------------------------------------------- objets du jeu (maillages Three.js) + roche et fond
const W_MESH = S_B + /*wgsl*/`
@group(1) @binding(0) var tT: texture_2d<f32>;
struct MI { @location(0) p: vec3f, @location(1) n: vec3f, @location(2) c: vec3f, @location(3) uv: vec2f, @location(4) ax: vec2f,
  @location(5) m0: vec4f, @location(6) m1: vec4f, @location(7) m2: vec4f, @location(8) m3: vec4f,
  @location(9) col: vec4f, @location(10) emi: vec4f, @location(11) par: vec4f };
struct MO { @builtin(position) cp: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) op: vec3f, @location(3) on: vec3f,
  @location(4) c: vec3f, @location(5) uv: vec2f, @location(6) glow: f32,
  @location(7) @interpolate(flat) col: vec4f, @location(8) @interpolate(flat) emi: vec4f, @location(9) @interpolate(flat) par: vec4f };
// par : x = type de surface, y = drapeaux (1 facettes, 2 nage, 4 additif, 8 couleurs par sommet, 16 battement d'ailes), z et w = paramètres du type
@vertex fn vs(i: MI) -> MO {
  var o: MO;
  var lp = i.p;
  let fl = u32(i.par.y + .5);
  if ((fl & 2u) != 0u) { lp.x += sin(g.cam.w * 9. + dot(i.m3.xyz, vec3f(1.3, .7, 1.1)) - i.ax.x * 5.) * (.012 + .16 * i.ax.x * i.ax.x); }
  // battement d'ailes (raies) : aU = position le long de l'aile (−1..1), l'onde part du corps vers la pointe
  if ((fl & 16u) != 0u) {
    let au = abs(i.ax.x); let ph = g.cam.w * 1.5 + dot(i.m3.xyz, vec3f(.37, .21, .29));
    lp.y += pow(au, 1.5) * sin(ph - au * 1.3) * .42 * i.emi.a;
  }
  let w = i.m0.xyz * lp.x + i.m1.xyz * lp.y + i.m2.xyz * lp.z + i.m3.xyz;
  o.cp = g.vp * vec4f(w, 1.); o.wp = w;
  o.n = cross(i.m1.xyz, i.m2.xyz) * i.n.x + cross(i.m2.xyz, i.m0.xyz) * i.n.y + cross(i.m0.xyz, i.m1.xyz) * i.n.z;
  let sc = length(i.m0.xyz);
  o.op = lp * sc + i.par.w * 37.; o.on = i.n;
  o.c = select(vec3f(1.), i.c, (fl & 8u) != 0u); o.uv = i.uv; o.glow = i.ax.y; o.col = i.col; o.emi = i.emi; o.par = i.par;
  return o;
}
struct TP { h: f32, c: f32, n: vec3f };
fn tri(p: vec3f, n: vec3f, s: f32) -> TP {
  var w = pow(abs(n), vec3f(4.)); w /= (w.x + w.y + w.z);
  let x = textureSample(tD, sR, p.zy * s); let y = textureSample(tD, sR, p.xz * s); let z = textureSample(tD, sR, p.xy * s);
  var o: TP;
  o.h = x.b * w.x + y.b * w.y + z.b * w.z;
  o.c = x.a * w.x + y.a * w.y + z.a * w.z;
  let a = x.rg * 2. - 1.; let b = y.rg * 2. - 1.; let c = z.rg * 2. - 1.;
  o.n = vec3f(0., a.y, a.x) * w.x + vec3f(b.x, 0., b.y) * w.y + vec3f(c.x, c.y, 0.) * w.z;
  return o;
}
// Roche stratifiée et fond marin (d'après Abyssal Garden) : par.x = 1 rocher, 2 fond (couleur de zone par sommet)
@fragment fn fsRock(i: MO) -> @location(0) vec4f {
  let ground = i.par.x > 1.5;
  let n0 = normalize(i.n); let on = n0;
  let op = i.wp + i.par.w * 37.;
  let dist = length(i.wp - g.cam.xyz);
  let A = tri(op, on, .1); let B = tri(op, on, .43); let C = tri(op, on, 1.9); let F = tri(op, on, 6.7); let fk = ss(10., 1.5, dist);
  let big = textureSample(tD, sR, op.xz * .013 + op.y * .021).a;
  let big2 = textureSample(tD, sR, op.zx * .031 + op.y * .043 + .37).a;
  let gm = textureSample(tM, sC, muv(i.wp));
  let ca = caus(i.wp, dist);
  let hgt = A.h * .5 + B.h * .35 + C.h * .15;
  let flt = ss(.72, .93, n0.y);
  // strates grises / olive / brunes, plaques d'encroûtement chaudes, algues sur le dessus
  let st = op.y * .55 + A.h * 1.6 + big * 5. + big2 * 3.;
  let bed = hs(floor(st)); let sf = fract(st);
  var alb = mix(vec3f(.11, .12, .13), vec3f(.33, .30, .25), sat(A.c * 1.5 - .25));
  alb = mix(alb, mix(vec3f(.26, .19, .10), vec3f(.20, .22, .14), bed), ss(.42, .66, big) * .7);
  alb *= mix(.72, 1.15, bed) * (1. - .45 * ss(.12, .0, sf) * (1. - abs(on.y)));
  // la vie s'accroche près de la surface ; en profondeur la roche reste nue et sombre
  let life = ss(-420., -90., i.wp.y);
  let enc = ss(.46, .6, big2 * .6 + B.c * .5) * ss(.3, .6, hgt) * life;
  alb = mix(alb, mix(vec3f(.34, .07, .10), vec3f(.40, .25, .07), ss(.45, .6, A.c)) * (.5 + .8 * B.h), enc * .75);
  alb = mix(alb, vec3f(.50, .50, .46) * (.5 + .7 * C.h), ss(.60, .70, B.c * .6 + C.c * .5) * .5);
  let alg = ss(-.1, .6, n0.y) * ss(.3, .52, B.c * .55 + big * .5) * life;
  alb = mix(alb, vec3f(.035, .14, .07), alg * .8);
  alb *= (.22 + 1.3 * hgt) * mix(1., .62 + .76 * F.h, fk);
  let sgro = -ss(.14, .0, sf) * (1. - abs(on.y)) * 1.2;
  var flu = 0.; var rip = 0.;
  if (ground) {
    let zc = i.c / max(max(i.c.r, max(i.c.g, i.c.b)), .02);
    alb *= mix(vec3f(1.), zc, .35) * mix(.55, 1., life);
    alb = mix(alb, i.c * 1.25 * (.55 + .6 * B.h), flt * (.35 + .65 * gm.a) * .8);
    let mg = flt * sat(gm.r * 1.5 - .45 + (B.c - .5) * 1.6) * ss(.35, .6, A.h);
    alb = mix(alb, mix(vec3f(.20, .02, .12), vec3f(.03, .16, .07), gm.g) * (.4 + .9 * B.h), mg * .8);
    flu = mg * .35;
    rip = flt * gm.a * cos((i.wp.x * .8 + i.wp.z * .35) * 5. + A.c * 9.) * .65;
  } else { alb *= i.col.rgb; }
  let N = normalize(on + (A.n * .85 + B.n * .65 + C.n * .45 * ss(60., 12., dist) + F.n * .5 * fk) * 1.7 + vec3f(.8, sgro, .35) * vec3f(rip, 1., rip));
  let L = g.sun.xyz; let V = normalize(g.cam.xyz - i.wp);
  let ao = ss(.12, .6, hgt);
  let E = sunE(i.wp.y, 0.) * shadow9(i.wp + n0 * .35);
  let ndl = sat(dot(N, L));
  let am = (amb(i.wp, N, 1., 0.) + side(i.wp, N, 1., 0.)) * ao;
  let dl = E * ndl * (.10 + mix(vec3f(.33), ca, ss(.1, .45, dot(n0, L))) * 2.5) + lights(i.wp, N, 0.) * (.35 + .65 * ao);
  var c = alb * (dl + am) + alb * flu * dot(dl + am, vec3f(.1, .5, .5));
  let H = normalize(V + L);
  c += E * (.25 + ca) * pow(sat(dot(N, H)), 14.) * .18 * ndl;
  // près de la déchirure, le fond se fissure : des veines de lumière verte qui battent avec elle (g.fx.x)
  let vein = (ss(.035, 0., abs(big2 - .5)) + ss(.02, 0., abs(B.c - .5)) * .6) * ss(.25, .6, gm.g);
  c += vec3f(.2, 1., .4) * vein * gm.g * g.fx.x * 1.5;
  return fin(fog(c, i.wp, 0.));
}
fn rhash(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453); }
fn rnoise(p: vec2f) -> f32 {
  let i = floor(p); var f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(rhash(i), rhash(i + vec2f(1., 0.)), f.x), mix(rhash(i + vec2f(0., 1.)), rhash(i + vec2f(1., 1.)), f.x), f.y);
}
fn ecg(p: f32) -> f32 {
  return .12 * exp(-pow((p - .12) / .03, 2.)) - .15 * exp(-pow((p - .28) / .008, 2.)) + exp(-pow((p - .30) / .010, 2.))
       - .30 * exp(-pow((p - .32) / .010, 2.)) + .22 * exp(-pow((p - .52) / .05, 2.));
}
// La déchirure du portail : open = ouverture, beat = phase du cœur, near = proximité (le tracé apparaît)
// zip = part déjà refermée, depuis le bas (−1 = intacte) : la plaie se recoud à mesure qu'on la tire
fn rift(uv: vec2f, open: f32, beat: f32, near: f32, zip: f32) -> vec3f {
  let t = g.cam.w; let y = uv.y;
  let profile = pow(max(sin(3.14159 * y), 0.), .6);
  let wave = sin(y * 9. + t * 1.1) * .05 + (rnoise(vec2f(y * 7., t * .6)) - .5) * .12;
  let halfW = (.12 + rnoise(vec2f(y * 30., t * 2.)) * .05) * profile * open * ss(zip - .05, zip + .03, y);
  let x = uv.x - .5 - wave * profile; let ax = abs(x);
  let inside = 1. - ss(halfW * .55, halfW + 1e-4, ax);
  let lip = ss(halfW * .35, halfW * .9 + 1e-4, ax) * inside;
  let swirl = rnoise(vec2f(uv.x * 5. + t * .25, y * 8. - t * .7));
  let deep = mix(vec3f(.03, .16, .07), vec3f(.75, .95, .78), pow(swirl, 3.) * .7);
  let s = fract(y * 1.3 - beat);
  let d = abs(x - ecg(s) * mix(.06, .13, near) * profile);
  let line = exp(-d * 260.) * 1.4 + exp(-d * 60.) * .35;
  let bg = .6 + .4 * exp(-pow((fract(beat) - .3) / .06, 2.));
  var col = deep * inside + vec3f(.45, 1., .55) * lip * 1.2;
  col += vec3f(.8, 1., .85) * line * mix(.3, 2.2, near) * bg * step(.001, inside + near * .5);
  col += vec3f(.25, .8, .35) * exp(-ax * 7. / max(open, .05)) * profile * .4 * open * bg;
  // le point de couture : là où la pince serre, la lumière se concentre
  col += vec3f(.9, 1., .9) * exp(-pow((y - zip) * 30., 2.)) * exp(-abs(uv.x - .5) * 18.) * step(0., zip) * 3.;
  return col * 2.2;
}
// Types : 0 peint, 3 bois, 4 métal, 5 sans éclairage (écrans), 6 déchirure, 7 colonne de lumière, 8 peau, 9 halo,
//         10 verre, 11 coque peinte (tôles, rivets), 12 corail, 13 éponge, 14 filet
@fragment fn fs(i: MO) -> @location(0) vec4f {
  let kind = i32(i.par.x + .5); let fl = u32(i.par.y + .5);
  let tx = textureSample(tT, sR, i.uv);
  let D = tri(i.op, normalize(i.on + vec3f(1e-4, 2e-4, 3e-4)), .43);
  let Ws = textureSample(tD, sR, vec2f((i.op.x + i.op.z) * .9, i.op.y * .07));
  let Wk = textureSample(tD, sR, vec2f(i.op.z * .11 + i.op.y * 1.9, i.op.y * 5. + i.op.x * 4.3));
  let dist = length(i.wp - g.cam.xyz);
  let ca = caus2(i.wp, dist);
  let V = normalize(g.cam.xyz - i.wp);
  var n = normalize(i.n + vec3f(0., 1e-6, 0.));
  let fnr = normalize(cross(dpdy(i.wp), dpdx(i.wp)));
  if ((fl & 1u) != 0u) { n = fnr; }
  if (dot(n, V) < 0.) { n = -n; }
  let sh = shadow4(i.wp + n * .3);
  var alb = i.col.rgb * i.c * tx.rgb;
  var gloss = .12; var bump = .25; var flu = 0.;
  if (kind == 3) { alb *= .55 + .9 * D.h; bump = .7; }
  else if (kind == 4) { alb = mix(alb, vec3f(.20, .09, .04) * (.5 + D.h), ss(.5, .72, D.c) * .45) * (.7 + .5 * D.h); gloss = .5; bump = .5; }
  else if (kind == 11) {
    // coque peinte : tôles jointes tous les 1,2 m, rivets le long des joints, coulures verticales
    let sz = abs(fract(i.op.z / 1.2) - .5) * 1.2;
    let seam = 1. - ss(0., .02, sz);
    let riv = ss(.024, .012, length(vec2f(sz - .07, (fract(atan2(i.op.y, i.op.x) * 5.) - .5) * .22)));
    alb *= (1. - .5 * seam) * (.84 + .3 * D.c) * (.8 + .4 * Ws.b);
    alb = mix(alb, alb * 1.4 + .015, riv * .7);
    gloss = .62; bump = .12;
    // dégâts (g.subv.w = 0 intacte … 1 en ruine) : longues rayures de métal à nu, plaques de suie, tôles cabossées
    let dmg = g.subv.w;
    let scr = ss(.74 - dmg * .34, .78 - dmg * .34, Wk.a) * ss(.02, .25, dmg);
    let soot = ss(.62 - dmg * .3, .8 - dmg * .2, D.c * .6 + Ws.a * .5) * dmg;
    alb = mix(alb * (1. - soot * .8), vec3f(.52, .54, .55), scr * .85);
    gloss = mix(gloss, .9, scr); bump += dmg * .9;
  }
  else if (kind == 12) {
    let hue = fract(i.par.w * 5.73);
    var cc = mix(vec3f(.80, .08, .10), vec3f(.90, .22, .40), fract(hue * 4.));
    if (hue > .7) { cc = vec3f(.88, .42, .10); }
    if (hue > .9) { cc = vec3f(.55, .22, .75); }
    alb = cc * i.c * (.4 + .8 * D.h); flu = .75; gloss = .25; bump = 1.2;
  }
  else if (kind == 13) {
    let hue = fract(i.par.w * 7.31);
    var cc = mix(vec3f(.60, .17, .08), vec3f(.64, .35, .10), fract(hue * 3.));
    if (hue > .75) { cc = vec3f(.44, .18, .42); }
    alb = cc * i.c * (.45 + .75 * D.h); flu = .55; gloss = .2; bump = 1.1;
  }
  else { alb *= .92 + .16 * D.h; bump = .08; }
  var a = i.col.a * tx.a;
  // filet : mailles en losange dessinées par les UV (en mètres) ; de loin, un voile régulier
  let q = vec2f(i.uv.x + i.uv.y, i.uv.x - i.uv.y) * i.par.z;
  let fw = fwidth(q) * 1.5; // (les dérivées se calculent hors de toute condition)
  if (kind == 14) {
    let d = min(fract(q), 1. - fract(q));
    let ln = max(1. - ss(.085, .085 + fw.x, d.x), 1. - ss(.085, .085 + fw.y, d.y));
    a *= mix(ln, .32, sat(max(fw.x, fw.y) * 1.6));
    alb *= .7 + .6 * D.h;
  }
  var c = vec3f(0.);
  if (kind == 5) { c = alb + i.emi.rgb; }
  else if (kind == 6) { c = rift(i.uv, i.emi.a, i.par.z, i.par.w, i.col.r); }
  else if (kind == 7) { c = i.emi.rgb * i.par.z * pow(1. - i.uv.y, 2.); }
  else if (kind == 9) {
    let r = length(i.uv - .5) * 2.;
    c = alb * pow(sat(1. - r), 2.2);
    if (i.par.z > .5) { c = alb * (1. - ss(.012, .05, abs(r - .86))) * 1.6; } // anneau : contour d'un objet à ramasser
  }
  else {
    let N = normalize(n + D.n * bump);
    let L = g.sun.xyz;
    let E = sunE(i.wp.y, 0.) * sh;
    let ndl = sat(dot(N, L)); let ndv = sat(dot(N, V));
    let am = amb(i.wp, N, 1., 0.) + side(i.wp, N, 1., 0.) * .6;
    let li = lights(i.wp, N, 0.);
    let dl = E * ndl * (.3 + ca) + am + li;
    c = alb * dl + i.emi.rgb + alb * i.glow * 1.4 + alb * flu * dot(dl, vec3f(.1, .5, .5));
    c += (amb(i.wp, reflect(-V, N), 1., 0.) + li * .3) * gloss * pow(1. - ndv, 3.) * .7;
    if (kind == 10) {
      // verre : presque invisible de face, reflets rasants et éclats de lumière
      let fr = pow(1. - ndv, 3.);
      c = (amb(i.wp, reflect(-V, N), 1., 0.) + li * .5) * (.25 + fr) + E * pow(sat(dot(N, normalize(V + L))), 90.) * 2.;
      a = .025 + .4 * fr;
    }
    c += (E * (.3 + ca) * pow(sat(dot(N, normalize(V + L))), mix(10., 60., gloss)) + li * pow(ndv, 6.) * .5) * gloss;
    if (kind == 8) {
      let ir = .5 + .5 * cos(TAU * (vec3f(0., .33, .67) + ndv * 1.1 + i.par.w * 3. + .55));
      c += (am + li * .6 + E * .3) * (mix(vec3f(.45, .7, .7), ir, i.par.z) * pow(1. - ndv, 3.) * 1.1 + alb * .5 * pow(1. - ndv, 1.5));
    }
  }
  if ((fl & 4u) != 0u) { return vec4f(min(c * a * exp(-SIG * dist * select(1., .25, kind == 6)), vec3f(30.)), 0.); }
  return vec4f(min(max(fog(c, i.wp, 0.), vec3f(0.)), vec3f(40.)) * a, a);
}
`;

// ---------------------------------------------------------------- leaves (kelp, grasses, ground cover)
const W_LEAF = S_B + /*wgsl*/`
override ROWS: f32 = 7.;
override FAR: f32 = 150.;
struct LI { @location(0) a: vec4f, @location(1) b: vec4f, @location(2) c: vec4f, @location(3) col: f32 };
struct LO { @builtin(position) cp: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f,
  @location(3) @interpolate(flat) col: vec3f, @location(4) @interpolate(flat) pr: vec4f,
  @location(5) @interpolate(flat) sd: vec2f, @location(6) @interpolate(flat) spc: vec3f };
fn sway(p: vec2f, h: f32, t: f32) -> vec2f {
  let ph = dot(p, vec2f(.031, .017));
  let a = .024 * pow(max(h, 0.), 1.25);
  return a * (vec2f(sin(t * .5 + ph + h * .09), cos(t * .37 + ph * 1.3 + h * .07)) + .35 * vec2f(sin(t * 1.3 + ph * 3. + h * .3), cos(t * 1.1 + ph * 2. + h * .23)));
}
fn shape2(v: f32) -> f32 { return sin(3.14159 * sat(v)); }
fn pal(h: f32) -> vec3f {
  if (h < .3) { return vec3f(1., .62, .08); }
  if (h < .6) { return vec3f(.12, 1., .22); }
  if (h < .8) { return vec3f(.2, .85, 1.); }
  return vec3f(1., .3, .8);
}
@vertex fn vs(@builtin(vertex_index) vi: u32, i: LI) -> LO {
  var o: LO;
  let u = f32(vi & 1u) * 2. - 1.; let v = sin(f32(vi >> 1u) / (ROWS - 1.) * 1.5708);
  let ty = i32(i.c.x * 255. + .5); let s1 = i.c.y; let s2 = i.c.z;
  let t = g.cam.w;
  let len = i.a.w; let hA = i.b.w;
  let cy = cos(i.b.x); let sy = sin(i.b.x); let ct = cos(i.b.y); let st = sin(i.b.y);
  let d = vec3f(st * cy, ct, st * sy); let pe = vec3f(ct * cy, -st, ct * sy); let sd = vec3f(-sy, 0., cy);
  // per type: x sparkle prob, y translucency, z iridescence, w emissive
  var col = vec3f(0.); var pr = vec4f(0.); var spc = vec3f(0.); var shp = vec2f(.75, .7); var wav = 1.; var fls = 1.;
  let hsel = hs(s1 * 13.7 + s2 * 71.3);
  switch ty {
    case 0 { col = mix(vec3f(.11, .125, .022), vec3f(.04, .10, .04), s1); col = mix(col, vec3f(.25, .17, .025), step(.72, s2)); pr = vec4f(.24, .9, 0., 0.); spc = pal(hsel * .72); shp = vec2f(.5, .32); wav = 1.9; }
    case 1 { col = vec3f(.10, .11, .035); pr = vec4f(0., .2, 0., 0.); shp = vec2f(.05, .1); wav = .3; fls = .3; }
    case 2 { col = mix(vec3f(.05, .20, .16), vec3f(.12, .26, .22), s1); col = mix(col, vec3f(.30, .14, .24), step(.85, s2)); pr = vec4f(.05, 1.0, .25, 0.); spc = vec3f(.6, 1., .9); shp = vec2f(.45, .35); wav = 2.2; }
    case 3 { col = mix(vec3f(.02, .05, .065), vec3f(.05, .03, .08), s1); col = mix(col, vec3f(.09, .03, .09), step(.8, s2)); pr = vec4f(.2, .85, .55, .02); spc = mix(vec3f(.5, .35, 1.), vec3f(.2, 1., .7), step(.6, hsel)); shp = vec2f(.7, .6); wav = 2.4; }
    case 4 { col = mix(vec3f(.30, .15, .02), vec3f(.42, .25, .04), s1); pr = vec4f(.2, 1., .1, 0.); spc = vec3f(1., .85, .5); shp = vec2f(.5, .4); wav = 1.8; }
    case 5 { col = mix(vec3f(.85, .05, .40), vec3f(.60, .10, .80), step(.7, s1)); col = mix(col, vec3f(.95, .25, .55), step(.75, s2)); pr = vec4f(.22, .8, 0., .30); spc = vec3f(1., .35, .8); shp = vec2f(.6, .6); fls = 2.; }
    case 6 { col = mix(vec3f(.80, .16, .16), vec3f(.92, .36, .42), s1); pr = vec4f(.06, 1., 0., .10); spc = vec3f(1., .5, .5); shp = vec2f(.4, .3); wav = 2.; }
    case 8 { col = mix(vec3f(.05, .50, .16), vec3f(.20, .62, .22), s1); pr = vec4f(.3, 1., 0., 1.4); spc = vec3f(.4, 1., .5); shp = vec2f(.55, .5); wav = 1.6; }
    default { col = mix(vec3f(.05, .40, .36), vec3f(.10, .52, .58), s1); pr = vec4f(.1, .9, .2, .04); spc = vec3f(.3, 1., .9); shp = vec2f(.6, .5); }
  }
  pr.x = step(hs(s1 * 91.7 + s2 * 37.1 + i.b.x), pr.x);
  let k = (i.c.w - .3) * 2.0 + sin(t * (.8 + s1) * fls + s2 * 40. + hA * .25) * .10 * fls;
  let wph = v * (3. + 5. * s2) + s1 * 30. + t * 1.1;
  let wv = sin(wph) * .12 * wav;
  let kq = k * 1.7; let ka = select(kq, .06, abs(kq) < .06);
  let sK = sin(ka * v); let cK = cos(ka * v);
  let c = i.a.xyz + len * (d * (sK / ka) + pe * ((1. - cK) / ka + wv * v));
  let sl = sK + wv + cos(wph) * .10 * wav * v * (3. + 5. * s2);
  let N = normalize(pe * cK - d * sl); let T0 = normalize(d * cK + pe * sl);
  let tw = (s1 - .5) * 2.4 * v + sin(t * .9 + s2 * 20.) * .25 * v;
  let S = sd * cos(tw) + N * sin(tw); let N2 = N * cos(tw) - sd * sin(tw);
  let shape = pow(max(sin(3.14159 * pow(v, shp.x)), 0.), shp.y);
  let shp_ = g.res.x == 0.;
  let cd = distance(i.a.xyz, g.cam.xyz); let far = FAR * g.mis.z;
  let nearK = select(1. - ss(26., 40., cd), 0., shp_);
  let farK = select((1. - ss(far * .8, far, cd)) * ss(.6, 2.2, distance(c, g.cam.xyz)) * ss(len * 1.1 + .5, len * 2.2 + 1.2, distance(i.a.xyz + d * (len * .5), g.cam.xyz)), 1., shp_);
  let ruf = sin(v * 10. + s2 * 30. + t * .6) * i.b.z * .36 * u * shape2(v) * nearK;
  var p = c + S * (u * farK * select(i.b.z * .5 * shape, select(max(i.b.z * .5, .09) * shape, 0., ty == 1), shp_));
  p += N2 * ruf;
  let sw = sway(i.a.xz, hA + (p.y - i.a.y), t);
  p.x += sw.x; p.z += sw.y;
  // La tige plie comme une chaîne de points quand le sous-marin passe (voir bend)
  p += bend(i.col, hA + (p.y - i.a.y));
  o.cp = g.vp * vec4f(p, 1.); o.wp = p; o.n = normalize(N2 + S * u * .55 - T0 * cos(v * 10. + s2 * 30. + t * .6) * u * .7 * nearK); o.uv = vec2f(u, v);
  o.col = col; o.pr = pr; o.sd = vec2f(s1, s2); o.spc = spc;
  return o;
}
struct GO { @builtin(position) cp: vec4f, @location(0) uv: vec2f, @location(1) @interpolate(flat) col: vec3f };
@vertex fn vsGl(@builtin(vertex_index) vi: u32, @location(0) a: vec4f, @location(1) b: vec4f) -> GO {
  var o: GO; let q = vec2f(f32(vi & 1u), f32(vi >> 1u)) * 2. - 1.; let t = g.cam.w;
  var p = a.xyz; let sw = sway(a.xz, a.w, t); p.x += sw.x; p.z += sw.y;
  p += bend(b.w, a.w); // les étincelles suivent la tige qui plie
  p += .1 * vec3f(sin(t * .7 + b.x * 50.), sin(t * .9 + b.x * 70.), cos(t * .8 + b.x * 90.));
  let d = length(p - g.cam.xyz);
  if (d > 120. || dot(p - g.cam.xyz, g.fwd.xyz) < -1.) { o.cp = vec4f(0., 0., 2., 1.); return o; }
  let tw = pow(.5 + .5 * sin(t * (.35 + .9 * hs(b.x)) + b.x * 100.), 4.);
  let sz = min(max(b.z, d * .0026), d * .0045);
  let w = p + (g.right.xyz * q.x + g.up.xyz * q.y) * sz;
  o.cp = g.vp * vec4f(w, 1.); o.uv = q;
  let z = zone(p);
  let lit = .3 + 1.8 * shadow1(p) * sunE(p.y, z).g;
  let e = b.z / sz;
  o.col = pal(b.y) * (.12 + tw * 1.7) * lit * e * e * exp(-SIG.g * d) * ss(.4, 1.5, d) * 17.;
  return o;
}
@fragment fn fsGl(i: GO) -> @location(0) vec4f {
  let r = dot(i.uv, i.uv);
  return vec4f(min(i.col * exp(-r * 7.) * (1. - ss(.7, 1., r)), vec3f(10.)), 0.);
}
@fragment fn fs(i: LO, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  let dist = length(i.wp - g.cam.xyz);
  let ca = caus2(i.wp, dist);
  var n = normalize(i.n); if (!ff) { n = -n; }
  let V = normalize(g.cam.xyz - i.wp); let L = g.sun.xyz;
  let z = zone(i.wp);
  let lt = textureSample(tD, sR, vec2f(i.uv.x * .13 + i.sd.x * 3.7, i.uv.y * .8 + i.sd.y * 5.3));
  let vv = vol(i.wp + vec3f(0., .8, 0.));
  let E = sunE(i.wp.y, z) * shadow1(i.wp + L * .3);
  let ndl = dot(n, L);
  var alb = i.col * (.72 + .28 * ss(0., .25, abs(i.uv.x))) * mix(.5, 1.12, i.uv.y) * (1. - .45 * ss(30., 8., dist) * ss(.6, 1., sin(i.uv.y * 40. - abs(i.uv.x) * 7. + i.sd.x * 40.))) * (.58 + .42 * ss(0., .13, abs(i.uv.x))) * (.5 + 1.0 * lt.b) * (.65 + .7 * lt.a);
  let ndv = sat(dot(n, V));
  let ir = .5 + .5 * cos(TAU * (vec3f(0., .33, .67) + ndv * 1.1 + i.sd.x * .22 + i.uv.y * .5 + .55));
  alb = mix(alb, alb * .5 + ir * vec3f(.15, .13, .30), i.pr.z * (1. - ndv) * .8);
  let tr = (max(-ndl, 0.) * .85 + .15) * i.pr.y;
  let trc = alb * mix(vec3f(1.), vec3f(1.5, 1.4, .75), sat(i.pr.y) * (1. - i.pr.z));
  let aov = sat((vv.r - .5) * 6.) * mix(.4, 1., i.uv.y);
  let am = (amb(i.wp, n, vv.g, z) + amb(i.wp, -n, vv.g, z) * i.pr.y * .55 * vec3f(1.1, 1.15, .7) + side(i.wp, n, sat((vv.r - .5) * 4.), z) * .6) * (.3 + .7 * aov);
  var c = E * (.06 + ca * 1.5) * (alb * max(ndl, 0.) + trc * tr) + alb * am;
  let H = normalize(V + L);
  c += E * (pow(sat(dot(n, H)), 40.) * (.45 + ir * i.pr.z * 2.) + pow(sat(dot(n, H)), 9.) * .07) + am * ir * i.pr.z * pow(1. - ndv, 3.) * 1.5;
  c += E * trc * i.pr.y * pow(sat(dot(-V, L)), 3.) * 1.2;
  c += alb * i.pr.w * (.5 + 3. * dot(am + E * .3, vec3f(.1, .5, .5))) + i.col * max(i.pr.w - 1., 0.) * (.6 + .5 * i.uv.y);
  c += (alb + trc * .5 * i.pr.y) * lights(i.wp, n, 1.);
  // sparkle: whole-leaf glints that twinkle slowly
  let tw = pow(.5 + .5 * sin(g.cam.w * (.5 + i.sd.y * 1.4) + i.sd.x * 90.), 5.);
  let m = ss(.2, .0, abs(i.uv.y - (.35 + .45 * i.sd.y))) * (1. - i.uv.x * i.uv.x);
  let lit = .35 + E.g * 1.2;
  c += i.spc * i.pr.x * (.1 + tw) * m * lit * .6;
  return fin(fog(c, i.wp, z));
}
`;

// ---------------------------------------------------------------- water surface seen from below
const W_SURF = S_B + /*wgsl*/`
struct VO { @builtin(position) cp: vec4f, @location(0) wp: vec3f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> VO {
  var o: VO;
  let p = vec2f(f32(i & 1u), f32(i >> 1u)) * 2. - 1.;
  o.wp = vec3f(g.cam.x + p.x * 900., 0., g.cam.z + p.y * 900.);
  o.cp = g.vp * vec4f(o.wp, 1.);
  return o;
}
@fragment fn fs(i: VO) -> @location(0) vec4f {
  let v = i.wp - g.cam.xyz; let d = length(v); let V = v / d;
  let fl = ss(260., 60., d);
  let s = (textureSample(tW, sR, i.wp.xz / 13.).ba + textureSample(tW, sR, i.wp.zx / 4.7 + .2).ba * .7 + textureSample(tW, sR, i.wp.xz / 37. + .6).ba * .8) * fl;
  let n = normalize(vec3f(-s.x * .8, -1., -s.y * .8));
  let ci = sat(dot(V, -n));
  let k = 1. - 1.769 * (1. - ci * ci);
  let win = ss(0., .22, k);
  let rr = refract(V, n, 1.33);
  let sd = max(dot(rr, g.sun.xyz), 0.);
  let fr = pow(1. - sqrt(max(k, 0.)), 5.);
  let sky = (vec3f(.40, .62, .68) * 1.05 * clamp(1. + 3.8 * (s.x * .6 - s.y * .8), .25, 3.) + vec3f(1., .95, .85) * (pow(sd, 60.) * 1.3 + pow(sd, 500.) * 12.)) * (1. - fr);
  let z = zone(i.wp);
  let R = reflect(V, n);
  let refl = fogIn(i.wp, R, 300., z, g.sun.xyz) * 1.15;
  let c = mix(refl, sky, win);
  return fin(fog(c, i.wp, z));
}
// behind everything: where no terrain is drawn (it stops at ~240 m) the water looks as it does at that distance
@vertex fn vsB(@builtin(vertex_index) i: u32) -> VO {
  var o: VO;
  let p = vec2f(f32(i & 1u), f32(i >> 1u)) * 2. - 1.;
  o.wp = g.cam.xyz + g.fwd.xyz + g.right.xyz * (p.x * g.right.w) + g.up.xyz * (p.y * g.up.w);
  o.cp = vec4f(p, 0., 1.);
  return o;
}
@fragment fn fsB(i: VO) -> @location(0) vec4f {
  let p = g.cam.xyz + normalize(i.wp - g.cam.xyz) * 240.;
  return fin(fog(vec3f(0.), p, zone(p)));
}
`;

// ---------------------------------------------------------------- sprites: bubbles (alpha) and drifting particles (additive)
const W_SPR = S_B + /*wgsl*/`
struct VO { @builtin(position) cp: vec4f, @location(0) uv: vec2f, @location(1) @interpolate(flat) pr: vec4f, @location(2) wp: vec3f, @location(3) @interpolate(flat) lv: vec3f };
fn quad(i: u32) -> vec2f { return vec2f(f32(i & 1u), f32(i >> 1u)) * 2. - 1.; }
@vertex fn vsBub(@builtin(vertex_index) vi: u32, @location(0) a: vec4f, @location(1) b: vec4f) -> VO {
  var o: VO; let q = quad(vi); let t = g.cam.w;
  let life = fract(t * b.y / b.z + b.x);
  let h = life * b.z;
  var p = a.xyz + vec3f(0., h, 0.);
  let wob = b.w * (.3 + h * .035);
  p.x += sin(t * 1.7 + b.x * 50. + h * .6) * wob + sin(h * .13 + b.x * 9.) * b.w * 2.;
  p.z += cos(t * 1.3 + b.x * 33. + h * .5) * wob + cos(h * .11 + b.x * 7.) * b.w * 2.;
  let sz = a.w * (.55 + .7 * life) * ss(0., .03, life) * ss(0., -1.2, p.y);
  let w = p + (g.right.xyz * q.x + g.up.xyz * q.y) * sz;
  o.cp = g.vp * vec4f(w, 1.); o.uv = q; o.wp = p;
  o.pr = vec4f(b.x, sz, shadow1(p), 0.);
  return o;
}
@fragment fn fsBub(i: VO) -> @location(0) vec4f {
  let t = g.cam.w;
  let an = atan2(i.uv.y, i.uv.x + 1e-4);
  let big = ss(.04, .22, i.pr.y);
  let r = length(i.uv) / (.9 + big * .05 * sin(an * 3. + t * 5. + i.pr.x * 40.) + big * .02 * sin(an * 5. - t * 7.));
  let aa = fwidth(r) * 1.5;
  let disc = 1. - ss(1. - aa, 1., r);
  let rim = ss(.55, .98, r);
  let hl = ss(.34, .0, length(i.uv - vec2f(-.36, .42))) + .5 * ss(.2, .0, length(i.uv - vec2f(.4, -.42)));
  let z = zone(i.wp);
  let E = sunE(i.wp.y, z) * (.25 + .75 * i.pr.z);
  let hi = fogIn(i.wp, vec3f(0., 1., 0.), 80., z, g.sun.xyz) * 1.5;
  let lo = fogIn(i.wp, vec3f(0., -1., 0.), 80., z, g.sun.xyz);
  var c = mix(lo, hi, ss(-.5, .8, i.uv.y + rim * .4)) * (.5 + 1.2 * rim) + E * hl * 1.6;
  var al = disc * sat(.03 + rim * rim * rim * .9 + hl);
  let v = i.wp - g.cam.xyz; let d = length(v);
  let T = exp(-SIG.g * d) * ss(1.2, 3., d);
  c = c * T + fogIn(g.cam.xyz, v / d, d, z, g.sun.xyz) * (1. - T);
  al *= mix(.35, 1., T);
  return vec4f(min(max(c * al, vec3f(0.)), vec3f(20.)), al);
}
// Particules du jeu : a = position + taille (m), b = couleur + type (0 bulle, 1 lueur)
@vertex fn vsPt(@builtin(vertex_index) vi: u32, @location(0) a: vec4f, @location(1) b: vec4f) -> VO {
  var o: VO; let q = quad(vi);
  let d = length(a.xyz - g.cam.xyz);
  var sz = max(a.w, d * .0016);
  var col = vec3f(0.); var kind = b.w; var zb = 1.;
  if (b.w > 1.5) {
    // Écho du sonar (type 2) : les points apparaissent au passage de l'onde partie du sous-marin
    // (g.sub.w = âge de l'onde en secondes), brillent, puis s'éteignent. Ni brouillard ni obscurité.
    let ds = distance(a.xyz, g.sub.xyz); let front = g.sub.w * ${ECHO_SPEED}.;
    let vis = step(ds, front) * step(0., g.sub.w) * (1. - ss(6., 9., g.sub.w)) * (.55 + 3. * exp(-abs(ds - front) * .1));
    // taille en pixels (≈ 3 px de rayon), quelle que soit la résolution
    sz = max(a.w, d * g.up.w / g.res.y * 3.);
    col = b.rgb * vis * 1.8; kind = 1.; zb = 1.04;
  } else {
    let lit = select(vec3f(1.), sunE(a.y, 0.) * .5 + amb(a.xyz, vec3f(0., 1., 0.), 1., 0.) + lightsVol(a.xyz) * .5, b.w < .5);
    col = b.rgb * lit * exp(-SIG * d) * min(1., a.w / sz);
  }
  o.cp = g.vp * vec4f(a.xyz + (g.right.xyz * q.x + g.up.xyz * q.y) * sz, 1.); o.uv = q; o.wp = a.xyz;
  o.cp.z *= zb; // l'écho passe juste devant la surface qu'il dessine
  o.lv = col;
  o.pr = vec4f(kind, 0., 0., 0.);
  return o;
}
@fragment fn fsPt(i: VO) -> @location(0) vec4f {
  let r = length(i.uv);
  var m = ss(1., .1, r);
  if (i.pr.x < .5) { m = ss(.5, .95, r) * ss(1., .93, r) + ss(.3, 0., length(i.uv - vec2f(-.35, .4))) * 1.5; }
  return vec4f(min(i.lv * m, vec3f(12.)), 0.);
}
@vertex fn vsSnow(@builtin(vertex_index) vi: u32, @location(0) a: vec4f) -> VO {
  var o: VO; let q = quad(vi); let t = g.cam.w;
  let B = 44.;
  var p = a.xyz * B + vec3f(t * .22, t * .05, t * .13) + .5 * vec3f(sin(t * .3 + a.x * 60.), sin(t * .23 + a.y * 50.), cos(t * .27 + a.z * 70.));
  p = g.cam.xyz + (fract((p - g.cam.xyz) / B + .5) - .5) * B;
  let d = length(p - g.cam.xyz);
  let sz = (.012 + .045 * a.w * a.w * a.w);
  let w = p + (g.right.xyz * q.x + g.up.xyz * q.y) * max(sz, d * .0011);
  o.cp = g.vp * vec4f(w, 1.); o.uv = q; o.wp = p;
  let fade = ss(B * .5, B * .32, d) * ss(.6, 2.5, d) * min(1., sz / (d * .0011)) * ss(-.3, -1.5, p.y);
  let tw = .6 + .4 * sin(t * (1. + a.w * 2.) + a.x * 100.);
  o.pr = vec4f(fade * tw, shadow1(p), a.w, d);
  o.lv = lightsVol(p);
  return o;
}
@fragment fn fsSnow(i: VO) -> @location(0) vec4f {
  let r = length(i.uv);
  let m = ss(1., .2, r);
  let z = zone(i.wp);
  let c = (sunE(i.wp.y, z) * i.pr.y * .8 + amb(i.wp, vec3f(0., 1., 0.), 1., z) * .3 + i.lv * .22) * mix(vec3f(1.), vec3f(.7, 1., .9), i.pr.z);
  return vec4f(min(max(c * m * m * i.pr.x * exp(-SIG.g * i.pr.w), vec3f(0.)), vec3f(8.)), 0.);
}
`;

// ---------------------------------------------------------------- volumetric light shafts (half res)
const W_RAYS = S_G + W_FS + /*wgsl*/`
@group(0) @binding(0) var<uniform> g: G;
@group(0) @binding(1) var sR: sampler;
@group(0) @binding(2) var sS: sampler_comparison;
@group(0) @binding(3) var tSh: texture_depth_2d;
@group(0) @binding(4) var tW: texture_2d<f32>;
@group(0) @binding(5) var tDp: texture_depth${AA > 1 ? '_multisampled' : ''}_2d;
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let dp = textureLoad(tDp, vec2i(fc.xy) * 2, 0);
  let uv = fc.xy * 2. * g.res.zw;
  let nd = vec2f(uv.x * 2. - 1., 1. - uv.y * 2.);
  let rv = g.fwd.xyz + g.right.xyz * (nd.x * g.right.w) + g.up.xyz * (nd.y * g.up.w);
  let rl = length(rv); let rd = rv / rl;
  let zl = min(g.fwd.w / max(dp, 1e-6), 3e4); // borné : la cible est en demi-flottants
  var tm = min(zl * rl, 120.);
  if (rd.y > 1e-4) { tm = min(tm, -g.cam.y / rd.y); }
  let ro = g.cam.xyz; let sx = g.sun.xyz; let k = kd(g.sun.w); let sgz = sg(g.sun.w);
  let dt = tm / ${RAYN}.;
  let j = ign(fc.xy);
  var acc = vec3f(0.);
  if (g.cam.y > -450. && g.fx.y > 0.) { for (var n = 0; n < ${RAYN}; n++) {
    let t = (f32(n) + j) * dt;
    let p = ro + rd * t;
    let s = g.sm * vec4f(p, 1.);
    let vis = textureSampleCompareLevel(tSh, sS, vec2f(s.x * .5 + .5, .5 - s.y * .5), s.z - .0006);
    let q = p.xz - sx.xz * (p.y / sx.y);
    let pat = ss(.3, .7, textureSampleLevel(tW, sR, q / 27., 2.5).r) * ss(.15, .6, textureSampleLevel(tW, sR, q.yx / 11. + .3, 2.).r);
    acc += exp(-sgz * t + k * DK * (p.y / sx.y)) * (vis * (.012 + pat * 6.));
  } }
  // Faisceau du phare : diffusion de la lumière dans l'eau, le long du rayon de vue
  var sp = vec3f(0.);
  if (g.fx.w > 0.) {
    let lpos = g.lp[0].xyz; let ldir = g.ld[0].xyz; let co = g.ld[0].w; let rng = g.lp[0].w;
    let ts = min(zl * rl, rng * 1.3); let ds = ts / ${SPOTN}.;
    for (var n = 0; n < ${SPOTN}; n++) {
      let t = (f32(n) + j) * ds; let v = ro + rd * t - lpos; let d = length(v);
      let w = sat(1. - pow(d / rng, 4.));
      sp += ss(co, mix(co, 1., .55), dot(v / max(d, 1e-3), ldir)) * w * w / max(pow(d, g.lc[0].w), .6) * exp(-SIG * (t + d) * .7);
    }
    let mus = max(dot(rd, -ldir), 0.);
    sp *= ds * g.lc[0].rgb * g.fx.w * (.6 + 1.4 * mus * mus);
  }
  let mu = max(dot(rd, sx), 0.);
  let ph = mix(.2 + 2.0 * mu * mu * mu, .8, g.sun.w);
  let wc = mix(WCOL + vec3f(.04, .07, .05), PCOL + vec3f(.28, .16, .12), g.sun.w);
  return vec4f(min(acc * dt * sgz * wc * SUNC * ph * g.mis.y * g.fx.y + sp, vec3f(20.)), zl);
}
`;
// depth-aware 3x3 blur of the half-res shafts (hides the sampling dither)
const W_RBLUR = W_FS + /*wgsl*/`
@group(0) @binding(0) var tR: texture_2d<f32>;
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let p = vec2i(fc.xy); let mx = vec2i(textureDimensions(tR)) - 1;
  let c = textureLoad(tR, p, 0);
  var acc = vec3f(0.); var ws = 0.;
  for (var y = -1; y <= 1; y++) { for (var x = -1; x <= 1; x++) {
    let r = textureLoad(tR, clamp(p + vec2i(x, y) , vec2i(0), mx), 0);
    let w = 1. / (.03 + abs(r.a - c.a) / c.a);
    acc += r.rgb * w; ws += w;
  } }
  return vec4f(acc / ws, c.a);
}
`;

// ---------------------------------------------------------------- final composite
const W_POST = S_G + W_FS + /*wgsl*/`
@group(0) @binding(0) var<uniform> g: G;
@group(0) @binding(1) var sC: sampler;
@group(0) @binding(2) var tS: texture_2d<f32>;
@group(0) @binding(3) var tR: texture_2d<f32>;
@group(0) @binding(4) var tB: texture_2d<f32>;
@group(0) @binding(5) var tDp: texture_depth${AA > 1 ? '_multisampled' : ''}_2d;
fn tmap(x: vec3f) -> vec3f { return sat3((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14)); }
fn sat3(x: vec3f) -> vec3f { return clamp(x, vec3f(0.), vec3f(1.)); }
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = fc.xy * g.res.zw;
  // près du portail, l'image ondule (g.mis.w)
  let wob = vec2f(sin(uv.y * 38. + g.cam.w * 2.6), cos(uv.x * 31. - g.cam.w * 2.1)) * g.mis.w * 6.;
  let px = clamp(vec2i(fc.xy + wob), vec2i(0), vec2i(g.res.xy) - 1);
  let zf = min(g.fwd.w / max(textureLoad(tDp, px, 0), 1e-6), 3e4);
  // depth-aware upsample of the half-res shafts
  let h = fc.xy * .5 - .5; let b = floor(h); let f = h - b; let bi = vec2i(b);
  let mx = vec2i(textureDimensions(tR)) - 1;
  var acc = vec3f(0.); var ws = 0.;
  for (var k = 0; k < 4; k++) {
    let o = vec2i(k & 1, k >> 1);
    let r = textureLoad(tR, clamp(bi + o, vec2i(0), mx), 0);
    let bw = mix(1. - f.x, f.x, f32(o.x)) * mix(1. - f.y, f.y, f32(o.y));
    let w = (bw + .02) / (.02 + abs(r.a - zf) / zf);
    acc += r.rgb * w; ws += w;
  }
  var c = textureLoad(tS, px, 0).rgb + acc / ws;
  // aberration chromatique près de la déchirure : le rouge et le bleu se décollent vers les bords
  if (g.mis.w > 1e-5) {
    let off = vec2i((uv - .5) * g.mis.w * 2600.); let mxp = vec2i(g.res.xy) - 1;
    c.r = textureLoad(tS, clamp(px + off, vec2i(0), mxp), 0).r + acc.r / ws;
    c.b = textureLoad(tS, clamp(px - off, vec2i(0), mxp), 0).b + acc.b / ws;
  }
  let bl = textureSampleLevel(tB, sC, uv, 0.).rgb;
  c = mix(c, bl, .06) + bl * .03;
  c *= g.mis.x;
  let q = uv - .5;
  c *= 1. - dot(q, q) * .55;
  c = tmap(c);
  let l0 = dot(c, vec3f(.2126, .7152, .0722));
  let l = mix(l0, l0 * l0 * (3. - 2. * l0), .55);
  c *= l / max(l0, 1e-4);
  c = mix(c, vec3f(l), ss(.55, 1., l) * .1);
  c = mix(vec3f(l), c, .93) + vec3f(.008, .002, 0.);
  c = pow(max(c, vec3f(0.)), vec3f(1. / 2.2));
  let n = ign(fc.xy) + ign(fc.xy + 37.) - 1.;
  return vec4f(c + n / 255., 1.);
}
`;

return { W_DETAIL, W_BLIT, W_WATER, W_MESH, W_LEAF, W_SURF, W_SPR, W_RAYS, W_RBLUR, W_POST };
}
