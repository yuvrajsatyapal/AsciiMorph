import { convert, type Pixels } from "./engine";
import type { ConversionSettings } from "./settings";
import { loadWasmEngine } from "./wasm";
import type { Calibration } from "./presets";
self.onmessage = async (
  e: MessageEvent<{
    pixels: Pixels;
    settings: ConversionSettings;
    calibration?: Calibration;
  }>,
) => {
  try {
    const numeric = await loadWasmEngine();
    const doc = await convert(
      e.data.pixels,
      e.data.settings,
      undefined,
      undefined,
      e.data.calibration,
      numeric ?? undefined,
    );
    self.postMessage({ doc, engine: numeric ? "Rust / WebAssembly" : "JavaScript fallback (Rust engine unavailable)" });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : "Conversion failed",
    });
  }
};
