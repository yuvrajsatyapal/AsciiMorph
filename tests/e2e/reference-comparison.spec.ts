import { expect, test } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import sharp from "sharp";

type Capture = {
  styleId: string;
  revision: number;
  sourceRevision: number;
  width: number;
  height: number;
  rgba: number[];
  settings: Record<string, unknown>;
};

test("same-input captures use accepted current-style frames and identical PNG exports", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "Canonical capture uses one fixed browser/font platform",
  );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const captures: Capture[] = [];
    Object.defineProperty(window, "__sameInputCaptures", { value: captures });
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      private requests = new Map<
        string,
        { styleId: string; settings: Record<string, unknown> }
      >();
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener("message", ({ data }) => {
          const request = this.requests.get(data?.requestId);
          if (
            !request ||
            !["styleResult", "charactersResult"].includes(data.type)
          )
            return;
          this.requests.delete(data.requestId);
          captures.push({
            styleId: request.styleId,
            settings: request.settings,
            revision: data.revision,
            sourceRevision: data.sourceRevision,
            width: data.frame.width,
            height: data.frame.height,
            rgba: Array.from(data.frame.rgba),
          });
        });
      }
      postMessage(
        message: unknown,
        options?: Transferable[] | StructuredSerializeOptions,
      ) {
        const m = message as {
          type: string;
          requestId: string;
          styleId?: string;
          settings: Record<string, unknown>;
        };
        if (["renderStylePreview", "renderCharactersPreview"].includes(m.type))
          this.requests.set(m.requestId, {
            styleId: m.styleId ?? "characters",
            settings: structuredClone(m.settings),
          });
        if (Array.isArray(options)) super.postMessage(message, options);
        else super.postMessage(message, options);
      }
    };
  });
  await page.goto("/app");
  await page
    .getByLabel("Upload image file")
    .setInputFiles(resolve("tests/fixtures/gradient.png"));
  const latest = () =>
    page.evaluate(() =>
      (
        window as unknown as { __sameInputCaptures: Capture[] }
      ).__sameInputCaptures.at(-1),
    );
  const canvas = page.getByLabel("Rendered Characters preview", {
    exact: true,
  });
  await expect.poll(async () => (await latest())?.sourceRevision).toBe(1);
  for (const [styleId, label] of [
    ["characters", "Characters"],
    ["pixel", "Pixel Art"],
    ["mosaic", "Mosaic"],
    ["dither", "Dither"],
  ]) {
    if (styleId !== "characters") {
      const previous = (await latest())!.revision;
      await page
        .getByRole("button", { name: `${label} — available`, exact: true })
        .first()
        .click();
      await expect
        .poll(async () => {
          const c = await latest();
          return c?.styleId === styleId && c.revision > previous;
        })
        .toBe(true);
    }
    // Explicit settings after each switch; never rely on tile defaults or a fixed sleep.
    await page.getByLabel("Backdrop", { exact: true }).selectOption("blur");
    await page.getByLabel("Softness", { exact: true }).fill("8");
    await page.getByLabel("Softness", { exact: true }).blur();
    await page.getByLabel("Blend", { exact: true }).selectOption("source-over");
    await expect(page.locator(".studio-stage-status")).toHaveText("");
    const accepted = (await latest())!;
    expect(accepted).toMatchObject({
      styleId,
      sourceRevision: 1,
      width: 128,
      height: 64,
    });
    expect(accepted.settings).toMatchObject({
      frameWidth: 128,
      frameHeight: 64,
      renderScale: 1,
      crop: { x: 0, y: 0, width: 1, height: 1 },
      rotation: 0,
      ...(styleId === "characters"
        ? { fontSize: 11, brightness: 0, contrast: 20, backdrop: "blur" }
        : {
            parameters:
              styleId === "dither"
                ? {
                    dither: {
                      algorithm: "floyd",
                      palette: "mono",
                      chroma: "standard",
                      pixelSize: 2,
                      strength: 100,
                      contrast: 110,
                      threshold: 50,
                      animate: false,
                      shimmer: false,
                    },
                  }
                : {
                    fontSize: 11,
                    brightness: 0,
                    contrast: 20,
                    invert: false,
                    charOpacity: 100,
                    ...(styleId === "mosaic" ? { mosaicShape: "square" } : {}),
                  },
          }),
    });
    expect(accepted.settings).not.toHaveProperty("styleContext");
    if (styleId === "pixel") {
      // Real reference export captured at these exact controls and 1x on 30 Oct.
      const reference = await sharp(
        resolve(
          "docs/research/ascii-magic/2026-10-30/pixel-reference-export.png",
        ),
      )
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect([reference.info.width, reference.info.height]).toEqual([128, 64]);
      expect(Buffer.from(accepted.rgba)).toEqual(reference.data);
    }
    // Canvas stores premultiplied bytes; compare its readback after the same browser boundary.
    const painted = await page.evaluate((rgba) => {
      const c = document.createElement("canvas");
      c.width = 128;
      c.height = 64;
      const ctx = c.getContext("2d")!;
      ctx.putImageData(
        new ImageData(new Uint8ClampedArray(rgba), 128, 64),
        0,
        0,
      );
      return Array.from(ctx.getImageData(0, 0, 128, 64).data);
    }, accepted.rgba);
    await expect
      .poll(() =>
        canvas.evaluate((c: HTMLCanvasElement) =>
          Array.from(
            c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data,
          ),
        ),
      )
      .toEqual(painted);
    const png = await sharp(Buffer.from(accepted.rgba), {
      raw: { width: 128, height: 64, channels: 4 },
    })
      .png()
      .toBuffer();
    await info.attach(`${styleId}-local.png`, {
      body: png,
      contentType: "image/png",
    });
    await info.attach(`${styleId}-settings.json`, {
      body: JSON.stringify(accepted.settings, null, 2),
      contentType: "application/json",
    });
    await page.getByRole("button", { name: "Export", exact: true }).click();
    await page.getByLabel("Format", { exact: true }).selectOption("png");
    await page.getByLabel("Scale", { exact: true }).selectOption("1");
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export PNG", exact: true }).click();
    const bytes = await readFile((await (await pending).path())!);
    const decoded = await sharp(bytes)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([decoded.info.width, decoded.info.height]).toEqual([128, 64]);
    expect(Array.from(decoded.data)).toEqual(accepted.rgba);
    await page.keyboard.press("Escape");
    if (process.env.SAME_INPUT_CAPTURE_DIR) {
      const dir = resolve(process.env.SAME_INPUT_CAPTURE_DIR);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, `${styleId}-local.png`), png);
      await writeFile(
        join(dir, `${styleId}-local-settings.json`),
        JSON.stringify(accepted.settings, null, 2),
      );
    }
  }
  expect(errors).toEqual([]);
});
