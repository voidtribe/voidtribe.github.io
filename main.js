const canvas = document.getElementById("background-canvas");
const video = document.getElementById("webcam");
const status = document.getElementById("cam-status");
const btn = document.getElementById("cam-btn");
const logoCanvas = document.getElementById("logo-canvas");

const { createProgram, createFullscreenQuad, startUnifiedRenderLoop } = window.RenderLoop;

setCamButtonMode(false);

function setCamButtonMode(enabled) {
  btn.textContent = enabled ? "disable webcam" : "enable webcam";
  btn.onclick = enabled ? stopCam : startCam;
}

let rotX = 0.18;
let rotY = 0.0;
let targetRotX = 0.18;
let targetRotY = 0.0;
let dragging = false;
let lastMX = 0;
let lastMY = 0;

canvas.addEventListener("mousedown", (e) => {
  dragging = true;
  lastMX = e.clientX;
  lastMY = e.clientY;
  document.body.classList.add("dragging");
});

window.addEventListener("mouseup", () => {
  dragging = false;
  document.body.classList.remove("dragging");
});

window.addEventListener("mousemove", (e) => {
  if (!dragging) return;
  targetRotY += (e.clientX - lastMX) * 0.008;
  targetRotX += (e.clientY - lastMY) * 0.008;
  targetRotX = Math.max(-1.2, Math.min(1.2, targetRotX));
  lastMX = e.clientX;
  lastMY = e.clientY;
});

canvas.addEventListener("touchstart", (e) => {
  dragging = true;
  lastMX = e.touches[0].clientX;
  lastMY = e.touches[0].clientY;
}, { passive: true });

window.addEventListener("touchend", () => {
  dragging = false;
});

window.addEventListener("touchmove", (e) => {
  if (!dragging) return;
  targetRotY += (e.touches[0].clientX - lastMX) * 0.008;
  targetRotX += (e.touches[0].clientY - lastMY) * 0.008;
  targetRotX = Math.max(-1.2, Math.min(1.2, targetRotX));
  lastMX = e.touches[0].clientX;
  lastMY = e.touches[0].clientY;
}, { passive: true });

const gl = canvas.getContext("webgl2");

if (!gl) {
  alert("WebGL2 wordt niet ondersteund door deze browser.");
  throw new Error("WebGL2 not supported");
}

const { VERT, FRAG } = window.VoidTribeShaders;
const backgroundProgram = createProgram(gl, VERT, FRAG, "Background");
const backgroundQuad = createFullscreenQuad(gl, backgroundProgram, "p");

gl.useProgram(backgroundProgram);

const tLoc = gl.getUniformLocation(backgroundProgram, "t");
const rLoc = gl.getUniformLocation(backgroundProgram, "res");
const rotLoc = gl.getUniformLocation(backgroundProgram, "rot");
const camLoc = gl.getUniformLocation(backgroundProgram, "cam");
const hasCamLoc = gl.getUniformLocation(backgroundProgram, "hasCam");

gl.uniform1i(camLoc, 0);
gl.uniform1i(hasCamLoc, 0);

function resizeBackgroundCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.uniform2f(rLoc, canvas.width, canvas.height);
}

window.addEventListener("resize", resizeBackgroundCanvas);
resizeBackgroundCanvas();

const FALLBACK_TEX_SIZE = 256;

function createFallbackTextureData(size = FALLBACK_TEX_SIZE) {
  const data = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;

      const u = x / (size - 1);
      const v = y / (size - 1);

      const dx = u - 0.5;
      const dy = v - 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const rings = Math.sin(dist * 80.0) * 0.5 + 0.5;
      const glow = Math.max(0, 1.0 - dist * 1.8);

      const r = 12 + glow * 45 + rings * 12;
      const g = 5 + glow * 18;
      const b = 35 + glow * 130 + rings * 55;

      data[i + 0] = Math.min(255, r);
      data[i + 1] = Math.min(255, g);
      data[i + 2] = Math.min(255, b);
      data[i + 3] = 255;
    }
  }

  return data;
}

const FALLBACK_TEX_DATA = createFallbackTextureData();

function makeTex() {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
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

let texFront = makeTex();
let texBack = makeTex();
let lastVideoTime = -1;
let pendingVideoFrame = false;
let latestPresentedFrames = -1;
let pendingFrameId = -1;
let uploadedFrameId = -1;
let camTexturesAllocated = false;
let camReady = false;

function resetCamTextureToFallback(tex) {
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

function resetCamFrameState() {
  lastVideoTime = -1;
  pendingVideoFrame = false;
  latestPresentedFrames = -1;
  pendingFrameId = -1;
  uploadedFrameId = -1;
}

function allocateCamTexturesForVideo() {
  const w = video.videoWidth | 0;
  const h = video.videoHeight | 0;
  if (w <= 0 || h <= 0) return false;

  gl.bindTexture(gl.TEXTURE_2D, texFront);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.bindTexture(gl.TEXTURE_2D, texBack);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

  camTexturesAllocated = true;
  return true;
}

async function startCam() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 640 } },
      audio: false
    });

    video.srcObject = stream;
    video.onloadedmetadata = async () => {
      await video.play().catch(() => {});
      allocateCamTexturesForVideo();
      camReady = true;
      resetCamFrameState();
      gl.uniform1i(hasCamLoc, 1);
      scheduleFrameUpload();
      status.textContent = "cam on";
      setCamButtonMode(true);
    };
  } catch (e) {
    status.textContent = "no permission";
  }
}

function stopCam() {
  if (video.srcObject) {
    video.srcObject.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  }

  camReady = false;
  resetCamFrameState();
  camTexturesAllocated = false;

  gl.activeTexture(gl.TEXTURE0);
  resetCamTextureToFallback(texFront);
  resetCamTextureToFallback(texBack);

  gl.uniform1i(hasCamLoc, 0);

  status.textContent = "no cam";
  setCamButtonMode(false);
}

function scheduleFrameUpload() {
  if (!camReady || !video.requestVideoFrameCallback) return;

  video.requestVideoFrameCallback((_, metadata) => {
    if (!camReady) return;

    if (metadata && typeof metadata.presentedFrames === "number") {
      if (metadata.presentedFrames > latestPresentedFrames) {
        latestPresentedFrames = metadata.presentedFrames;
        pendingFrameId = metadata.presentedFrames;
        pendingVideoFrame = true;
      }
    } else {
      pendingFrameId += 1;
      pendingVideoFrame = true;
    }

    scheduleFrameUpload();
  });
}

function renderBackground(now) {
  rotX += (targetRotX - rotX) * 0.08;
  rotY += (targetRotY - rotY) * 0.08;

  if (camReady && video.readyState >= 2) {
    if (!video.requestVideoFrameCallback && video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      pendingFrameId += 1;
      pendingVideoFrame = true;
    }

    if (pendingVideoFrame && pendingFrameId > uploadedFrameId) {
      if (!camTexturesAllocated) {
        allocateCamTexturesForVideo();
      }

      if (camTexturesAllocated) {
        pendingVideoFrame = false;
        gl.bindTexture(gl.TEXTURE_2D, texBack);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, video);
        [texFront, texBack] = [texBack, texFront];
        uploadedFrameId = pendingFrameId;
      }
    }
  }

  gl.useProgram(backgroundProgram);
  gl.bindVertexArray(backgroundQuad.vao);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texFront);
  gl.uniform1f(tLoc, now * 0.0005);
  gl.uniform2f(rotLoc, rotX, rotY);
  gl.drawArrays(gl.TRIANGLES, 0, backgroundQuad.vertexCount);
}

function createLogoRenderer() {
  if (!logoCanvas) return null;

  const logoShaders = window.VoidTribeLogoShaders;
  if (!logoShaders || !logoShaders.VERT || !logoShaders.FRAG) return null;

  const logoGl = logoCanvas.getContext("webgl2", {
    alpha: true,
    antialias: true,
    depth: false,
    stencil: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false
  });

  if (!logoGl) return null;

  let logoProgram;
  try {
    logoProgram = createProgram(logoGl, logoShaders.VERT, logoShaders.FRAG, "Logo");
  } catch (err) {
    console.error(err);
    return null;
  }

  const logoQuad = createFullscreenQuad(logoGl, logoProgram, "aPosition");
  const resolutionLocation = logoGl.getUniformLocation(logoProgram, "uResolution");
  const timeLocation = logoGl.getUniformLocation(logoProgram, "uTime");

  function resizeLogoCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.floor(logoCanvas.clientWidth * dpr);
    const height = Math.floor(logoCanvas.clientHeight * dpr);

    if (
      width > 0 &&
      height > 0 &&
      (logoCanvas.width !== width || logoCanvas.height !== height)
    ) {
      logoCanvas.width = width;
      logoCanvas.height = height;
      logoGl.viewport(0, 0, width, height);
    }
  }

  return {
    render(now) {
      resizeLogoCanvas();

      logoGl.clearColor(0, 0, 0, 0);
      logoGl.clear(logoGl.COLOR_BUFFER_BIT);

      logoGl.useProgram(logoProgram);
      logoGl.bindVertexArray(logoQuad.vao);
      logoGl.uniform2f(resolutionLocation, logoCanvas.width || 1, logoCanvas.height || 1);
      logoGl.uniform1f(timeLocation, now * 0.01);
      logoGl.drawArrays(logoGl.TRIANGLES, 0, logoQuad.vertexCount);
    }
  };
}

const logoRenderer = createLogoRenderer();

startUnifiedRenderLoop((now) => {
  renderBackground(now);
  if (logoRenderer) {
    logoRenderer.render(now);
  }
});
