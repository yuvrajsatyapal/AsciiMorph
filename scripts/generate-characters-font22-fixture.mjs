// Independently drawn full padded-atlas GL oracle; source is the owned synthetic gradient.
import fs from "node:fs";
import sharp from "sharp";
import { chromium } from "@playwright/test";
const artifact = JSON.parse(
  fs.readFileSync("tests/fixtures/render/characters/font22-batch.json"),
);
const browser = await chromium.launch({
  args: [
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--disable-accelerated-2d-canvas",
  ],
});
try {
  const page = await browser.newPage();
  const data = await page.evaluate((a) => {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 128;
    const gl = c.getContext("webgl2", {
      antialias: false,
      premultipliedAlpha: true,
    });
    function sh(t, s) {
      const z = gl.createShader(t);
      gl.shaderSource(z, s);
      gl.compileShader(z);
      if (!gl.getShaderParameter(z, gl.COMPILE_STATUS))
        throw Error(gl.getShaderInfoLog(z));
      return z;
    }
    const p = gl.createProgram();
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
    const map = new Map(),
      instances = [],
      atlas = new Uint8Array(2048 * 2048 * 4);
    for (let i = 0; i < a.grid.length; i++) {
      const k = a.grid[i];
      if (k === 65535 || a.glyphs[k] === " ") continue;
      if (!map.has(k)) {
        const slot = map.size;
        map.set(k, slot);
        for (let y = 0; y < 22; y++)
          for (let x = 0; x < 14; x++) {
            const z = ((y + 2) * 2048 + slot * 29 + x + 2) * 4;
            atlas[z] = atlas[z + 1] = atlas[z + 2] = 255;
            atlas[z + 3] = a.masks[k * 14 * 22 + y * 14 + x];
          }
      }
      const col = i % 19,
        row = Math.floor(i / 19),
        x = Math.floor((col + 0.5) * 6.6),
        y = Math.floor((row + 0.5) * 11),
        factor = (259 * 275) / (255 * 239);
      const rgb = [2 * x, 4 * y, 255 - 2 * x].map(
        (v) => Math.max(0, Math.min(255, factor * (v - 128) + 128)) / 255,
      );
      instances.push(col * 13.2 - 2, row * 22 - 2, map.get(k), ...rgb, 1);
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
    gl.uniform2f(gl.getUniformLocation(p, "scale"), 2 / 256, -2 / 128);
    gl.uniform2f(gl.getUniformLocation(p, "slot"), 29, 33);
    gl.uniform3f(gl.getUniformLocation(p, "grid"), 70, 1 / 2048, 1 / 2048);
    gl.viewport(0, 0, 256, 128);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, instances.length / 7);
    const dst = document.createElement("canvas");
    dst.width = 256;
    dst.height = 128;
    const ctx = dst.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(c, 0, 0);
    return Array.from(ctx.getImageData(0, 0, 256, 128).data);
  }, artifact);
  const ref = await sharp(
    "docs/research/ascii-magic/2026-10-30/characters-software/characters-11-none-2-reference-export.png",
  )
    .ensureAlpha()
    .raw()
    .toBuffer();
  let diff = 0,
    alpha = 0,
    first = [];
  for (let i = 0; i < ref.length; i++)
    if (ref[i] !== data[i]) {
      diff++;
      if (i % 4 === 3) alpha++;
      if (first.length < 12)
        first.push({ i, actual: data[i], expected: ref[i] });
    }
  console.log(JSON.stringify({ diff, alpha, first }));
  fs.writeFileSync(
    "tests/fixtures/render/characters/font22-batch.rgba",
    Buffer.from(data),
  );
} finally {
  await browser.close();
}
