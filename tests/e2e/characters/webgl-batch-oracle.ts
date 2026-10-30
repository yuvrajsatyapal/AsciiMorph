// Independent browser raster oracle: draw actual padded/instanced WebGL quads.
// No native interpolation arithmetic or reference application code is executed.
interface BatchOracleInput {
  fontSize: number;
  scale: number;
  backdrop: "none" | "blur";
  originX: number;
  originY: number;
  maskWidth: number;
  maskHeight: number;
  masks: ArrayLike<number>;
  glyphs: string[];
  grid: ArrayLike<number>;
}
export function drawIndependentBatch(a: BatchOracleInput): number[] {
  const c = document.createElement("canvas");
  const width = 128 * a.scale,
    height = 64 * a.scale,
    font = a.fontSize * a.scale,
    slotW = Math.ceil(1.1 * font) + 4,
    slotH = Math.ceil(1.3 * font) + 4,
    slotColumns = Math.floor(2048 / slotW),
    columns = Math.floor(width / (0.6 * font));
  c.width = width;
  c.height = height;
  const gl = c.getContext("webgl2", {
    antialias: false,
    premultipliedAlpha: true,
  })!;
  const rendererInfo = gl.getExtension("WEBGL_debug_renderer_info");
  if (
    !rendererInfo ||
    !String(gl.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL)).includes(
      "SwiftShader",
    )
  )
    throw Error("Independent batch requires canonical SwiftShader");
  const sentinel = document.createElement("canvas");
  sentinel.width = 128;
  sentinel.height = 64;
  const sentinelCtx = sentinel.getContext("2d")!;
  sentinelCtx.fillStyle = "white";
  sentinelCtx.fillRect(13.7, 0.5, 5.6, 10);
  if (sentinelCtx.getImageData(13, 0, 1, 1).data[3] !== 38)
    throw Error("Independent batch requires software Canvas");
  function sh(t: number, s: string) {
    const z = gl.createShader(t)!;
    gl.shaderSource(z, s);
    gl.compileShader(z);
    if (!gl.getShaderParameter(z, gl.COMPILE_STATUS))
      throw Error(gl.getShaderInfoLog(z) ?? "Shader compilation failed");
    return z;
  }
  const p = gl.createProgram()!;
  gl.attachShader(
    p,
    sh(
      gl.VERTEX_SHADER,
      `#version 300 es
layout(location=0)in vec2 corner;layout(location=1)in vec3 pos;layout(location=2)in vec4 color;uniform vec2 scale;uniform vec2 slot;uniform vec3 grid;out vec2 uv;out vec4 tint;void main(){vec2 px=pos.xy+corner*slot;gl_Position=vec4(px*scale+vec2(-1.,1.),0.,1.);float col=mod(pos.z,grid.x);float row=floor(pos.z/grid.x);uv=(vec2(col,row)+corner)*slot*grid.yz;tint=color;}`,
    ),
  );
  gl.attachShader(
    p,
    sh(
      gl.FRAGMENT_SHADER,
      `#version 300 es
precision mediump float;uniform sampler2D tex;in vec2 uv;in vec4 tint;out vec4 pixel;void main(){float alpha=texture(tex,uv).a*tint.a;pixel=vec4(tint.rgb*alpha,alpha);}`,
    ),
  );
  gl.linkProgram(p);
  gl.useProgram(p);
  let buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const map = new Map<number, number>(),
    instances: number[] = [],
    atlas = new Uint8Array(2048 * 2048 * 4);
  for (let i = 0; i < a.grid.length; i++) {
    const k = a.grid[i];
    if (k === 65535 || a.glyphs[k] === " ") continue;
    if (!map.has(k)) {
      const slot = map.size;
      map.set(k, slot);
      for (let y = 0; y < a.maskHeight; y++)
        for (let x = 0; x < a.maskWidth; x++) {
          const z =
            ((Math.floor(slot / slotColumns) * slotH + y + 2 + a.originY) *
              2048 +
              (slot % slotColumns) * slotW +
              x +
              2 +
              a.originX) *
            4;
          atlas[z] = atlas[z + 1] = atlas[z + 2] = 255;
          atlas[z + 3] =
            a.masks[k * a.maskWidth * a.maskHeight + y * a.maskWidth + x];
        }
    }
    const col = i % columns,
      row = Math.floor(i / columns),
      x = Math.floor((col + 0.5) * (0.6 * a.fontSize)),
      y = Math.floor((row + 0.5) * a.fontSize),
      factor = (259 * 275) / (255 * 239);
    const rgb = [2 * x, 4 * y, 255 - 2 * x].map(
      (v) => Math.max(0, Math.min(255, factor * (v - 128) + 128)) / 255,
    );
    instances.push(
      col * (0.6 * font) - 2,
      row * font - 2,
      map.get(k)!,
      ...rgb,
      1,
    );
  }
  buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(instances), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 28, 0);
  gl.vertexAttribDivisor(1, 1);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 28, 12);
  gl.vertexAttribDivisor(2, 1);
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  for (const [n, v] of [
    [gl.TEXTURE_MIN_FILTER, gl.LINEAR],
    [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
    [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE],
    [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE],
  ])
    gl.texParameteri(gl.TEXTURE_2D, n, v);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    2048,
    2048,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    atlas,
  );
  gl.uniform2f(gl.getUniformLocation(p, "scale"), 2 / width, -2 / height);
  gl.uniform2f(gl.getUniformLocation(p, "slot"), slotW, slotH);
  gl.uniform3f(
    gl.getUniformLocation(p, "grid"),
    slotColumns,
    1 / 2048,
    1 / 2048,
  );
  gl.viewport(0, 0, width, height);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, instances.length / 7);
  const dst = document.createElement("canvas");
  dst.width = width;
  dst.height = height;
  const ctx = dst.getContext("2d", { willReadFrequently: true })!;
  if (a.backdrop === "blur") {
    const src = document.createElement("canvas");
    src.width = 128;
    src.height = 64;
    const source = src.getContext("2d")!;
    const pixels = source.createImageData(128, 64);
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 128; x++)
        pixels.data.set(
          [2 * x, 4 * y, 255 - 2 * x, x < 13 ? 0 : 255],
          (y * 128 + x) * 4,
        );
    source.putImageData(pixels, 0, 0);
    const resized = document.createElement("canvas");
    resized.width = width;
    resized.height = height;
    const resize = resized.getContext("2d")!;
    resize.imageSmoothingQuality = "low";
    resize.drawImage(src, 0, 0, width, height);
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, width, height);
    ctx.filter = "blur(8px)";
    ctx.drawImage(resized, 0, 0);
    ctx.filter = "none";
  }
  ctx.drawImage(c, 0, 0);
  const result = Array.from(ctx.getImageData(0, 0, width, height).data);
  gl.getExtension("WEBGL_lose_context")?.loseContext();
  return result;
}
