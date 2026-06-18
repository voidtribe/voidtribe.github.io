window.VoidTribeLogoShaders = {
  VERT: `#version 300 es
precision highp float;

in vec2 aPosition;
out vec2 vUv;

void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`,

  FRAG: `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform vec2 uResolution;
uniform float uTime;

const float PI  = 3.14159265359;
const float TAU = 6.28318530718;

float hash(float x) {
  return fract(sin(x * 127.1) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);

  float a = hash(i.x + i.y * 57.0);
  float b = hash(i.x + 1.0 + i.y * 57.0);
  float c = hash(i.x + (i.y + 1.0) * 57.0);
  float d = hash(i.x + 1.0 + (i.y + 1.0) * 57.0);

  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += noise(p) * a;
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}

vec3 palette(vec2 p, float angle) {
  vec3 purple = vec3(0.68, 0.20, 1.00);
  vec3 blue   = vec3(0.22, 0.56, 1.00);
  vec3 cyan   = vec3(0.48, 0.95, 1.00);

  float xMix = smoothstep(-0.75, 0.75, p.x);
  float angular = sin(angle * 2.0) * 0.5 + 0.5;
  return mix(mix(purple, cyan, xMix), blue, angular * 0.14);
}

void main() {
  vec2 uv = (vUv * 2.0 - vec2(1.0, 0.80)) * 0.75;
  uv.x *= uResolution.x / uResolution.y;

  vec2 p = uv;
  p.y -= 0.12;
  vec2 pStatic = p;

  float rotAngle = -uTime * 0.006;
  float cosR = cos(rotAngle), sinR = sin(rotAngle);
  p = vec2(p.x * cosR - p.y * sinR, p.x * sinR + p.y * cosR);

  float r = length(p);
  float a = atan(p.y, p.x);

  vec3 col = vec3(0.0);
  vec3 accent = palette(pStatic, atan(pStatic.y, pStatic.x));
  vec3 whiteGlow = vec3(0.87, 0.92, 1.0);

  float coreRadius = 0.255;
  float dCore = length(p) - coreRadius;
  float coreRing = exp(-abs(dCore) * 11.0);
  float coreOuterGlow = exp(-max(dCore, 0.0) * 8.0) * smoothstep(0.90, 0.25, r);
  float fireBand =
    smoothstep(coreRadius + 0.010, coreRadius + 0.070, r) *
    smoothstep(coreRadius + 0.240, coreRadius + 0.060, r);

  float fireFlow = uTime * 0.14;
  float fireDrift = uTime * 0.06;
  float fireBase = noise(vec2(a * 5.0 + fireFlow, r * 22.0 - fireFlow * 0.65));
  float fireDetail = noise(vec2(a * 11.0 - fireFlow * 0.35, r * 46.0 + fireFlow * 0.95 + fireDrift));
  float fireTongue = pow(max(0.0, sin(a * 9.0 - fireFlow * 0.9) * 0.5 + 0.5), 1.6);
  float fireShape = clamp(
    fireBase * 0.72 + fireDetail * 0.45 + fireTongue * 0.135 -
    smoothstep(coreRadius + 0.045, coreRadius + 0.22, r),
    0.0,
    1.0
  ) * fireBand;
  vec3 fireAccent = palette(vec2(cos(a), sin(a)) * coreRadius, a);
  vec3 fireColor = mix(
    mix(fireAccent, whiteGlow, 0.35),
    fireAccent * 0.55,
    smoothstep(coreRadius + 0.05, coreRadius + 0.20, r)
  );

  col += accent * coreOuterGlow * 0.34;
  col += mix(accent, whiteGlow, 0.06) * coreRing * 0.62;
  col += fireColor * fireShape * 0.48;
  col += mix(fireAccent, whiteGlow, 0.65) * fireShape * 0.10;

  float sector = TAU / 9.0;

  float sectorIndex = floor((a + PI) / sector);
  float headAngle = (sectorIndex + 0.5) * sector - PI;
  float localA = atan(sin(a - headAngle), cos(a - headAngle));

  float innerStart = coreRadius + 0.055;
  float armOuterEnd = 0.59;
  float headRadiusFromCenter = 0.57;
  float armSpread = 0.19;

  float rand = hash(sectorIndex + 12.3);
  float rand2 = hash(sectorIndex * 7.1 + 1.4);

  float waveAmp = mix(0.006, 0.014, rand);
  float waveFreq = mix(16.0, 20.0, rand2);
  float phase = rand * TAU;

  float wave = sin((r - innerStart) * waveFreq + phase) * waveAmp;

  float t = smoothstep(innerStart, armOuterEnd, r);
  float armPath = mix(armSpread, 0.146, t * t) - sin(t * (PI + 1.0)) * 0.130;

  vec2 armCenters = vec2(-armPath - wave, armPath + wave);

  float armWidth = 0.005 + sin(t * PI) * 0.015;
  float organic = fbm(vec2(localA * 14.0, r * 8.5));
  float edgeJitter = (organic - 0.5) * 0.008;

  vec2 armDist = abs(vec2(localA) - armCenters);

  float armRange =
    smoothstep(innerStart - 0.020, innerStart + 0.030, r) *
    smoothstep(armOuterEnd + 0.012, armOuterEnd - 0.020, r);

  vec2 armBodyPair = smoothstep(armWidth * 2.5 + edgeJitter, armWidth * 0.5, armDist) * armRange;
  vec2 armGlowPair = smoothstep(armWidth * 7.0, armWidth * 0.4, armDist) * armRange;

  float armBody = max(armBodyPair.x, armBodyPair.y);
  float armGlow = max(armGlowPair.x, armGlowPair.y);

  col += accent * armGlow * 0.24;
  col += mix(accent, whiteGlow, 0.62) * armBody * 0.74;

  vec2 headPos = vec2(cos(headAngle), sin(headAngle)) * headRadiusFromCenter;
  float dHead = length(p - headPos);

  float headBody = smoothstep(0.050, 0.038, dHead);
  float headGlow = smoothstep(0.130, 0.038, dHead);

  col += accent * headGlow * 0.20;
  col += mix(accent, whiteGlow, 0.76) * headBody * 0.88;

  float halo = exp(-abs(r - (coreRadius + 0.015)) * 18.0) * 0.16;
  col += accent * halo * 0.18;

  float grain = noise(p * 92.0 + uTime * 0.08);
  col += (armBody + headBody + coreRing) * (grain - 0.5) * 0.10;

  float voidMask = smoothstep(coreRadius + 0.018, coreRadius - 0.004, r);
  col = mix(col, vec3(0.010, 0.014, 0.040), voidMask);

  col = 1.0 - exp(-col * 1.35);
  col = pow(col, vec3(0.92));

  float alpha = clamp(
    coreOuterGlow * 0.35 +
    coreRing * 0.50 +
    fireShape * 0.34 +
    armGlow * 0.36 +
    armBody * 0.75 +
    headGlow * 0.36 +
    headBody * 0.95 +
    halo * 0.25,
    0.0,
    1.0
  );

  alpha *= smoothstep(1.08, 0.96, length(uv));
  alpha = pow(alpha, 0.92);

  fragColor = vec4(col, alpha);
}`
};
