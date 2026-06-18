window.RenderLoop = (() => {
  function compileShader(gl, type, source, label) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader) || "Unknown shader compile error";
      gl.deleteShader(shader);
      throw new Error(label + " shader compile failed: " + log);
    }

    return shader;
  }

  function createProgram(gl, vertexSource, fragmentSource, label) {
    const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource, label + " vertex");
    const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource, label + " fragment");

    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program) || "Unknown program link error";
      gl.deleteProgram(program);
      throw new Error(label + " program link failed: " + log);
    }

    return program;
  }

  function createFullscreenQuad(gl, program, attributeName) {
    const location = gl.getAttribLocation(program, attributeName);
    if (location < 0) {
      throw new Error("Attribute not found: " + attributeName);
    }

    const vertices = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1
    ]);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);

    return {
      vao,
      vertexBuffer,
      vertexCount: 6
    };
  }

  function startUnifiedRenderLoop(onFrame) {
    if (typeof onFrame !== "function") {
      throw new Error("startUnifiedRenderLoop expects a function");
    }

    function frame(now) {
      onFrame(now);
      requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  }

  return {
    createProgram,
    createFullscreenQuad,
    startUnifiedRenderLoop
  };
})();
