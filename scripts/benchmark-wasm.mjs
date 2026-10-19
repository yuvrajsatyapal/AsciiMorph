import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
const { instance } = await WebAssembly.instantiate(readFileSync(new URL("../public/wasm/asciimorph_engine.wasm", import.meta.url)), {});
const api = instance.exports;
const iw = 1024, ih = 768, ow = 160, oh = 80;
const pixels = Uint8Array.from({ length: iw * ih * 4 }, (_, i) => (i * 37 + i % 11) % 256);
function jsSample() {
  const out = new Float64Array(ow * oh * 4);
  for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
    const x0 = x * iw / ow, x1 = (x + 1) * iw / ow, y0 = y * ih / oh, y1 = (y + 1) * ih / oh;
    let r = 0, g = 0, b = 0, alpha = 0, area = 0;
    for (let yy = Math.floor(y0); yy < Math.ceil(y1); yy++) for (let xx = Math.floor(x0); xx < Math.ceil(x1); xx++) {
      const weight = (Math.min(xx + 1, x1) - Math.max(xx, x0)) * (Math.min(yy + 1, y1) - Math.max(yy, y0));
      const i = (yy * iw + xx) * 4, a = pixels[i + 3] / 255;
      r += pixels[i] * a * weight; g += pixels[i + 1] * a * weight; b += pixels[i + 2] * a * weight;
      alpha += a * weight; area += weight;
    }
    out.set([alpha ? r / alpha : 0, alpha ? g / alpha : 0, alpha ? b / alpha : 0, area ? alpha / area : 0], (y * ow + x) * 4);
  }
  return out;
}
function wasmSample() {
  const a = api.alloc(pixels.byteLength), b = api.alloc(ow * oh * 32);
  try {
    new Uint8Array(api.memory.buffer, a, pixels.byteLength).set(pixels);
    if (api.sample_rgba(a, iw, ih, ow, oh, b) !== 1) throw new Error("Sampling failed");
    return new Float64Array(api.memory.buffer, b, ow * oh * 4).slice();
  } finally { api.dealloc(b, ow * oh * 32); api.dealloc(a, pixels.byteLength); }
}
const reference = jsSample(), actual = wasmSample();
let error = 0;
for (let i = 0; i < actual.length; i++) error = Math.max(error, Math.abs(actual[i] - reference[i]));
if (error > 1e-10) throw new Error(`Parity failed: ${error}`);
function measure(run) {
  for (let i = 0; i < 5; i++) run();
  const times = [];
  for (let i = 0; i < 30; i++) { const start = performance.now(); run(); times.push(performance.now() - start); }
  return times.sort((a,b) => a-b)[15];
}
const js = measure(jsSample), wasm = measure(wasmSample);
console.log(JSON.stringify({ workload: "1024×768 → 160×80 alpha-weighted area sampling", iterations: 30, medianMs: { js, wasm }, speedup: js / wasm, maxAbsoluteError: error, includesWasmCopiesAndAllocation: true }, null, 2));
