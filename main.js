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

const FALLBACK_TEX_DATA = createFallbackTextureData();

function makeTex(){
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S,     gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T,     gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    FALLBACK_TEX_SIZE,
    FALLBACK_TEX_SIZE,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    FALLBACK_TEX_DATA
  );

  return t;
}
let texFront = makeTex();    /* GPU reads this */
let texBack  = makeTex();    /* CPU writes new webcam frames here */
let lastVideoTime = -1;
let pendingVideoFrame = false;
let latestPresentedFrames = -1;
let camTexturesAllocated = false;

let camReady = false;

function resetCamTextureToFallback(tex){
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    FALLBACK_TEX_SIZE,
    FALLBACK_TEX_SIZE,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    FALLBACK_TEX_DATA
  );
}

function resetCamFrameState(){
  lastVideoTime = -1;
  pendingVideoFrame = false;
  latestPresentedFrames = -1;
}

function allocateCamTexturesForVideo(){
  const w = video.videoWidth | 0;
  const h = video.videoHeight | 0;
  if(w <= 0 || h <= 0) return false;

  gl.bindTexture(gl.TEXTURE_2D, texFront);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.bindTexture(gl.TEXTURE_2D, texBack);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

  camTexturesAllocated = true;
  return true;
}

async function startCam(){
  try {
    const stream = await navigator.mediaDevices.getUserMedia(
      { video: { facingMode: 'user', width: { ideal: 640 } }, audio: false });
    video.srcObject = stream;
    video.onloadedmetadata = async () => {
      await video.play().catch(() => {});
      allocateCamTexturesForVideo();
      camReady = true;
      resetCamFrameState();
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
  resetCamFrameState();
  camTexturesAllocated = false;

  gl.activeTexture(gl.TEXTURE0);
  resetCamTextureToFallback(texFront);
  resetCamTextureToFallback(texBack);

  gl.uniform1i(hasCamLoc, 0);

  status.textContent = 'no cam';
  setCamButtonMode(false);
}

function scheduleFrameUpload(){
  if(!camReady || !video.requestVideoFrameCallback) return;

  video.requestVideoFrameCallback((_, metadata) => {
    if(!camReady) return;

    if(metadata && typeof metadata.presentedFrames === 'number'){
      if(metadata.presentedFrames > latestPresentedFrames){
        latestPresentedFrames = metadata.presentedFrames;
        pendingVideoFrame = true;
      }
    } else {
      pendingVideoFrame = true;
    }

    scheduleFrameUpload();
  });
}

function loop(ms){
  rotX += (targetRotX - rotX) * 0.08;
  rotY += (targetRotY - rotY) * 0.08;

  /* Desktop-stable path: mark new frames via rVFC, then upload+swap in RAF. */
  if(camReady && video.readyState >= 2){
    if(!video.requestVideoFrameCallback && video.currentTime !== lastVideoTime){
      lastVideoTime = video.currentTime;
      pendingVideoFrame = true;
    }

    if(pendingVideoFrame){
      if(!camTexturesAllocated){
        allocateCamTexturesForVideo();
      }

      if(camTexturesAllocated){
        pendingVideoFrame = false;
        gl.bindTexture(gl.TEXTURE_2D, texBack);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, video);
        [texFront, texBack] = [texBack, texFront];
      }
    }
  }

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texFront);
  gl.uniform1f(tLoc, ms * 0.001);
  gl.uniform2f(rotLoc, rotX, rotY);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);