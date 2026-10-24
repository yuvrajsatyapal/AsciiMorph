import { expect, test, type Page } from "@playwright/test";

type NativeIdentity = {
  revision: number;
  sourceId: string;
  sourceRevision: number;
  calibrationId: string;
  backend: string;
};
async function identity(page: Page): Promise<NativeIdentity> {
  return page.evaluate(() => {
    const values = (
      window as unknown as { __studioIdentities: NativeIdentity[] }
    ).__studioIdentities;
    if (!values.length) throw new Error("No native Characters result observed");
    return values[values.length - 1];
  });
}

const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    // Bounded protocol metadata only. Forward all native work unchanged; never
    // retain source/frame buffers or expose an alternate rendering endpoint.
    const values: NativeIdentity[] = [];
    Object.defineProperty(window, "__studioIdentities", { value: values });
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      previews = new Set<string>();
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener("message", ({ data }) => {
          if (
            data?.type !== "charactersResult" ||
            !this.previews.has(data.requestId)
          )
            return;
          values.push({
            revision: data.revision,
            sourceId: data.sourceId,
            sourceRevision: data.sourceRevision,
            calibrationId: data.calibrationId,
            backend: data.backend,
          });
          if (values.length > 64) values.shift();
          this.previews.delete(data.requestId);
        });
      }
      postMessage(
        message: unknown,
        options?: Transferable[] | StructuredSerializeOptions,
      ) {
        const request = message as { type?: string; requestId: string };
        if (request?.type === "renderCharactersPreview") {
          this.previews.add(request.requestId);
          if (this.previews.size > 64)
            this.previews.delete(this.previews.values().next().value!);
        }
        if (Array.isArray(options)) super.postMessage(message, options);
        else super.postMessage(message, options);
      }
    };
    const native = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
      native.call(
        this,
        (blob) => {
          document.body.dataset.nativeMime = blob?.type ?? "null";
          callback(blob);
        },
        type,
        quality,
      );
    };
  });
});
test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page), "Unhandled production browser errors").toEqual(
    [],
  );
});

const preview = (page: Page) => page.getByLabel("Rendered Characters preview");
async function ready(page: Page, width?: number, height?: number) {
  await expect
    .poll(
      () =>
        preview(page).evaluate((c: HTMLCanvasElement) => [c.width, c.height]),
      { timeout: 30000 },
    )
    .toEqual([width ?? 1000, height ?? 1000]);
  await expect(page.locator(".studio-stage-status")).toHaveText("");
}
async function pixels(page: Page, label = "Rendered Characters preview") {
  return page.getByLabel(label).evaluate((c: HTMLCanvasElement) => {
    const bytes = c
      .getContext("2d")!
      .getImageData(0, 0, c.width, c.height).data;
    let hash = 2166136261,
      minAlpha = 255,
      maxAlpha = 0;
    for (let i = 0; i < bytes.length; i++) {
      hash = Math.imul(hash ^ bytes[i], 16777619);
      if (i % 4 === 3) {
        minAlpha = Math.min(minAlpha, bytes[i]);
        maxAlpha = Math.max(maxAlpha, bytes[i]);
      }
    }
    return {
      width: c.width,
      height: c.height,
      hash: hash >>> 0,
      minAlpha,
      maxAlpha,
      corner: Array.from(bytes.slice(-4)),
    };
  });
}
async function upload(
  page: Page,
  width = 67,
  height = 53,
  transparent = false,
) {
  const base64 = await page.evaluate(
    ({ width, height, transparent }) => {
      const c = document.createElement("canvas");
      c.width = width;
      c.height = height;
      const ctx = c.getContext("2d")!,
        image = ctx.createImageData(width, height);
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          image.data.set(
            [
              (x * 17 + y * 3) % 256,
              (x * 5 + y * 19) % 256,
              (x * 11 + y * 7) % 256,
              transparent ? 0 : 255,
            ],
            i,
          );
        }
      ctx.putImageData(image, 0, 0);
      return c.toDataURL("image/png").split(",")[1];
    },
    { width, height, transparent },
  );
  await page.getByLabel("Upload image file").setInputFiles({
    name: "owned-procedural.png",
    mimeType: "image/png",
    buffer: Buffer.from(base64, "base64"),
  });
  await expect
    .poll(() =>
      page.getByLabel("Original source comparison").evaluate(
        (c: HTMLCanvasElement, expected) => {
          if (c.width !== expected.width || c.height !== expected.height)
            return false;
          const data = c
            .getContext("2d")!
            .getImageData(0, 0, c.width, c.height).data;
          for (let y = 0; y < c.height; y++)
            for (let x = 0; x < c.width; x++) {
              const i = (y * c.width + x) * 4;
              const pixel = expected.transparent
                ? [0, 0, 0, 0]
                : [
                    (x * 17 + y * 3) % 256,
                    (x * 5 + y * 19) % 256,
                    (x * 11 + y * 7) % 256,
                    255,
                  ];
              if (pixel.some((b, channel) => data[i + channel] !== b))
                return false;
            }
          return true;
        },
        { width, height, transparent },
      ),
    )
    .toBe(true);
  await ready(page, width, height);
}
async function controls(page: Page) {
  const button = page.getByRole("button", { name: "Controls", exact: true });
  if (await button.isVisible()) await button.click();
}
async function closeSheet(page: Page) {
  const sheet = page.getByRole("dialog", { name: "Controls sheet" });
  if (await sheet.isVisible())
    await sheet
      .getByRole("button", { name: "Close panel", exact: true })
      .click();
}
async function pointerHistory(page: Page, action: "Undo" | "Redo") {
  const toolbarAction = page.locator(".studio-toolbar").getByRole("button", {
    name: action,
    exact: true,
  });
  if (await toolbarAction.isVisible()) {
    await toolbarAction.click();
    return;
  }
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  const menu = page.getByRole("dialog", { name: "Studio menu", exact: true });
  const historyAction = menu.getByRole("button", { name: action, exact: true });
  await expect(historyAction).toBeVisible();
  await historyAction.click();
  await menu
    .getByRole("button", { name: "Close Studio menu", exact: true })
    .click();
}
async function download(page: Page, format: "png" | "jpeg", scale = 1) {
  if (!(await page.getByRole("dialog", { name: "Export image" }).isVisible()))
    await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByLabel("Format", { exact: true }).selectOption(format);
  await page.getByLabel("Scale", { exact: true }).selectOption(String(scale));
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", {
      name: `Export ${format.toUpperCase()}`,
      exact: true,
    })
    .click();
  const result = await pending,
    stream = await result.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const bytes = Buffer.concat(chunks);
  const nativeMime = await page
    .locator("body")
    .getAttribute("data-native-mime");
  expect(nativeMime).toBe(`image/${format}`);
  expect(result.suggestedFilename()).toMatch(new RegExp(`\\.${format}$`));
  expect(bytes.subarray(0, format === "png" ? 8 : 3).toString("hex")).toBe(
    format === "png" ? "89504e470d0a1a0a" : "ffd8ff",
  );
  const decoded = await page.evaluate(
    async ({ base64, mime }) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)),
        blob = new Blob([bytes], { type: mime });
      const bitmap = await createImageBitmap(blob),
        c = document.createElement("canvas");
      c.width = bitmap.width;
      c.height = bitmap.height;
      c.getContext("2d")!.drawImage(bitmap, 0, 0);
      bitmap.close();
      const data = c
        .getContext("2d")!
        .getImageData(0, 0, c.width, c.height).data;
      const preview = document.querySelector<HTMLCanvasElement>(
        'canvas[aria-label="Rendered Characters preview"]',
      )!;
      const expected = preview
        .getContext("2d")!
        .getImageData(0, 0, preview.width, preview.height).data;
      const equalsPreview =
        preview.width === c.width &&
        preview.height === c.height &&
        data.every((b, i) => b === expected[i]);
      let hash = 2166136261,
        minAlpha = 255,
        maxAlpha = 0,
        maxRGB = 0;
      for (let i = 0; i < data.length; i++) {
        hash = Math.imul(hash ^ data[i], 16777619);
        if (i % 4 === 3) {
          minAlpha = Math.min(minAlpha, data[i]);
          maxAlpha = Math.max(maxAlpha, data[i]);
        } else maxRGB = Math.max(maxRGB, data[i]);
      }
      return {
        width: c.width,
        height: c.height,
        hash: hash >>> 0,
        minAlpha,
        maxAlpha,
        maxRGB,
        corner: Array.from(data.slice(-4)),
        mime: blob.type,
        equalsPreview,
      };
    },
    { base64: bytes.toString("base64"), mime: `image/${format}` },
  );
  await expect(
    page.getByText("Download started.", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  return decoded;
}

test("production native PNG/JPEG download bytes, full frame, alpha and black matte", async ({
  page,
  browser,
}, testInfo) => {
  testInfo.setTimeout(90000);
  console.log(`Browser: ${browser.browserType().name()} ${browser.version()}`);
  await page.goto("/app");
  await ready(page);
  const original = await pixels(page, "Original source comparison"),
    painted = await pixels(page);
  expect((await identity(page)).backend).toBe("rust-cpu");
  expect(painted.hash).not.toBe(original.hash);
  const defaultPNG = await download(page, "png");
  expect(defaultPNG).toMatchObject({
    width: 1000,
    height: 1000,
    hash: painted.hash,
    mime: "image/png",
    equalsPreview: true,
  });
  expect(await download(page, "jpeg")).toMatchObject({
    width: 1000,
    height: 1000,
    minAlpha: 255,
    mime: "image/jpeg",
  });
  await upload(page);
  const small = await pixels(page);
  expect(await download(page, "png")).toMatchObject({
    width: 67,
    height: 53,
    hash: small.hash,
    corner: small.corner,
  });
  for (const scale of [2, 3, 4])
    expect(await download(page, "png", scale)).toMatchObject({
      width: 67 * scale,
      height: 53 * scale,
    });
  await upload(page, 67, 53, true);
  const transparent = await pixels(page);
  expect(transparent.minAlpha).toBe(0);
  expect(transparent.maxAlpha).toBe(0);
  expect(await download(page, "png")).toMatchObject({
    minAlpha: 0,
    maxAlpha: 0,
    hash: transparent.hash,
  });
  expect(await download(page, "jpeg")).toMatchObject({
    minAlpha: 255,
    maxAlpha: 255,
    maxRGB: 0,
  });
});

test("coarse 390px phone exposes pointer-only Menu history with actual native preview restoration", async ({
  browser,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "Explicit coarse Chromium context runs once",
  );
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 1,
  });
  const phone = await context.newPage();
  const errors: string[] = [];
  phone.on("pageerror", (error) => errors.push(error.message));
  // This flow has no keyboard API: both the edit and all history actions are visible taps.
  await phone.addInitScript(() => {
    let count = 0;
    document.addEventListener("keydown", () => {
      document.documentElement.dataset.historyKeyCount = String(++count);
    });
  });
  try {
    await phone.goto("/app");
    await ready(phone);
    expect(
      await phone.evaluate(() => matchMedia("(pointer: coarse)").matches),
    ).toBe(true);
    await upload(phone);
    const first = await pixels(phone);
    await phone.getByRole("button", { name: "Controls", exact: true }).tap();
    const sheet = phone.getByRole("dialog", { name: "Controls sheet" });
    const slider = sheet.getByRole("slider", {
      name: "Font Size",
      exact: true,
    });
    const bounds = await slider.boundingBox();
    expect(bounds).not.toBeNull();
    await phone.touchscreen.tap(
      bounds!.x + bounds!.width * 0.8,
      bounds!.y + bounds!.height / 2,
    );
    await expect
      .poll(async () => (await pixels(phone)).hash)
      .not.toBe(first.hash);
    await ready(phone, 67, 53);
    const edited = await pixels(phone);
    await sheet.getByRole("button", { name: "Close panel", exact: true }).tap();
    await phone.getByRole("button", { name: "Menu", exact: true }).tap();
    const menu = phone.getByRole("dialog", {
      name: "Studio menu",
      exact: true,
    });
    const undo = menu.getByRole("button", { name: "Undo", exact: true });
    const redo = menu.getByRole("button", { name: "Redo", exact: true });
    await expect(undo).toBeVisible();
    await expect(undo).toBeEnabled();
    await expect(redo).toBeDisabled();
    for (const action of [undo, redo]) {
      const target = await action.boundingBox();
      expect(target!.width).toBeGreaterThanOrEqual(44);
      expect(target!.height).toBeGreaterThanOrEqual(44);
    }
    await undo.tap();
    await expect.poll(async () => (await pixels(phone)).hash).toBe(first.hash);
    await expect(undo).toBeDisabled();
    await expect(redo).toBeEnabled();
    await redo.tap();
    await expect.poll(async () => (await pixels(phone)).hash).toBe(edited.hash);
    await expect(undo).toBeEnabled();
    await expect(redo).toBeDisabled();
    expect(await phone.getByRole("dialog").count()).toBe(1);
    expect(
      await phone.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const keyboardEvents = await phone.evaluate(() =>
      Number(document.documentElement.dataset.historyKeyCount ?? 0),
    );
    expect(keyboardEvents).toBe(0);
    expect(errors).toEqual([]);
    await phone.screenshot({
      path: "docs/verification/studio-shell-evidence/final-fix-coarse-phone-menu-390x844.png",
    });
    await testInfo.attach("coarse-phone-history", {
      body: Buffer.from(
        JSON.stringify({
          viewport: { width: 390, height: 844 },
          first,
          edited,
          restoredAfterRedo: await pixels(phone),
          keyboardEvents,
        }),
      ),
      contentType: "application/json",
    });
  } finally {
    await context.close();
  }
});

test("four controls repaint one retained source, grouped history, native undo and compare release", async ({
  page,
}) => {
  await page.goto("/app");
  await ready(page);
  await upload(page);
  await controls(page);
  const original = await pixels(page, "Original source comparison"),
    first = await pixels(page);
  let previousIdentity = await identity(page);
  const assertAdvanced = async () => {
    await expect(page.locator(".studio-stage-status")).toHaveText("");
    const current = await identity(page);
    expect(current.revision).toBeGreaterThan(previousIdentity.revision);
    expect(current.sourceId).toBe(previousIdentity.sourceId);
    expect(current.sourceRevision).toBe(previousIdentity.sourceRevision);
    expect(current.backend).toBe("rust-cpu");
    previousIdentity = current;
  };
  const font = page.getByRole("slider", { name: "Font Size", exact: true });
  await font.focus();
  await page.keyboard.down("ArrowRight");
  await page.keyboard.down("ArrowRight");
  await page.keyboard.down("ArrowRight");
  await page.keyboard.up("ArrowRight");
  await expect.poll(async () => (await pixels(page)).hash).not.toBe(first.hash);
  await assertAdvanced();
  const fontPaint = await pixels(page);
  await closeSheet(page);
  await pointerHistory(page, "Undo");
  await expect.poll(async () => (await pixels(page)).hash).toBe(first.hash);
  await assertAdvanced();
  await pointerHistory(page, "Redo");
  await expect.poll(async () => (await pixels(page)).hash).toBe(fontPaint.hash);
  await assertAdvanced();
  await controls(page);
  const ramp = page.getByRole("textbox", {
    name: "Character Set",
    exact: true,
  });
  await ramp.fill("@#:. ");
  await ramp.press("Enter");
  await expect
    .poll(async () => (await pixels(page)).hash)
    .not.toBe(fontPaint.hash);
  await assertAdvanced();
  expect(await ramp.inputValue()).toBe("@#:. ");
  const rampPaint = await pixels(page);
  await ramp.fill("@@");
  await expect(ramp).toHaveAttribute("aria-invalid", "true");
  expect((await pixels(page)).hash).toBe(rampPaint.hash);
  await ramp.fill("@#:. ");
  await ramp.press("Enter");
  await page.evaluate(() => {
    window.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z")
        document.body.dataset.nativeUndoPrevented = String(e.defaultPrevented);
    });
  });
  await ramp.focus();
  await page.keyboard.press("End");
  await page.keyboard.type("+");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator("body")).toHaveAttribute(
    "data-native-undo-prevented",
    "false",
  );
  await ramp.fill("@#:. ");
  await ramp.press("Enter");
  await page
    .getByRole("button", { name: "Color controls", exact: true })
    .click();
  let before = await pixels(page);
  for (const name of ["Brightness", "Contrast"]) {
    const range = page.getByRole("slider", { name, exact: true });
    await range.focus();
    await page.keyboard.press("End");
    await expect
      .poll(async () => (await pixels(page)).hash)
      .not.toBe(before.hash);
    await assertAdvanced();
    before = await pixels(page);
    expect(await pixels(page, "Original source comparison")).toEqual(original);
  }
  await closeSheet(page);
  const toggle = page.getByRole("button", {
    name: "Toggle original comparison",
    exact: true,
  });
  if (await toggle.isVisible()) {
    await toggle.click();
    await expect(page.getByLabel("Original source comparison")).toBeVisible();
    await toggle.click();
    await expect(preview(page)).toBeVisible();
  }
  const hold = page.getByRole("button", {
    name: "Hold to compare",
    exact: true,
  });
  if (await hold.isVisible()) {
    await hold.focus();
    await page.keyboard.down("Space");
    await expect(page.getByLabel("Original source comparison")).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await page.keyboard.up("Space");
    await expect(preview(page)).toBeVisible();
    await hold.hover();
    await page.mouse.down();
    await hold.dispatchEvent("pointercancel", { pointerId: 1 });
    await page.mouse.up();
    await expect(preview(page)).toBeVisible();
  }
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  expect(await pixels(page)).toEqual(before);
  expect(await identity(page)).toEqual(previousIdentity);
  expect(await download(page, "png")).toMatchObject({
    width: 67,
    height: 53,
    hash: before.hash,
  });
});

test("catalog filters/favorites and panel geometry stay independent of render pixels", async ({
  page,
}) => {
  await page.goto("/app");
  await ready(page);
  await upload(page);
  const before = await pixels(page);
  const styles = page.getByRole("button", { name: "Styles", exact: true });
  const compact = await styles.isVisible();
  if (compact) await styles.click();
  await page
    .getByRole("textbox", { name: "Search styles", exact: true })
    .fill("Characters");
  await expect(
    page.getByRole("button", { name: "Characters — selected", exact: true }),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "Favorite Characters", exact: true })
    .click();
  await page.getByRole("button", { name: "Favorites", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Unfavorite Characters", exact: true }),
  ).toBeVisible();
  await page
    .locator('select[aria-label="Category"]:visible')
    .selectOption({ index: 2 });
  await expect(
    page.getByText(
      "No styles match. Try another category or clear your search.",
    ),
  ).toBeVisible();
  await page
    .locator('select[aria-label="Category"]:visible')
    .selectOption("all");
  await page.getByRole("button", { name: "All styles", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Search styles", exact: true })
    .fill("");
  if (compact) await page.keyboard.press("Escape");
  else {
    const resize = page.getByRole("separator", {
      name: "Resize style catalog",
    });
    await resize.focus();
    await resize.press("End");
    await expect(resize).toHaveAttribute("aria-valuenow", "420");
    await resize.press("Home");
    await expect(resize).toHaveAttribute("aria-valuenow", "240");
    await page
      .getByRole("button", { name: "Collapse style catalog", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Expand style catalog", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Collapse controls", exact: true })
      .click();
    await expect(page.locator(".studio-property-content")).toHaveAttribute(
      "inert",
      "",
    );
    await page
      .getByRole("button", { name: "Open controls", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Close controls", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Open controls", exact: true })
      .click();
  }
  expect(await pixels(page)).toEqual(before);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
]) {
  test(`owned production screenshot and shell bounds ${viewport.width}x${viewport.height}`, async ({
    page,
    browserName,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop",
      "Fixed desktop-engine visual evidence; capability contexts are separate tests.",
    );
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/app");
    await ready(page);
    await page.evaluate(() => document.fonts.ready);
    if (viewport.width >= 1440) {
      const bounds = await page
        .locator(
          ".studio-toolbar, .studio-catalog, .studio-stage, .studio-properties, .studio-property-rail, .studio-actions",
        )
        .evaluateAll((els) =>
          els.map((e) => {
            const r = e.getBoundingClientRect();
            return {
              class: e.className,
              x: r.x,
              y: r.y,
              width: r.width,
              height: r.height,
            };
          }),
        );
      await testInfo.attach("principal-bounds.json", {
        body: JSON.stringify(bounds, null, 2),
        contentType: "application/json",
      });
      expect(bounds.find((b) => b.class === "studio-toolbar")).toMatchObject({
        x: 0,
        y: 0,
        width: viewport.width,
        height: 52,
      });
      expect(
        bounds.find((b) => b.class.trim() === "studio-catalog"),
      ).toMatchObject({
        x: 0,
        y: 52,
        width: 320,
        height: viewport.height - 52,
      });
      expect(bounds.find((b) => b.class === "studio-stage")).toMatchObject({
        x: 320,
        y: 52,
        width: viewport.width - 660,
        height: viewport.height - 52,
      });
      expect(
        bounds.find((b) => b.class.trim().startsWith("studio-properties")),
      ).toMatchObject({
        x: viewport.width - 340,
        y: 52,
        width: 340,
        height: viewport.height - 52,
      });
      expect(
        bounds.find((b) => b.class === "studio-property-rail"),
      ).toMatchObject({ width: 54 });
      expect(bounds.find((b) => b.class === "studio-actions")).toMatchObject({
        width: 568,
        height: 50,
        y: viewport.height - 72,
      });
    }
    await page.screenshot({
      path: `docs/verification/studio-shell-evidence/task6-${browserName}-fine-${viewport.width}x${viewport.height}.png`,
    });
  });
}

test("forced colors retain visible keyboard focus and the help dialog restores scroll", async ({
  page,
}) => {
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await page.goto("/app");
  await ready(page);
  const help = page.getByRole("button", { name: "Help", exact: true });
  await help.focus();
  await page.keyboard.press("Tab");
  const focus = await page.locator(":focus").evaluate((el) => {
    const s = getComputedStyle(el);
    return { outline: s.outlineStyle, width: parseFloat(s.outlineWidth) };
  });
  expect(focus.outline).not.toBe("none");
  expect(focus.width).toBeGreaterThan(0);
  const previous = await page.locator("body").evaluate((b) => b.style.overflow);
  await help.click();
  await expect(
    page.getByRole("dialog", { name: "Studio help", exact: true }),
  ).toBeVisible();
  expect(await page.locator("body").evaluate((b) => b.style.overflow)).toBe(
    "hidden",
  );
  await page.keyboard.press("Escape");
  await expect(help).toBeFocused();
  expect(await page.locator("body").evaluate((b) => b.style.overflow)).toBe(
    previous,
  );
});
