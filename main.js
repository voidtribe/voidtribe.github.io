const canvas = document.getElementById('c');
const video  = document.getElementById('v');
const status = document.getElementById('cam-status');
const btn    = document.getElementById('cam-btn');

setCamButtonMode(false);

function setCamButtonMode(enabled){
  btn.textContent = enabled ? 'disable webcam' : 'enable webcam';
  btn.onclick = enabled ? stopCam : startCam;
}

/* ── mouse rotation state ── */
let rotX = 0.18, rotY = 0.0;
let targetRotX = 0.18, targetRotY = 0.0;
let dragging = false, lastMX = 0, lastMY = 0;

canvas.addEventListener('mousedown', e => {
  dragging = true;
  lastMX = e.clientX; lastMY = e.clientY;
  document.body.classList.add('dragging');
});
window.addEventListener('mouseup', () => {
  dragging = false;
  document.body.classList.remove('dragging');
});
window.addEventListener('mousemove', e => {
  if(!dragging) return;
  targetRotY += (e.clientX - lastMX) * 0.008;
  targetRotX += (e.clientY - lastMY) * 0.008;
  targetRotX  = Math.max(-1.2, Math.min(1.2, targetRotX));
  lastMX = e.clientX; lastMY = e.clientY;
});
/* touch support */
canvas.addEventListener('touchstart', e => {
  dragging = true;
  lastMX = e.touches[0].clientX; lastMY = e.touches[0].clientY;
}, { passive: true });
window.addEventListener('touchend', () => { dragging = false; });
window.addEventListener('touchmove', e => {
  if(!dragging) return;
  targetRotY += (e.touches[0].clientX - lastMX) * 0.008;
  targetRotX += (e.touches[0].clientY - lastMY) * 0.008;
  targetRotX  = Math.max(-1.2, Math.min(1.2, targetRotX));
  lastMX = e.touches[0].clientX; lastMY = e.touches[0].clientY;
}, { passive: true });

function resize() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  if (gl) gl.viewport(0, 0, canvas.width, canvas.height);
  if (rLoc) gl.uniform2f(rLoc, canvas.width, canvas.height);
}
window.addEventListener('resize', resize);

const gl = canvas.getContext('webgl2');

if(!gl){
  alert('WebGL2 wordt niet ondersteund door deze browser.');
  throw new Error('WebGL2 not supported');
}

const { VERT, FRAG } = window.VoidTribeShaders;


function mkShader(type, src){
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if(!gl.getShaderParameter(s, gl.COMPILE_STATUS))
    console.error(gl.getShaderInfoLog(s));
  return s;
}

const prog = gl.createProgram();
gl.attachShader(prog, mkShader(gl.VERTEX_SHADER,   VERT));
gl.attachShader(prog, mkShader(gl.FRAGMENT_SHADER, FRAG));
gl.linkProgram(prog);
gl.useProgram(prog);

const vbuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, vbuf);
gl.bufferData(gl.ARRAY_BUFFER,
  new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
const aloc = gl.getAttribLocation(prog, 'p');
gl.enableVertexAttribArray(aloc);
gl.vertexAttribPointer(aloc, 2, gl.FLOAT, false, 0, 0);

const tLoc      = gl.getUniformLocation(prog, 't');
const rLoc      = gl.getUniformLocation(prog, 'res');
const rotLoc    = gl.getUniformLocation(prog, 'rot');
const camLoc    = gl.getUniformLocation(prog, 'cam');
const hasCamLoc = gl.getUniformLocation(prog, 'hasCam');
gl.uniform1i(camLoc, 0);
gl.uniform1i(hasCamLoc, 0);

resize();

/* ── double-buffered webcam textures ── */
const FALLBACK_TEX_SIZE = 256;

function createFallbackTextureData(size = FALLBACK_TEX_SIZE){
  const data = new Uint8Array(size * size * 4);

  for(let y = 0; y < size; y++){
    for(let x = 0; x < size; x++){
      const i = (y * size + x) * 4;

      const u = x / (size - 1);
      const v = y / (size - 1);

      const dx = u - 0.5;
      const dy = v - 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const rings = Math.sin(dist * 80.0) * 0.5 + 0.5;
      const glow  = Math.max(0, 1.0 - dist * 1.8);

      const r = 12  + glow * 45 + rings * 12;
      const g = 5   + glow * 18;
      const b = 35  + glow * 130 + rings * 55;

      data[i + 0] = Math.min(255, r);
      data[i + 1] = Math.min(255, g);
      data[i + 2] = Math.min(255, b);
      data[i + 3] = 255;
    }
  }

  return data;
}

function makeTex(useFallback = true){
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S,     gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T,     gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  if(useFallback){
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      FALLBACK_TEX_SIZE,
      FALLBACK_TEX_SIZE,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      createFallbackTextureData()
    );
  } else {
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([10, 5, 20, 255])
    );
  }

  return t;
}
let texFront = makeTex(true);    /* GPU is reading this */
let texBack  = makeTex(false);   /* we write webcam frames into this */
let newFrameReady = false;

let camReady = false;

async function startCam(){
  try {
    const stream = await navigator.mediaDevices.getUserMedia(
      { video: { facingMode: 'user', width: { ideal: 640 } }, audio: false });
    video.srcObject = stream;
    video.onloadedmetadata = () => {
      video.play();
      camReady = true;
      gl.uniform1i(hasCamLoc, 1);
      scheduleFrameUpload();
      status.textContent = 'cam on';
      setCamButtonMode(true);
    };
  } catch(e) {
    status.textContent = 'no permission';
  }
}

function stopCam(){
  if(video.srcObject){
    video.srcObject.getTracks().forEach(t => t.stop());
    video.srcObject = null;
  }

  camReady = false;
  newFrameReady = false;

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texFront);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    FALLBACK_TEX_SIZE,
    FALLBACK_TEX_SIZE,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    createFallbackTextureData()
  );

  gl.uniform1i(hasCamLoc, 0);

  status.textContent = 'no cam';
  setCamButtonMode(false);
}

function scheduleFrameUpload(){
  if(!camReady) return;
  if(video.requestVideoFrameCallback){
    video.requestVideoFrameCallback(() => {
      if(!camReady) return;
      /* write into back buffer only */
      gl.bindTexture(gl.TEXTURE_2D, texBack);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
      newFrameReady = true;
      scheduleFrameUpload();
    });
  }
}

function loop(ms){
  rotX += (targetRotX - rotX) * 0.08;
  rotY += (targetRotY - rotY) * 0.08;

  /* fallback for browsers without requestVideoFrameCallback */
  if(camReady && !video.requestVideoFrameCallback && video.readyState >= 2){
    gl.bindTexture(gl.TEXTURE_2D, texBack);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    newFrameReady = true;
  }

  /* swap only after previous draw is done — before this draw starts */
  if(newFrameReady){
    [texFront, texBack] = [texBack, texFront];
    newFrameReady = false;
  }

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texFront);
  gl.uniform1f(tLoc, ms * 0.001);
  gl.uniform2f(rotLoc, rotX, rotY);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);