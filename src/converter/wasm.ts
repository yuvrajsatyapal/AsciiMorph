import type { Pixels } from "./engine";

export interface NumericEngine {
  sample(image: Pixels, width: number, height: number): Float64Array;
  /** Triples of box blur, Sobel x, Sobel y for each output pixel. */
  gradients(values: Float32Array, width: number, height: number): Float64Array;
}
interface EngineExports extends WebAssembly.Exports {
  memory: WebAssembly.Memory;
  alloc(bytes: number): number;
  dealloc(pointer: number, bytes: number): void;
  sample_rgba(
    input: number,
    iw: number,
    ih: number,
    ow: number,
    oh: number,
    output: number,
  ): number;
  sobel(input: number, width: number, height: number, output: number): number;
}
function dimensions(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > maxWidth ||
    height > maxHeight
  )
    throw new Error("Invalid WASM buffer dimensions");
}
export async function createWasmEngine(
  bytes: BufferSource,
): Promise<NumericEngine> {
  const result = await WebAssembly.instantiate(bytes, {});
  const api = result.instance.exports as EngineExports;
  if (
    !(api.memory instanceof WebAssembly.Memory) ||
    typeof api.alloc !== "function" ||
    typeof api.dealloc !== "function" ||
    typeof api.sample_rgba !== "function" ||
    typeof api.sobel !== "function"
  )
    throw new Error("Incompatible Rust engine");
  function execute(
    input: Uint8Array,
    count: number,
    run: (a: number, b: number) => number,
  ) {
    const inputPointer = api.alloc(input.byteLength);
    if (!inputPointer) throw new Error("Rust engine allocation failed");
    let outputPointer = 0;
    try {
      outputPointer = api.alloc(count * 8);
      if (!outputPointer) throw new Error("Rust engine allocation failed");
      new Uint8Array(api.memory.buffer, inputPointer, input.byteLength).set(
        input,
      );
      if (run(inputPointer, outputPointer) !== 1)
        throw new Error("Rust engine rejected input");
      return new Float64Array(api.memory.buffer, outputPointer, count).slice();
    } finally {
      if (outputPointer) api.dealloc(outputPointer, count * 8);
      api.dealloc(inputPointer, input.byteLength);
    }
  }
  return {
    sample(image, width, height) {
      dimensions(image.width, image.height, 2048, 2048);
      dimensions(width, height, 600, 1200);
      if (
        !(image.data instanceof Uint8ClampedArray) ||
        image.data.length !== image.width * image.height * 4
      )
        throw new Error("Invalid WASM pixel buffer");
      return execute(
        new Uint8Array(
          image.data.buffer,
          image.data.byteOffset,
          image.data.byteLength,
        ),
        width * height * 4,
        (input, output) =>
          api.sample_rgba(
            input,
            image.width,
            image.height,
            width,
            height,
            output,
          ),
      );
    },
    gradients(values, width, height) {
      dimensions(width, height, 600, 1200);
      if (!(values instanceof Float32Array) || values.length !== width * height)
        throw new Error("Invalid WASM luminance buffer");
      return execute(
        new Uint8Array(values.buffer, values.byteOffset, values.byteLength),
        width * height * 3,
        (input, output) => api.sobel(input, width, height, output),
      );
    },
  };
}
let pending: Promise<NumericEngine | null> | undefined;
/** A failed load uses the existing JS implementation; callers must report the selected engine. */
export function loadWasmEngine(): Promise<NumericEngine | null> {
  pending ??= (async () => {
    try {
      const response = await fetch("/wasm/asciimorph_engine.wasm", {
        cache: "force-cache",
      });
      if (!response.ok) return null;
      return await createWasmEngine(await response.arrayBuffer());
    } catch {
      return null;
    }
  })();
  return pending;
}
