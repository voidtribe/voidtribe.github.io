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
  for(int i = 0; i < 10; i++){
    float fi  = float(i);
    float ang = fi*0.6283 + t*0.25;
    float rad = 1.1 + sin(t*0.6 + fi*0.9)*0.25;
    float nx = noise(t*0.37 + fi*7.13) - 0.5;
    float ny = noise(t*0.29 + fi*3.71) - 0.5;
    float nz = noise(t*0.41 + fi*5.53) - 0.5;
    vec3 sp = vec3(
      cos(ang)*rad + nx*0.55,
      sin(ang*1.3)*0.45 + ny*0.45,
      sin(ang)*rad + nz*0.35
    );
    float rs = 0.24 + sin(t*1.1 + fi*2.3)*0.05 + noise(t*0.5+fi)*0.06;
    d = smin(d, sphere(p - sp, rs), 0.52);
  }
  float core = 0.50 + sin(t*0.5)*0.07 + noise(t*0.8)*0.05;
  d = smin(d, sphere(p, core), 0.45);
  return d;
}

vec3 normal(vec3 p){
  float e = 0.001;
  return normalize(vec3(
    scene(p+vec3(e,0,0)) - scene(p-vec3(e,0,0)),
    scene(p+vec3(0,e,0)) - scene(p-vec3(0,e,0)),
    scene(p+vec3(0,0,e)) - scene(p-vec3(0,0,e))
  ));
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
  /* Map forward (+Z) to center U=0.5 and keep mirrored left-right feel. */
  float u = atan(-dir.x, dir.z) / (2.*3.14159265) + 0.5;
  float v = -dir.y * 0.5 + 0.5;
  return texture(cam, vec2(u, v)).rgb;
}

void main(){
  vec2 uv = (gl_FragCoord.xy - .5*res) / res.y;
  vec3 ro  = vec3(0, 0, 3.2);
  vec3 rd  = normalize(vec3(uv, -1.2));

  /* apply mouse rotation to ray (rotate the world around the camera) */
  ro = applyRot(ro);
  rd = applyRot(rd);

  float d   = 0.;
  bool  hit = false;
  for(int i = 0; i < 90; i++){
    float s = scene(ro + rd*d);
    if(s < 0.001){ hit = true; break; }
    if(d > 12.) break;
    d += s;
  }

  vec3 bg = vec3(0.024, 0.012, 0.06);

  if(hit){
    vec3 p = ro + rd*d;
    vec3 n = normal(p);

    /* bring normal back to camera space for lighting */
    vec3 nCam = applyInvRot(n);

    vec3 rdCam = normalize(vec3(uv, -1.2));
    vec3 ld    = normalize(vec3(1., 1.5, 2.));
    /* Keep webcam env-map in camera space so it does not rotate with object. */
    vec3 reflCam = reflect(rdCam, nCam);

    float fresnel = pow(1. - max(dot(nCam, -rdCam), 0.), 3.);
    vec3  envCol  = sampleEnv(reflCam);

    vec3  h    = normalize(ld - rdCam);
    float spec = pow(max(dot(nCam, h), 0.), 140.);

    vec3 tint   = vec3(0.38, 0.12, 0.78);
    vec3 chrome = mix(envCol * 0.88, tint, 0.10)
                + vec3(spec * 0.95)
                + tint * fresnel * 0.65;

    float fog = exp(-d * 0.07);
    col = vec4(mix(bg, chrome, fog), 1.);
  } else {
    col = vec4(bg, 1.);
  }
}`
};
