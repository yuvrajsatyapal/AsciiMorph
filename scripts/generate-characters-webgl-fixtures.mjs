// Independently drawn controlled masks; no reference application code is loaded.
import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const browser = await chromium.launch({
  args: [
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--disable-accelerated-2d-canvas",
  ],
});
try {
  const page = await browser.newPage();
  const result = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 16;
    c.height = 8;
    const gl = c.getContext("webgl2", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
    });
    if (!gl) throw Error("no GL");
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
    function shader(type, source) {
      const s = gl.createShader(type);
      gl.shaderSource(s, source);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
        throw Error(gl.getShaderInfoLog(s));
      return s;
    }
    const p = gl.createProgram();
    gl.attachShader(
      p,
      shader(
        gl.VERTEX_SHADER,
        `#version 300 es
 in vec2 corner; uniform vec2 offset; uniform vec2 frame; uniform float size; out vec2 uv; void main(){vec2 px=offset+corner*vec2(size);gl_Position=vec4(px*vec2(2./frame.x,-2./frame.y)+vec2(-1.,1.),0.,1.);uv=corner;}`,
      ),
    );
    gl.attachShader(
      p,
      shader(
        gl.FRAGMENT_SHADER,
        `#version 300 es
 precision mediump float; uniform sampler2D tex; uniform vec4 color; in vec2 uv; out vec4 pixel;void main(){float a=texture(tex,uv).a*color.a;pixel=vec4(color.rgb*a,a);}`,
      ),
    );
    gl.linkProgram(p);
    gl.useProgram(p);
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const loc = gl.getAttribLocation(p, "corner");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const mask = new Uint8Array(64);
    [0, 0, 0, 0, 0, 17, 139, 0, 0, 241, 53, 0, 0, 0, 0, 0].forEach((a, i) =>
      mask.fill(a, i * 4, i * 4 + 4),
    );
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      4,
      4,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      mask,
    );
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.viewport(0, 0, 16, 8);
    const factor = (259 * 275) / (255 * 239);
    const color = [72, 160, 220].map((v) => (factor * (v - 128) + 128) / 255);
    gl.uniform4f(gl.getUniformLocation(p, "color"), ...color, 212 / 255);
    const check = document.createElement("canvas");
    check.width = 128;
    check.height = 64;
    const checkCtx = check.getContext("2d");
    checkCtx.fillStyle = "white";
    checkCtx.fillRect(13.7, 0.5, 5.6, 10);
    if (
      checkCtx.getImageData(13, 0, 1, 1).data[3] !== 38 ||
      !renderer.includes("SwiftShader")
    )
      throw Error(
        "Noncanonical backend: " +
          renderer +
          " alpha " +
          checkCtx.getImageData(13, 0, 1, 1).data[3],
      );
    const target = document.createElement("canvas");
    target.width = 16;
    target.height = 8;
    const ctx = target.getContext("2d", { willReadFrequently: true });
    const cases = [];
    for (const opacity of [1, 0.5, 0.99, 0]) {
      gl.uniform4f(
        gl.getUniformLocation(p, "color"),
        ...color,
        (212 / 255) * opacity,
      );
      for (const scale of [1, 2, 3, 4]) {
        c.width = 16 * scale;
        c.height = 8 * scale;
        target.width = c.width;
        target.height = c.height;
        gl.viewport(0, 0, c.width, c.height);
        gl.uniform2f(gl.getUniformLocation(p, "frame"), c.width, c.height);
        gl.uniform1f(gl.getUniformLocation(p, "size"), 4 * scale);
        const scaled = new Uint8Array(4 * scale * 4 * scale * 4);
        for (let y = 0; y < 4 * scale; y++)
          for (let x = 0; x < 4 * scale; x++) {
            const a =
              mask[(Math.floor(y / scale) * 4 + Math.floor(x / scale)) * 4 + 3];
            scaled.fill(
              a,
              (y * 4 * scale + x) * 4,
              (y * 4 * scale + x + 1) * 4,
            );
          }
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          4 * scale,
          4 * scale,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          scaled,
        );
        for (const [baseX, baseY] of [
          [0, 0.3],
          [0.1, 0.3],
          [0.2, 0.3],
          [0.3, 0.3],
          [0.4, 0.3],
          [0.5, 0.3],
          [0.6, 0.3],
          [0.7, 0.3],
          [0.8, 0.3],
          [0.9, 0.3],
          [-1.7, -0.6],
          [13.4, 5.2],
          [0.03125, 0.96875],
        ]) {
          const x = baseX * scale,
            y = baseY * scale;
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.uniform2f(gl.getUniformLocation(p, "offset"), x, y);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          const data = new Uint8Array(c.width * c.height * 4);
          gl.readPixels(
            0,
            0,
            c.width,
            c.height,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            data,
          );
          const premul = [];
          for (let row = c.height - 1; row >= 0; row--)
            premul.push(
              ...data.slice(row * c.width * 4, (row + 1) * c.width * 4),
            );
          ctx.clearRect(0, 0, c.width, c.height);
          ctx.drawImage(c, 0, 0);
          const rgba = Array.from(
            ctx.getImageData(0, 0, c.width, c.height).data,
          );
          ctx.fillStyle = "rgb(37,91,203)";
          ctx.fillRect(0, 0, c.width, c.height);
          ctx.drawImage(c, 0, 0);
          const opaque = Array.from(
            ctx.getImageData(0, 0, c.width, c.height).data,
          );
          cases.push({
            x,
            y,
            scale,
            opacity,
            premul,
            opaque,
            rgba,
          });
        }
      }
    }
    const gridCases = [];
    for (const scale of [1, 2, 3, 4]) {
      c.width = 7 * scale;
      c.height = 3 * scale;
      target.width = c.width;
      target.height = c.height;
      gl.viewport(0, 0, c.width, c.height);
      gl.uniform2f(gl.getUniformLocation(p, "frame"), c.width, c.height);
      gl.uniform1f(gl.getUniformLocation(p, "size"), 4 * scale);
      const texels = new Uint8Array(4 * scale * 4 * scale * 4);
      for (let y = 0; y < 4 * scale; y++)
        for (let x = 0; x < 4 * scale; x++) {
          const a =
            mask[(Math.floor(y / scale) * 4 + Math.floor(x / scale)) * 4 + 3];
          texels.fill(a, (y * 4 * scale + x) * 4, (y * 4 * scale + x + 1) * 4);
        }
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        4 * scale,
        4 * scale,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        texels,
      );
      for (const [originX, originY] of [
        [-1.5, -0.6],
        [0, 0],
        [0.4, 0.6],
        [3.6, 1.3],
      ]) {
        gl.clear(gl.COLOR_BUFFER_BIT);
        for (const [column, pixel] of [
          [1, [72, 160, 220, 212]],
          [2, [220, 99, 31, 173]],
        ]) {
          const ink = pixel
            .slice(0, 3)
            .map(
              (v) => Math.max(0, Math.min(255, factor * (v - 128) + 128)) / 255,
            );
          gl.uniform4f(
            gl.getUniformLocation(p, "color"),
            ...ink,
            pixel[3] / 255,
          );
          gl.uniform2f(
            gl.getUniformLocation(p, "offset"),
            (column * 1.8 + originX) * scale,
            originY * scale,
          );
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.drawImage(c, 0, 0);
        gridCases.push({
          scale,
          originX,
          originY,
          rgba: Array.from(ctx.getImageData(0, 0, c.width, c.height).data),
        });
      }
    }
    return { renderer, cases, gridCases };
  });
  const directory = new URL(
    "../tests/fixtures/render/characters/",
    import.meta.url,
  );
  const bytes = Buffer.from(result.cases.flatMap((c) => c.rgba));
  await writeFile(
    new URL("webgl-grid.rgba", directory),
    Buffer.from(result.gridCases.flatMap((c) => c.rgba)),
  );
  await writeFile(
    new URL("webgl-grid.json", directory),
    JSON.stringify(
      result.gridCases.map(({ scale, originX, originY }) => ({
        scale,
        originX,
        originY,
      })),
      null,
      2,
    ) + "\n",
  );
  await writeFile(new URL("webgl-software.rgba", directory), bytes);
  await writeFile(
    new URL("webgl-software-opaque.rgba", directory),
    Buffer.from(result.cases.flatMap((c) => c.opaque)),
  );
  await writeFile(
    new URL("webgl-software.json", directory),
    JSON.stringify(
      {
        browser: browser.version(),
        args: [
          "--use-angle=swiftshader",
          "--enable-unsafe-swiftshader",
          "--disable-accelerated-2d-canvas",
        ],
        renderer: result.renderer,
        width: 16,
        height: 8,
        mask: [0, 0, 0, 0, 0, 17, 139, 0, 0, 241, 53, 0, 0, 0, 0, 0],
        sourcePixel: [72, 160, 220, 212],
        contrast: 20,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        cases: result.cases.map(({ x, y, scale, opacity }) => ({
          x,
          y,
          scale,
          opacity,
        })),
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "Generated " +
      result.cases.length +
      " full RGBA glyph fixtures: " +
      result.renderer,
  );
} finally {
  await browser.close();
}
