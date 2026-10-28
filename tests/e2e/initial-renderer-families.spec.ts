import { expect, test, type Page } from "@playwright/test";

async function upload17x13(page: Page) {
  const base64 = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 17;
    c.height = 13;
    const context = c.getContext("2d")!,
      image = context.createImageData(17, 13);
    for (let y = 0; y < 13; y++)
      for (let x = 0; x < 17; x++) {
        const i = (y * 17 + x) * 4;
        image.data.set(
          [
            (x * 17 + y * 3) % 256,
            (x * 5 + y * 19) % 256,
            (x * 11 + y * 7) % 256,
            255,
          ],
          i,
        );
      }
    context.putImageData(image, 0, 0);
    return c.toDataURL("image/png").split(",")[1];
  });
  await page.getByLabel("Upload image file").setInputFiles({
    name: "task18-17x13.png",
    mimeType: "image/png",
    buffer: Buffer.from(base64, "base64"),
  });
  await expect
    .poll(() =>
      page
        .getByLabel("Original source comparison")
        .evaluate((c: HTMLCanvasElement) => [c.width, c.height]),
    )
    .toEqual([17, 13]);
}
async function frameHash(page: Page) {
  return page
    .getByLabel("Rendered Characters preview")
    .evaluate((c: HTMLCanvasElement) => {
      const bytes = c
        .getContext("2d")!
        .getImageData(0, 0, c.width, c.height).data;
      let hash = 2166136261;
      for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619);
      return { width: c.width, height: c.height, hash: hash >>> 0 };
    });
}
type AcceptedStyle = {
  styleId: string;
  revision: number;
  sourceRevision: number;
  jobId: string;
};
async function trackStyles(page: Page) {
  await page.addInitScript(() => {
    const results: AcceptedStyle[] = [];
    Object.defineProperty(window, "__acceptedStyles", { value: results });
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      private previews = new Set<string>();
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener("message", ({ data }) => {
          if (
            data?.type !== "styleResult" ||
            !this.previews.has(data.requestId)
          )
            return;
          this.previews.delete(data.requestId);
          results.push({
            styleId: data.styleId,
            revision: data.revision,
            sourceRevision: data.sourceRevision,
            jobId: data.jobId,
          });
        });
      }
      postMessage(
        message: unknown,
        options?: Transferable[] | StructuredSerializeOptions,
      ) {
        const request = message as { type?: string; requestId?: string };
        if (request?.type === "renderStylePreview" && request.requestId)
          this.previews.add(request.requestId);
        if (Array.isArray(options)) super.postMessage(message, options);
        else super.postMessage(message, options);
      }
    };
  });
}
async function acceptedStyle(
  page: Page,
  styleId: "pixel" | "mosaic" | "braille",
  afterRevision = -1,
): Promise<AcceptedStyle> {
  await expect
    .poll(() =>
      page.evaluate(
        ({ styleId, afterRevision }) => {
          const result = (
            window as unknown as { __acceptedStyles: AcceptedStyle[] }
          ).__acceptedStyles.at(-1);
          return result?.styleId === styleId && result.revision > afterRevision
            ? result
            : null;
        },
        { styleId, afterRevision },
      ),
    )
    .toMatchObject({
      styleId,
      revision: expect.any(Number),
      sourceRevision: 1,
      jobId: expect.any(String),
    });
  const result = await page.evaluate(
    () =>
      (
        window as unknown as { __acceptedStyles: AcceptedStyle[] }
      ).__acceptedStyles.at(-1)!,
  );
  expect(result.revision).toBeGreaterThan(afterRevision);
  await expect(page.locator(".studio-stage-status")).toHaveText("");
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  return result;
}
async function exported(page: Page, format: "png" | "jpeg") {
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByLabel("Format", { exact: true }).selectOption(format);
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", {
      name: `Export ${format.toUpperCase()}`,
      exact: true,
    })
    .click();
  const stream = await (await pending).createReadStream(),
    chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const bytes = Buffer.concat(chunks);
  expect(bytes.subarray(0, format === "png" ? 8 : 3).toString("hex")).toBe(
    format === "png" ? "89504e470d0a1a0a" : "ffd8ff",
  );
  const dimensions = await page.evaluate(
    async ({ base64, format }) => {
      const bytes = Uint8Array.from(atob(base64), (character) =>
        character.charCodeAt(0),
      );
      const bitmap = await createImageBitmap(
        new Blob([bytes], { type: `image/${format}` }),
      );
      const result = [bitmap.width, bitmap.height];
      bitmap.close();
      return result;
    },
    { base64: bytes.toString("base64"), format },
  );
  await page.keyboard.press("Escape");
  return dimensions;
}
async function pickStyle(page: Page, label: string) {
  const styles = page.getByRole("button", { name: "Styles", exact: true });
  if (await styles.isVisible()) await styles.click();
  await page
    .getByRole("button", { name: `${label} — available` })
    .first()
    .click();
  const sheet = page.getByRole("dialog", { name: "Styles sheet" });
  if (await sheet.isVisible())
    await sheet.getByRole("button", { name: "Close panel" }).click();
}
async function openControls(page: Page) {
  const controls = page.getByRole("button", { name: "Controls", exact: true });
  if (await controls.isVisible()) await controls.click();
}
async function history(page: Page, action: "Undo" | "Redo") {
  const toolbar = page
    .locator(".studio-toolbar")
    .getByRole("button", { name: action, exact: true });
  if (await toolbar.isVisible()) {
    await toolbar.click();
    return;
  }
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Studio menu" });
  await dialog.getByRole("button", { name: action, exact: true }).click();
  await dialog.getByRole("button", { name: "Close Studio menu" }).click();
}

test("Pixel Art runs through the production Worker and changes source pixels", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        (window as unknown as { __realWorkerUrl: string }).__realWorkerUrl =
          String(url);
        this.addEventListener("message", ({ data }) => {
          if (data?.type === "styleResult")
            document.body.dataset.lastStyleResult = data.styleId;
        });
      }
    };
  });
  await page.goto("/app");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __realWorkerUrl?: string }).__realWorkerUrl,
      ),
    )
    .toBeTruthy();
  const direct = await page.evaluate(async () => {
    const url = (window as unknown as { __realWorkerUrl: string })
      .__realWorkerUrl;
    const worker = new Worker(url);
    let serial = 0;
    const send = (type: string, extra: object) =>
      new Promise<Record<string, unknown>>((resolve, reject) => {
        const requestId = `smoke-${++serial}`;
        const onMessage = (event: MessageEvent) => {
          if (
            event.data?.requestId !== requestId ||
            !["ready", "accepted", "styleResult", "error"].includes(
              event.data.type,
            ) ||
            (event.data.type === "accepted" &&
              event.data.operation !== "setSource")
          )
            return;
          worker.removeEventListener("message", onMessage);
          if (event.data.type === "error")
            reject(new Error(event.data.error.message));
          else resolve(event.data);
        };
        worker.addEventListener("message", onMessage);
        worker.postMessage({ version: 1, requestId, type, ...extra });
      });
    try {
      const ready = await send("initialize", { memoryBudgetBytes: 268435456 });
      const source = {
        id: "direct-fixture",
        revision: 1,
        width: 17,
        height: 13,
        rgba: new Uint8ClampedArray(17 * 13 * 4).fill(180),
      };
      for (let i = 3; i < source.rgba.length; i += 4) source.rgba[i] = 255;
      await send("setSource", { source });
      const render = async (styleId: "pixel" | "mosaic") =>
        send("renderStylePreview", {
          jobId: styleId,
          revision: 1,
          sourceId: source.id,
          sourceRevision: 1,
          calibrationId: "",
          source: { id: source.id, revision: 1, width: 17, height: 13 },
          styleId,
          settings: {
            version: 1,
            styleId,
            frameWidth: 17,
            frameHeight: 13,
            renderScale: 1,
            crop: { x: 0, y: 0, width: 1, height: 1 },
            rotation: 0,
            seed: 0,
            timeUs: 0,
            parameters: {
              fontSize: 11,
              brightness: 0,
              contrast: 20,
              invert: false,
              charOpacity: 100,
              ...(styleId === "mosaic" ? { mosaicShape: "square" } : {}),
            },
          },
          timeUs: 0,
        });
      const pixel = await render("pixel"),
        mosaic = await render("mosaic");
      return {
        supported: ready.supportedStyleIds,
        pixel: (pixel.frame as { rgba: Uint8Array }).rgba[0],
        mosaic: (mosaic.frame as { rgba: Uint8Array }).rgba[0],
      };
    } finally {
      worker.terminate();
    }
  });
  expect(direct.supported).toEqual(expect.arrayContaining(["pixel", "mosaic"]));
  expect(direct.pixel).toBeGreaterThan(0);
  expect(direct.mosaic).toBeGreaterThan(0);
  await pickStyle(page, "Pixel Art");
  await expect(page.locator("body")).toHaveAttribute(
    "data-last-style-result",
    "pixel",
  );
});

test("raster controls change real pixels and cross-style history restores output", async ({
  page,
}) => {
  await trackStyles(page);
  await page.goto("/app");
  await upload17x13(page);
  await expect
    .poll(() => frameHash(page))
    .toMatchObject({ width: 17, height: 13 });
  await pickStyle(page, "Pixel Art");
  const pixelBaseline = await acceptedStyle(page, "pixel");
  await expect
    .poll(() => frameHash(page))
    .toMatchObject({ width: 17, height: 13 });
  const before = await frameHash(page);
  const brightness = page.getByRole("slider", { name: "Brightness" });
  await openControls(page);
  await page.getByRole("button", { name: "Color controls" }).click();
  await brightness.focus();
  await brightness.press("PageUp");
  const pixelBright = await acceptedStyle(
    page,
    "pixel",
    pixelBaseline.revision,
  );
  await expect
    .poll(async () => (await frameHash(page)).hash)
    .not.toBe(before.hash);
  const bright = await frameHash(page);
  const controlSheet = page.getByRole("dialog", { name: "Controls sheet" });
  if (await controlSheet.isVisible())
    await controlSheet.getByRole("button", { name: "Close panel" }).click();
  await pickStyle(page, "Mosaic");
  const mosaicSquare = await acceptedStyle(
    page,
    "mosaic",
    pixelBright.revision,
  );
  const square = await frameHash(page);
  await openControls(page);
  await expect(
    page.getByRole("button", { name: "Color controls" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Style controls" }).click();
  await page.getByRole("combobox", { name: "Tile Shape" }).selectOption("wide");
  const mosaicWide = await acceptedStyle(page, "mosaic", mosaicSquare.revision);
  await expect
    .poll(async () => (await frameHash(page)).hash)
    .not.toBe(square.hash);
  await history(page, "Undo");
  const mosaicRestored = await acceptedStyle(
    page,
    "mosaic",
    mosaicWide.revision,
  );
  await expect.poll(async () => (await frameHash(page)).hash).toBe(square.hash);
  await openControls(page);
  await expect(page.getByRole("combobox", { name: "Tile Shape" })).toHaveValue(
    "square",
  );
  const afterUndoSheet = page.getByRole("dialog", { name: "Controls sheet" });
  if (await afterUndoSheet.isVisible())
    await afterUndoSheet.getByRole("button", { name: "Close panel" }).click();
  await history(page, "Undo");
  const pixelRestored = await acceptedStyle(
    page,
    "pixel",
    mosaicRestored.revision,
  );
  const styleTrigger = page.getByRole("button", {
    name: "Styles",
    exact: true,
  });
  if (await styleTrigger.isVisible()) await styleTrigger.click();
  await expect(
    page.getByRole("button", { name: "Pixel Art — selected" }).first(),
  ).toHaveAttribute("aria-pressed", "true");
  const afterHistoryStyles = page.getByRole("dialog", { name: "Styles sheet" });
  if (await afterHistoryStyles.isVisible())
    await afterHistoryStyles
      .getByRole("button", { name: "Close panel" })
      .click();
  await expect.poll(async () => (await frameHash(page)).hash).toBe(bright.hash);
  await history(page, "Redo");
  const mosaicRedone = await acceptedStyle(
    page,
    "mosaic",
    pixelRestored.revision,
  );
  await history(page, "Redo");
  await acceptedStyle(page, "mosaic", mosaicRedone.revision);
  await expect
    .poll(async () => (await frameHash(page)).hash)
    .not.toBe(bright.hash);
});

test("Pixel and Mosaic export real full-frame PNG and JPEG", async ({
  page,
}) => {
  await page.goto("/app");
  await upload17x13(page);
  await pickStyle(page, "Pixel Art");
  await expect
    .poll(() => frameHash(page))
    .toMatchObject({ width: 17, height: 13 });
  expect(await exported(page, "png")).toEqual([17, 13]);
  expect(await exported(page, "jpeg")).toEqual([17, 13]);
  await pickStyle(page, "Mosaic");
  await expect
    .poll(() => frameHash(page))
    .toMatchObject({ width: 17, height: 13 });
  expect(await exported(page, "png")).toEqual([17, 13]);
  expect(await exported(page, "jpeg")).toEqual([17, 13]);
});

test("desktop widths and coarse tablet/fine narrow sheets preserve a shared project", async ({
  browser,
}, testInfo) => {
  for (const [name, viewport, hasTouch] of [
    ["desktop-1440", { width: 1440, height: 900 }, false],
    ["desktop-1920", { width: 1920, height: 1080 }, false],
    ["coarse-tablet", { width: 1024, height: 768 }, true],
    ["fine-narrow", { width: 780, height: 900 }, false],
  ] as const) {
    const context = await browser.newContext({ viewport, hasTouch });
    const page = await context.newPage();
    try {
      await page.goto("/app");
      await upload17x13(page);
      await pickStyle(page, "Mosaic");
      await openControls(page);
      await expect(
        page.getByRole("combobox", { name: "Tile Shape" }),
      ).toBeVisible();
      await page
        .getByRole("combobox", { name: "Tile Shape" })
        .selectOption("tall");
      await expect
        .poll(() => frameHash(page))
        .toMatchObject({ width: 17, height: 13 });
      const sheet = page.getByRole("dialog", { name: "Controls sheet" });
      if (await sheet.isVisible()) {
        await sheet.getByRole("button", { name: "Close panel" }).click();
        await expect(
          page.getByRole("button", { name: "Controls", exact: true }),
        ).toBeFocused();
        await openControls(page);
        await expect(
          page.getByRole("combobox", { name: "Tile Shape" }),
        ).toHaveValue("tall");
      }
      await page.screenshot({
        path: testInfo.outputPath(`${name}.png`),
        fullPage: true,
      });
    } finally {
      await context.close();
    }
  }
});

test("Braille uses a measured atlas through crop, rotation, threshold and equal PNG export", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await trackStyles(page);
  await page.goto("/app");
  await upload17x13(page);
  await pickStyle(page, "Braille");
  let latest = await acceptedStyle(page, "braille");
  const first = await frameHash(page);
  await page.getByRole("button", { name: "Crop", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Crop and rotate" });
  await dialog.getByLabel("Width (%)").fill("50");
  await dialog.getByLabel("Rotate clockwise").click();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await frameHash(page)).toEqual(first);
  await expect(
    page.getByRole("button", { name: "Crop", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Crop", exact: true }).click();
  await dialog.getByLabel("Width (%)").fill("50");
  await dialog.getByLabel("Rotate clockwise").click();
  await expect(
    dialog.getByRole("status", { name: "Effective dimensions" }),
  ).toHaveText("13 × 9 pixels");
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  latest = await acceptedStyle(page, "braille", latest.revision);
  expect(await frameHash(page)).toMatchObject({ width: 13, height: 9 });
  expect(await exported(page, "png")).toEqual([13, 9]);
  await history(page, "Undo");
  latest = await acceptedStyle(page, "braille", latest.revision);
  expect(await frameHash(page)).toEqual(first);
  await openControls(page);
  const threshold = page.getByRole("slider", {
    name: "Local profile threshold",
  });
  await threshold.fill("100");
  latest = await acceptedStyle(page, "braille", latest.revision);
  const high = await frameHash(page);
  await threshold.fill("0");
  await acceptedStyle(page, "braille", latest.revision);
  const low = await frameHash(page);
  expect(low.hash).not.toBe(high.hash);
  const controlsSheet = page.getByRole("dialog", { name: "Controls sheet" });
  if (await controlsSheet.isVisible())
    await controlsSheet.getByRole("button", { name: "Close controls", exact: true }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PNG", exact: true }).click();
  const stream = await (await pending).createReadStream(),
    chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const exportedHash = await page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(
      new Blob([bytes], { type: "image/png" }),
    );
    const c = document.createElement("canvas");
    c.width = bitmap.width;
    c.height = bitmap.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    let hash = 2166136261;
    for (const b of ctx.getImageData(0, 0, c.width, c.height).data)
      hash = Math.imul(hash ^ b, 16777619);
    return hash >>> 0;
  }, Buffer.concat(chunks).toString("base64"));
  expect(exportedHash).toBe(low.hash);
  await page.keyboard.press("Escape");
  await page.screenshot({
    path: "docs/verification/screenshots/studio-braille-crop.png",
  });
  expect(errors).toEqual([]);
});

test("mobile crop ratios, invalid draft and Escape preserve a usable source", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await trackStyles(page);
  await page.goto("/app");
  await upload17x13(page);
  const crop = page.getByRole("button", { name: "Crop", exact: true });
  await expect(crop).toBeVisible();
  await crop.click();
  const dialog = page.getByRole("dialog", { name: "Crop and rotate" });
  await dialog.getByLabel("Aspect ratio").selectOption("1:1");
  await expect(
    dialog.getByRole("status", { name: "Effective dimensions" }),
  ).toHaveText("13 × 13 pixels");
  await dialog.getByLabel("Width (%)").fill("0");
  await expect(
    dialog.getByRole("button", { name: "Apply", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(crop).toBeFocused();
  await crop.click();
  await expect(dialog.getByLabel("Width (%)")).toHaveValue("100");
  await dialog.getByLabel("Aspect ratio").selectOption("1:1");
  await dialog.getByLabel("Rotate counterclockwise").click();
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await expect
    .poll(async () => {
      const frame = await frameHash(page);
      return [frame.width, frame.height];
    })
    .toEqual([13, 13]);
  await page.screenshot({
    path: "docs/verification/screenshots/studio-crop-mobile.png",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
