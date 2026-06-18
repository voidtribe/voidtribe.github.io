window.VoidTribeShaders = {
  VERT: `#version 300 es
in vec2 p;
void main(){ gl_Position = vec4(p, 0, 1); }`,

  FRAG: `#version 300 es
precision highp float;
out vec4 col;
uniform float t;
uniform vec2  res;
uniform vec2  rot;       // rotX, rotY from mouse
uniform sampler2D cam;
uniform bool  hasCam;

float smin(float a, float b, float k){
  float h = clamp(.5 + .5*(b-a)/k, 0., 1.);
  return mix(b, a, h) - k*h*(1.-h);
}
float sphere(vec3 p, float r){ return length(p)-r; }

/* simple noise helpers for random-ish motion */
float hash(float n){ return fract(sin(n)*43758.5453); }
float noise(float x){
  float i = floor(x);
  float f = fract(x);
  float u = f*f*(3.-2.*f);
  return mix(hash(i), hash(i+1.), u);
}

float scene(vec3 p){
  float d = 1e9;
  float t025 = t * 0.25;
  float t06  = t * 0.6;
  float t037 = t * 0.37;
  float t029 = t * 0.29;
  float t041 = t * 0.41;
  float t11  = t * 1.1;
  float t05  = t * 0.5;
  for(int i = 0; i < 9; i++){
    float fi  = float(i);
    float ang = fi*0.6283 + t025;
    float rad = 1.1 + sin(t06 + fi*0.9)*0.25;
    float nx = noise(t037 + fi*7.13) - 0.5;
    float ny = noise(t029 + fi*3.71) - 0.5;
    float nz = noise(t041 + fi*5.53) - 0.5;
    vec3 sp = vec3(
      cos(ang)*rad + nx*0.55,
      sin(ang*1.3)*0.45 + ny*0.45,
      sin(ang)*rad + nz*0.35
    );
    float rs = 0.24 + sin(t11 + fi*2.3)*0.05 + noise(t05 + fi)*0.06;
    d = smin(d, sphere(p - sp, rs), 0.52);
  }
  float core = 0.50 + sin(t05)*0.07 + noise(t*0.8)*0.05;
  d = smin(d, sphere(p, core), 0.45);
  return d;
}

vec3 normal(vec3 p){
  float e = 0.0016;
  vec2 k = vec2(1., -1.);
  return normalize(
    k.xyy * scene(p + k.xyy * e) +
    k.yyx * scene(p + k.yyx * e) +
    k.yxy * scene(p + k.yxy * e) +
    k.xxx * scene(p + k.xxx * e)
  );
}

/* rotate vector by mouse-driven angles */
vec3 applyRot(vec3 v){
  float cy = cos(rot.y), sy = sin(rot.y);
  v = vec3(cy*v.x + sy*v.z, v.y, -sy*v.x + cy*v.z);
  float cx = cos(rot.x), sx = sin(rot.x);
  v = vec3(v.x, cx*v.y - sx*v.z, sx*v.y + cx*v.z);
  return v;
}

/* inverse: undo the world rotation → back to camera space */
vec3 applyInvRot(vec3 v){
  float cx = cos(rot.x), sx = sin(rot.x);
  v = vec3(v.x, cx*v.y + sx*v.z, -sx*v.y + cx*v.z);
  float cy = cos(rot.y), sy = sin(rot.y);
  v = vec3(cy*v.x - sy*v.z, v.y, sy*v.x + cy*v.z);
  return v;
}

vec3 sampleEnv(vec3 dir){
    /* Start from linear normal->UV mapping, then apply inward radial warp
      so reflections read as convex (bulging outward) instead of concave. */
  vec2 m = dir.xy;
  float r = clamp(length(m), 0.0, 1.0);
  float fishEyeAmount = 0.66;
    float rWarp = clamp(r - fishEyeAmount * r * (1.0 - r), 0.0, 1.0);
  vec2 warped = (r > 1e-5) ? (m / r) * rWarp : vec2(0.0);
  float u = -warped.x * 0.5 + 0.5;
  float v = -warped.y * 0.5 + 0.5;
  return texture(cam, vec2(u, v)).rgb;
}

void main(){
  vec2 uv = (gl_FragCoord.xy - .5*res) / res.y;
  vec3 ro  = vec3(0, 0, 3.2);   /* camera stays fixed */
  vec3 rd  = normalize(vec3(uv, -1.2));

  /* Rotate the world under the fixed camera:
     apply inverse rotation to the sample point so the blob rotates,
     env-map stays naturally in camera space. */
  float d   = 0.;
  bool  hit = false;
  for(int i = 0; i < 72; i++){
    float s = scene(applyInvRot(ro + rd*d));
    if(s < 0.0012){ hit = true; break; }
    if(d > 10.5) break;
    d += s;
  }

  vec3 bg = vec3(0.024, 0.012, 0.06);

  if(hit){
    /* normal: compute in object space, rotate back to camera space */
    vec3 n = applyRot(normal(applyInvRot(ro + rd*d)));

    vec3 ld   = normalize(vec3(3.55, 3.0, 2.0));
    float fresnel = pow(1. - max(dot(n, -rd), 0.), 3.);
    /* Sample env using the surface normal: poles of the texture land exactly
       at the top/bottom of the blob (n.y = ±1) which are never visible
       from the front-facing camera, eliminating convergence artifacts. */
    vec3  envCol  = sampleEnv(n);
    float spec = pow(max(dot(n, normalize(ld - rd)), 0.), 30.0);

    vec3 tint   = vec3(0.38, 0.12, 0.78);
    vec3 chrome = mix(envCol * 0.88, tint, 0.10)
                + vec3(spec * 0.995)
                + tint * fresnel * 0.65;

    chrome *= mix(1.0, 0.162, smoothstep(2.0, 5.0, d));
    col = vec4(chrome, 1.);
  } else {
    col = vec4(bg, 1.);
  }
}`
};
