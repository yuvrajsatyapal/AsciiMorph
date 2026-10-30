// Independent RGBA8 texture sampling into RGBA32F. No application renderer.
import { chromium } from "@playwright/test";
const browser = await chromium.launch({
  args: [
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--disable-accelerated-2d-canvas",
  ],
});
try {
  const page = await browser.newPage();
  console.log(
    JSON.stringify(
      await page.evaluate(() => {
        const c = document.createElement("canvas");
        c.width = 16;
        c.height = 8;
        const gl = c.getContext("webgl2", {
          antialias: false,
          premultipliedAlpha: true,
        });
        gl.getExtension("EXT_color_buffer_float");
        function shader(t, s) {
          const a = gl.createShader(t);
          gl.shaderSource(a, s);
          gl.compileShader(a);
          if (!gl.getShaderParameter(a, gl.COMPILE_STATUS))
            throw Error(gl.getShaderInfoLog(a));
          return a;
        }
        const p = gl.createProgram();
        gl.attachShader(
          p,
          shader(
            gl.VERTEX_SHADER,
            `#version 300 es
in vec2 corner; out vec2 uv;uniform vec2 texCoord;void main(){gl_Position=vec4(corner*2.-1.,0.,1.);uv=texCoord;}`,
          ),
        );
        gl.attachShader(
          p,
          shader(
            gl.FRAGMENT_SHADER,
            `#version 300 es
precision highp float;uniform sampler2D tex;in vec2 uv;out vec4 pixel;void main(){pixel=texture(tex,uv);}`,
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
        const target = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, target);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA32F,
          16,
          8,
          0,
          gl.RGBA,
          gl.FLOAT,
          null,
        );
        const f = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, f);
        gl.framebufferTexture2D(
          gl.FRAMEBUFFER,
          gl.COLOR_ATTACHMENT0,
          gl.TEXTURE_2D,
          target,
          0,
        );
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const out = [];
        for (const size of [4, 2048]) {
          const mask = new Uint8Array(size * size * 4);
          for (let y = 0; y < 4; y++)
            for (let x = 0; x < 4; x++)
              mask.fill(
                [0, 0, 0, 0, 0, 17, 139, 0, 0, 241, 53, 0, 0, 0, 0, 0][
                  y * 4 + x
                ],
                (y * size + x) * 4,
                (y * size + x + 1) * 4,
              );
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            size,
            size,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            mask,
          );
          for (const [x, y] of [
            [1, 1],
            [1.5, 1],
            [1, 1.5],
            [1.5, 1.5],
            [1.3125, 1.6875],
            [2, 1],
          ]) {
            gl.uniform2f(
              gl.getUniformLocation(p, "texCoord"),
              (x + 0.5) / size,
              (y + 0.5) / size,
            );
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            const a = new Float32Array(4);
            gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, a);
            out.push({ size, x, y, a: a[3], byte: a[3] * 255 });
          }
        }
        return { out, error: gl.getError() };
      }),
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
