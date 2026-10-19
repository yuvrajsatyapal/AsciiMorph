import { convert, type Pixels } from "./engine";
import type { ConversionSettings } from "./settings";
import type { Calibration } from "./presets";
self.onmessage = async (
  e: MessageEvent<{
    pixels: Pixels;
    settings: ConversionSettings;
    calibration?: Calibration;
  }>,
) => {
  try {
    const doc = await convert(
      e.data.pixels,
      e.data.settings,
      undefined,
      undefined,
      e.data.calibration,
    );
    self.postMessage({ doc });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : "Conversion failed",
    });
  }
};
