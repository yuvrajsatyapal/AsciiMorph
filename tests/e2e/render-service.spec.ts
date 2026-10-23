import { expect, test, type Page } from "@playwright/test";

async function waitFrame(page: Page, width = 1000, height = 1000) {
  await expect
    .poll(
      () =>
        page
          .getByLabel("Rendered Characters preview")
          .evaluate((c: HTMLCanvasElement) => [c.width, c.height]),
      { timeout: 30000 },
    )
    .toEqual([width, height]);
  await expect(page.locator(".studio-stage-status")).toHaveText("");
}
async function hash(page: Page, original = false) {
  return page
    .getByLabel(
      original ? "Original source comparison" : "Rendered Characters preview",
    )
    .evaluate((c: HTMLCanvasElement) => {
      let h = 2166136261;
      for (const b of c.getContext("2d")!.getImageData(0, 0, c.width, c.height)
        .data)
        h = Math.imul(h ^ b, 16777619);
      return h >>> 0;
    });
}
async function file(page: Page, width: number, height: number, salt = 1) {
  const b64 = await page.evaluate(
    ({ width, height, salt }) => {
      const c = document.createElement("canvas");
      c.width = width;
      c.height = height;
      const ctx = c.getContext("2d")!,
        image = ctx.createImageData(width, height);
      for (let i = 0; i < image.data.length; i += 4)
        image.data.set(
          [(i * salt) % 256, ((i / 4) * 7) % 256, ((i / width) * 3) % 256, 255],
          i,
        );
      ctx.putImageData(image, 0, 0);
      return c.toDataURL().split(",")[1];
    },
    { width, height, salt },
  );
  return {
    name: `owned-${width}-${salt}.png`,
    mimeType: "image/png",
    buffer: Buffer.from(b64, "base64"),
  };
}
async function showControls(page: Page) {
  const b = page.getByRole("button", { name: "Controls", exact: true });
  if (await b.isVisible()) await b.click();
}

type RaceIdentity = {
  requestId: string;
  revision: number;
  sourceId: string;
  sourceRevision: number;
  calibrationId: string;
};
type RaceFrame = RaceIdentity & {
  width: number;
  height: number;
  hash: number;
  backend: string;
};
type RacePaint = {
  width: number;
  height: number;
  hash: number;
  result: RaceFrame | null;
  latestRequest: RaceIdentity | null;
};
type RaceSnapshot = {
  held: RaceFrame | null;
  requests: RaceIdentity[];
  results: RaceFrame[];
  paints: RacePaint[];
  dropped: number;
  released: boolean;
  unchangedPayload: boolean;
};
type RaceProbe = {
  arm(): void;
  snapshot(): RaceSnapshot;
  release(): Promise<void>;
};

test("real production worker: deferred obsolete response cannot paint over newer source/atlas/parameters", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    const requests: RaceIdentity[] = [],
      results: RaceFrame[] = [],
      paints: RacePaint[] = [];
    let armed = false,
      recording = false,
      dropped = 0,
      released = false,
      unchangedPayload = false;
    let latestRequest: RaceIdentity | null = null;
    let held: {
      event: MessageEvent;
      data: { frame: { rgba: Uint8Array } };
      frame: RaceFrame;
      deliver(): void;
    } | null = null;
    const bytesHash = (bytes: ArrayLike<number>) => {
      let value = 2166136261;
      for (let i = 0; i < bytes.length; i++)
        value = Math.imul(value ^ bytes[i], 16777619);
      return value >>> 0;
    };
    const append = <T>(values: T[], value: T) => {
      values.push(value);
      if (values.length > 32) {
        values.shift();
        dropped++;
      }
    };
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      previews = new Map<string, RaceIdentity>();
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        const add = this.addEventListener.bind(this),
          remove = this.removeEventListener.bind(this);
        const listeners = new Map<
          EventListenerOrEventListenerObject,
          EventListener
        >();
        // Defer delivery to the actual service callback, preserving the original
        // native MessageEvent and packet. Redispatching a stopped DOM event does
        // not consistently invoke listeners across browser engines.
        this.addEventListener = ((
          type: string,
          listener: EventListenerOrEventListenerObject | null,
          options?: boolean | AddEventListenerOptions,
        ) => {
          if (!listener) return;
          if (type !== "message") {
            add(type, listener, options);
            return;
          }
          if (listeners.has(listener)) {
            add(type, listeners.get(listener)!, options);
            return;
          }
          if (listeners.size >= 32)
            throw new Error("Race probe message-listener bound exceeded");
          const wrapped: EventListener = (incoming) => {
            const event = incoming as MessageEvent;
            const data = event.data;
            const invoke = () => {
              if (typeof listener === "function") listener.call(this, event);
              else listener.handleEvent(event);
            };
            if (
              data?.type !== "charactersResult" ||
              !this.previews.has(data.requestId)
            ) {
              invoke();
              return;
            }
            const frame: RaceFrame = {
              requestId: data.requestId,
              revision: data.revision,
              sourceId: data.sourceId,
              sourceRevision: data.sourceRevision,
              calibrationId: data.calibrationId,
              width: data.frame.width,
              height: data.frame.height,
              hash: bytesHash(data.frame.rgba),
              backend: data.backend,
            };
            const deliver = () => {
              if (recording) append(results, frame);
              this.previews.delete(data.requestId);
              invoke();
            };
            if (armed && !held && frame.width === 173 && frame.height === 131) {
              held = { event, data, frame, deliver };
              armed = false;
              return;
            }
            deliver();
          };
          listeners.set(listener, wrapped);
          add(type, wrapped, options);
        }) as typeof this.addEventListener;
        this.removeEventListener = ((
          type: string,
          listener: EventListenerOrEventListenerObject | null,
          options?: boolean | EventListenerOptions,
        ) => {
          if (!listener) return;
          const wrapped = listeners.get(listener);
          remove(type, wrapped ?? listener, options);
          if (type === "message" && listener) listeners.delete(listener);
        }) as typeof this.removeEventListener;
      }
      postMessage(
        message: unknown,
        options?: Transferable[] | StructuredSerializeOptions,
      ) {
        const request = message as RaceIdentity & { type?: string };
        if (request?.type === "renderCharactersPreview") {
          const identity = {
            requestId: request.requestId,
            revision: request.revision,
            sourceId: request.sourceId,
            sourceRevision: request.sourceRevision,
            calibrationId: request.calibrationId,
          };
          this.previews.set(request.requestId, identity);
          if (this.previews.size > 32) {
            this.previews.delete(this.previews.keys().next().value!);
            dropped++;
          }
          latestRequest = identity;
          if (recording) append(requests, identity);
        }
        if (Array.isArray(options)) super.postMessage(message, options);
        else super.postMessage(message, options);
      }
    };
    const nativePaint = CanvasRenderingContext2D.prototype.putImageData as (
      this: CanvasRenderingContext2D,
      image: ImageData,
      dx: number,
      dy: number,
      dirtyX?: number,
      dirtyY?: number,
      dirtyWidth?: number,
      dirtyHeight?: number,
    ) => void;
    CanvasRenderingContext2D.prototype.putImageData = function (
      image: ImageData,
      dx: number,
      dy: number,
      dirtyX?: number,
      dirtyY?: number,
      dirtyWidth?: number,
      dirtyHeight?: number,
    ) {
      if (dirtyX === undefined) nativePaint.call(this, image, dx, dy);
      else
        nativePaint.call(
          this,
          image,
          dx,
          dy,
          dirtyX,
          dirtyY!,
          dirtyWidth!,
          dirtyHeight!,
        );
      if (
        !recording ||
        this.canvas.getAttribute("aria-label") !== "Rendered Characters preview"
      )
        return;
      // Observe the actual canvas after the native paint, not merely a packet.
      const width = this.canvas.width,
        height = this.canvas.height;
      const hash = bytesHash(this.getImageData(0, 0, width, height).data);
      const result =
        [...results]
          .reverse()
          .find(
            (value) =>
              value.width === width &&
              value.height === height &&
              value.hash === hash,
          ) ?? null;
      append(paints, { width, height, hash, result, latestRequest });
    };
    Object.defineProperty(window, "__studioRace", {
      value: {
        arm() {
          recording = armed = true;
          requests.length = results.length = paints.length = 0;
          dropped = 0;
        },
        snapshot() {
          return {
            held: held?.frame ?? null,
            requests: [...requests],
            results: [...results],
            paints: [...paints],
            dropped,
            released,
            unchangedPayload,
          };
        },
        async release() {
          if (!held)
            throw new Error("No single retained native response to release");
          const original = held;
          // Invoke the actual registered service callback exactly once with the
          // unchanged original native event/data. Never fabricate a success.
          const originalHash = bytesHash(original.data.frame.rgba);
          original.deliver();
          released = true;
          unchangedPayload =
            original.event.data === original.data &&
            originalHash === original.frame.hash &&
            bytesHash(original.data.frame.rgba) === originalHash;
          held = null;
          // Delivery/listener resolution is synchronous; drain its promise/React
          // paint work through actual animation frames instead of a timed sleep.
          await Promise.resolve();
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          );
        },
      } satisfies RaceProbe,
    });
  });
  const observe = () =>
    page.evaluate(() =>
      (
        window as unknown as { __studioRace: RaceProbe }
      ).__studioRace.snapshot(),
    );
  await page.goto("/app");
  await waitFrame(page);
  const a = await file(page, 173, 131),
    b = await file(page, 67, 53, 3);
  const input = page.getByLabel("Upload image file");
  await input.setInputFiles(b);
  await waitFrame(page, 67, 53);
  await showControls(page);
  const ramp = page.getByRole("textbox", {
    name: "Character Set",
    exact: true,
  });
  await ramp.fill("@#:. ");
  await ramp.press("Enter");
  await expect(page.locator(".studio-stage-status")).toHaveText("");
  const font = page.getByRole("slider", { name: "Font Size", exact: true });
  const expectedAt11 = await hash(page),
    original = await hash(page, true);
  await font.focus();
  await font.press("ArrowRight");
  await expect(page.locator(".studio-stage-status")).toHaveText("");
  const expectedAt12 = await hash(page);
  expect(expectedAt12).not.toBe(expectedAt11);
  // Give the older source a different measured atlas from the final source.
  await ramp.fill("@#%. ");
  await ramp.press("Enter");
  await expect(page.locator(".studio-stage-status")).toHaveText("");
  await page.evaluate(() =>
    (window as unknown as { __studioRace: RaceProbe }).__studioRace.arm(),
  );
  await input.setInputFiles(a);
  await expect.poll(async () => (await observe()).held?.width).toBe(173);
  const older = (await observe()).held!;
  expect(older.backend).toBe("rust-cpu");
  expect((await observe()).requests).toContainEqual({
    requestId: older.requestId,
    revision: older.revision,
    sourceId: older.sourceId,
    sourceRevision: older.sourceRevision,
    calibrationId: older.calibrationId,
  });
  expect((await observe()).results).toHaveLength(0);
  expect((await observe()).paints).toHaveLength(0);

  // The older genuine response is demonstrably still undelivered when this
  // upload and these atlas edits issue a newer native request/result/paint.
  await input.setInputFiles(b);
  await ramp.fill("@#o. ");
  await ramp.fill("@#:. ");
  await ramp.press("Enter");
  await waitFrame(page, 67, 53);
  await expect.poll(() => hash(page)).toBe(expectedAt12);
  const beforeRelease = await observe();
  expect(beforeRelease.held).toEqual(older);
  const newerPaint = beforeRelease.paints.at(-1)!;
  expect(newerPaint.hash).toBe(expectedAt12);
  expect(newerPaint.result).not.toBeNull();
  const newer = newerPaint.result!;
  expect(newer.backend).toBe("rust-cpu");
  expect(newer.revision).toBeGreaterThan(older.revision);
  expect(newer.sourceId).not.toBe(older.sourceId);
  expect(newer.calibrationId).not.toBe(older.calibrationId);
  expect(newerPaint.latestRequest?.requestId).toBe(newer.requestId);
  expect(
    beforeRelease.requests.some(
      (request) => request.requestId === newer.requestId,
    ),
  ).toBe(true);
  expect(older.hash).not.toBe(newer.hash);

  await page.evaluate(() =>
    (window as unknown as { __studioRace: RaceProbe }).__studioRace.release(),
  );
  const afterRelease = await observe();
  expect(afterRelease).toMatchObject({
    held: null,
    released: true,
    unchangedPayload: true,
    dropped: 0,
  });
  expect(afterRelease.results.at(-1)).toEqual(older);
  expect(afterRelease.paints).toEqual(beforeRelease.paints);
  expect(await hash(page)).toBe(expectedAt12);
  expect(await hash(page, true)).toBe(original);

  // A subsequent genuine native request/result/paint is a settlement barrier;
  // keep observing every paint while the service proceeds after the late event.
  await font.focus();
  await font.press("ArrowLeft");
  await expect(page.locator(".studio-stage-status")).toHaveText("");
  await expect.poll(() => hash(page)).toBe(expectedAt11);
  const settled = await observe();
  expect(settled.dropped).toBe(0);
  expect(settled.paints.length).toBeGreaterThan(beforeRelease.paints.length);
  expect(settled.paints.at(-1)?.result?.revision).toBeGreaterThan(
    newer.revision,
  );
  for (const paint of settled.paints) {
    expect(
      paint.result,
      "Every actual preview paint must match a real native result",
    ).not.toBeNull();
    expect(paint.result?.requestId, "Only the current request may paint").toBe(
      paint.latestRequest?.requestId,
    );
    expect(paint.result?.sourceId).not.toBe(older.sourceId);
    expect(paint.hash).not.toBe(older.hash);
    expect([paint.width, paint.height]).toEqual([67, 53]);
  }
  expect(await hash(page, true)).toBe(original);
  await testInfo.attach("native-stale-response-paint-history.json", {
    body: JSON.stringify({ older, newer, settled }, null, 2),
    contentType: "application/json",
  });
});

test("above-1600 retained upload and export geometry remains unchanged within admission", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.goto("/app");
  await waitFrame(page);
  await page
    .getByLabel("Upload image file")
    .setInputFiles(await file(page, 1703, 1001));
  await waitFrame(page, 1703, 1001);
  expect(
    await page
      .getByLabel("Original source comparison")
      .evaluate((c: HTMLCanvasElement) => [c.width, c.height]),
  ).toEqual([1703, 1001]);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await expect(
    page.getByLabel("Scale", { exact: true }).locator("option[value='1']"),
  ).toHaveText("1× · 1703 × 1001");
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PNG", exact: true }).click();
  const stream = await (await downloaded).createReadStream(),
    parts: Buffer[] = [];
  for await (const p of stream!) parts.push(Buffer.from(p));
  const bytes = Buffer.concat(parts);
  expect(bytes.readUInt32BE(16)).toBe(1703);
  expect(bytes.readUInt32BE(20)).toBe(1001);
});

test("decode/SVG failures preserve painted source and never send local-source network traffic", async ({
  page,
}) => {
  const requests: Array<{ url: string; method: string }> = [];
  page
    .context()
    .on("request", (r) => requests.push({ url: r.url(), method: r.method() }));
  await page.goto("/app");
  await waitFrame(page);
  await page
    .getByLabel("Upload image file")
    .setInputFiles(await file(page, 67, 53));
  await waitFrame(page, 67, 53);
  const before = await hash(page),
    original = await hash(page, true),
    input = page.getByLabel("Upload image file");
  await input.setInputFiles({
    name: "rejected.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://source-must-not-leak.invalid/test.png"/></svg>',
    ),
  });
  await expect(page.locator(".effects-studio [role=alert]")).toBeVisible();
  expect(await hash(page)).toBe(before);
  expect(await hash(page, true)).toBe(original);
  const malformed = Buffer.alloc(40);
  Buffer.from("89504e470d0a1a0a0000000d49484452", "hex").copy(malformed);
  malformed.writeUInt32BE(67, 16);
  malformed.writeUInt32BE(53, 20);
  await input.setInputFiles({
    name: "decode-fails.png",
    mimeType: "image/png",
    buffer: malformed,
  });
  await expect(page.locator(".effects-studio [role=alert]")).toBeVisible();
  expect(await hash(page)).toBe(before);
  expect(await hash(page, true)).toBe(original);
  const unexpected = requests.filter(
    (r) =>
      r.method !== "GET" ||
      !(
        r.url.startsWith("http://127.0.0.1:3107/") ||
        r.url.startsWith("blob:http://127.0.0.1:3107/") ||
        r.url ===
          "https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700&display=swap" ||
        /^https:\/\/cdn\.fontshare\.com\/wf\/[A-Z0-9/]+\.woff2$/.test(r.url)
      ) ||
      /owned-|source-must-not-leak/.test(r.url),
  );
  expect(unexpected).toEqual([]);
});

test("blocked WASM is actionable and retries actual renderer; blocked UI fonts keep route usable", async ({
  page,
}) => {
  await page.route("**/*.wasm", (r) => r.abort());
  await page.route("**/*.woff2", (r) => r.abort());
  await page.goto("/app");
  await expect(page.locator(".effects-studio [role=alert]")).toBeVisible({
    timeout: 30000,
  });
  await expect(
    page.getByRole("button", { name: "Retry sample image", exact: true }),
  ).toBeVisible();
  await page.unroute("**/*.wasm");
  await page
    .getByRole("button", { name: "Retry sample image", exact: true })
    .click();
  await waitFrame(page);
  expect(await hash(page)).not.toBe(0);
});

test("source replacement cancels a real native encode and discards its late callback", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const native = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
      native.call(
        this,
        (blob) => {
          document.body.dataset.encoderPending = "true";
          setTimeout(() => {
            callback(blob);
            document.body.dataset.encoderPending = "false";
          }, 500);
        },
        type,
        quality,
      );
    };
  });
  const downloads: string[] = [];
  page.on("download", (d) => downloads.push(d.suggestedFilename()));
  await page.goto("/app");
  await waitFrame(page);
  const next = await file(page, 67, 53);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("button", { name: "Export PNG", exact: true }).click();
  await expect(page.locator("body")).toHaveAttribute(
    "data-encoder-pending",
    "true",
  );
  await page
    .getByRole("button", { name: "Cancel export", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Export PNG", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await page.getByLabel("Upload image file").setInputFiles(next);
  await waitFrame(page, 67, 53);
  await expect(page.locator("body")).toHaveAttribute(
    "data-encoder-pending",
    "false",
  );
  expect(downloads).toEqual([]);
  const nextSource = await file(page, 71, 59, 9);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("button", { name: "Export PNG", exact: true }).click();
  await expect(page.locator("body")).toHaveAttribute(
    "data-encoder-pending",
    "true",
  );
  // This is the real file-input handler while encoding is pending: source change
  // itself must cancel; no Cancel/Escape action precedes this replacement.
  await page.getByLabel("Upload image file").setInputFiles(nextSource);
  await waitFrame(page, 71, 59);
  await expect(page.locator("body")).toHaveAttribute(
    "data-encoder-pending",
    "false",
  );
  expect(downloads).toEqual([]);
});

test("SPA unmount/revisit terminates native workers, clears owned canvases and revokes download URLs", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const workers: Array<{
        url: string;
        module: boolean;
        terminated: boolean;
      }> = [],
      urls = new Set<string>();
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      record: { url: string; module: boolean; terminated: boolean };
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.record = {
          url: String(url),
          module: options?.type === "module",
          terminated: false,
        };
        if (workers.length < 32) workers.push(this.record);
      }
      terminate() {
        this.record.terminated = true;
        super.terminate();
      }
    };
    const create = URL.createObjectURL.bind(URL),
      revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      const url = create(blob);
      urls.add(url);
      return url;
    };
    URL.revokeObjectURL = (url) => {
      urls.delete(url);
      revoke(url);
    };
    Object.defineProperty(window, "__studioProbe", {
      value: { token: crypto.randomUUID(), workers, urls, canvases: [] },
    });
  });
  await page.goto("/app");
  await waitFrame(page);
  await page
    .getByLabel("Upload image file")
    .setInputFiles(await file(page, 67, 53));
  await waitFrame(page, 67, 53);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PNG", exact: true }).click();
  await downloaded;
  await page.keyboard.press("Escape");
  const initial = await page.evaluate(() => {
    const p = (
      window as unknown as {
        __studioProbe: {
          token: string;
          workers: Array<{ module: boolean; terminated: boolean }>;
          urls: Set<string>;
          canvases: HTMLCanvasElement[];
        };
      }
    ).__studioProbe;
    p.canvases = Array.from(
      document.querySelectorAll(".effects-studio canvas"),
    );
    return {
      token: p.token,
      workers: p.workers.length,
      module: p.workers.every((w) => w.module),
      urls: p.urls.size,
      canvases: p.canvases.length,
    };
  });
  expect(initial.workers).toBeGreaterThan(0);
  console.log("Native production Worker observation:", initial);
  expect(initial.urls).toBeGreaterThan(0);
  expect(initial.canvases).toBeGreaterThanOrEqual(2);
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page
    .getByRole("link", { name: "Open legacy Studio", exact: true })
    .click();
  await expect(page).toHaveURL(/\/studio$/);
  await expect
    .poll(() =>
      page.evaluate(
        ({ count, token, canvasCount }) => {
          const p = (
            window as unknown as {
              __studioProbe: {
                token: string;
                workers: Array<{ terminated: boolean }>;
                urls: Set<string>;
                canvases: HTMLCanvasElement[];
              };
            }
          ).__studioProbe;
          return {
            sameDocument: p.token === token,
            workerRecords: p.workers.length >= count,
            canvasRecords: p.canvases.length === canvasCount,
            terminated: p.workers.slice(0, count).every((w) => w.terminated),
            cleared: p.canvases.every((c) => c.width === 0 && c.height === 0),
            urls: p.urls.size,
          };
        },
        {
          count: initial.workers,
          token: initial.token,
          canvasCount: initial.canvases,
        },
      ),
    )
    .toEqual({
      sameDocument: true,
      workerRecords: true,
      canvasRecords: true,
      terminated: true,
      cleared: true,
      urls: 0,
    });
  await page.goBack();
  await waitFrame(page);
  expect(await hash(page)).not.toBe(0);
});

for (const capability of [
  {
    name: "coarse-phone",
    width: 390,
    height: 844,
    hasTouch: true,
    isMobile: true,
  },
  {
    name: "coarse-tablet",
    width: 768,
    height: 1024,
    hasTouch: true,
    isMobile: true,
  },
  {
    name: "fine-narrow",
    width: 390,
    height: 844,
    hasTouch: false,
    isMobile: false,
  },
]) {
  test(`explicit ${capability.name} real render/edit/export and focus/scroll`, async ({
    browser,
    browserName,
    baseURL,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop",
      "Explicit capabilities run once on Chromium; project mobile coverage is separate.",
    );
    const context = await browser.newContext({
      baseURL,
      viewport: { width: capability.width, height: capability.height },
      hasTouch: capability.hasTouch,
      isMobile: capability.isMobile,
      reducedMotion: "reduce",
    });
    try {
      const page = await context.newPage();
      await page.goto("/app");
      await waitFrame(page);
      expect(
        await page.evaluate(() => matchMedia("(pointer: coarse)").matches),
      ).toBe(capability.hasTouch);
      await page
        .getByLabel("Upload image file")
        .setInputFiles(await file(page, 67, 53));
      await waitFrame(page, 67, 53);
      const before = await hash(page);
      await page.getByRole("button", { name: "Controls", exact: true }).click();
      const dialog = page.getByRole("dialog", {
        name: "Controls sheet",
        exact: true,
      });
      await expect(dialog).toBeVisible();
      const ramp = page.getByRole("textbox", {
        name: "Character Set",
        exact: true,
      });
      await ramp.fill("@#:. ");
      await ramp.press("Enter");
      await expect.poll(() => hash(page)).not.toBe(before);
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("button", { name: "Controls", exact: true }),
      ).toBeFocused();
      expect(
        await page.locator("body").evaluate((b) => b.style.overflow),
      ).not.toBe("hidden");
      await page.getByRole("button", { name: "Export", exact: true }).click();
      const pending = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Export PNG", exact: true })
        .click();
      const d = await pending;
      expect(d.suggestedFilename()).toMatch(/\.png$/);
      await page.keyboard.press("Escape");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `docs/verification/studio-shell-evidence/task6-${browserName}-${capability.name}-${capability.width}x${capability.height}.png`,
      });
    } finally {
      await context.close();
    }
  });
}

test("captured native export survives same-source undo and admits only one encoder", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const native = HTMLCanvasElement.prototype.toBlob;
    let calls = 0;
    HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
      calls++;
      document.body.dataset.encodeCalls = String(calls);
      native.call(
        this,
        (blob) => {
          document.body.dataset.encoderPending = "true";
          setTimeout(() => {
            callback(blob);
            document.body.dataset.encoderPending = "false";
          }, 1000);
        },
        type,
        quality,
      );
    };
  });
  await page.goto("/app");
  await waitFrame(page);
  await page
    .getByLabel("Upload image file")
    .setInputFiles(await file(page, 67, 53));
  await waitFrame(page, 67, 53);
  const before = await hash(page);
  await showControls(page);
  const ramp = page.getByRole("textbox", {
    name: "Character Set",
    exact: true,
  });
  await ramp.fill("@#:. ");
  await ramp.press("Enter");
  await expect.poll(() => hash(page)).not.toBe(before);
  const captured = await hash(page);
  if (
    await page
      .getByRole("dialog", { name: "Controls sheet", exact: true })
      .isVisible()
  )
    await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PNG", exact: true }).click();
  await expect(page.locator("body")).toHaveAttribute(
    "data-encoder-pending",
    "true",
  );
  await expect(
    page.getByRole("button", { name: "Export PNG", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => hash(page)).toBe(before);
  const stream = await (await pending).createReadStream(),
    chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const exported = await page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(
      new Blob([bytes], { type: "image/png" }),
    );
    const c = document.createElement("canvas");
    c.width = bitmap.width;
    c.height = bitmap.height;
    c.getContext("2d")!.drawImage(bitmap, 0, 0);
    bitmap.close();
    let h = 2166136261;
    for (const b of c.getContext("2d")!.getImageData(0, 0, c.width, c.height)
      .data)
      h = Math.imul(h ^ b, 16777619);
    return h >>> 0;
  }, Buffer.concat(chunks).toString("base64"));
  expect(exported).toBe(captured);
  await expect(page.locator("body")).toHaveAttribute("data-encode-calls", "1");
  expect(await hash(page)).toBe(before);
});

test("font calibration failure keeps the retained source and retries the real measured renderer", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const load = document.fonts.load.bind(document.fonts);
    Object.defineProperty(window, "__allowMeasuredFont", {
      value: false,
      writable: true,
    });
    Object.defineProperty(Object.getPrototypeOf(document.fonts), "load", {
      configurable: true,
      writable: true,
      value: (font: string, text?: string) =>
        (window as unknown as { __allowMeasuredFont: boolean })
          .__allowMeasuredFont
          ? load(font, text)
          : Promise.reject(new Error("Injected blocked calibration font")),
    });
  });
  await page.goto("/app");
  await expect(page.locator(".effects-studio [role=alert]")).toContainText(
    "blocked calibration font",
  );
  expect(
    await page
      .getByLabel("Original source comparison")
      .evaluate((c: HTMLCanvasElement) => [c.width, c.height]),
  ).toEqual([1000, 1000]);
  const original = await hash(page, true);
  await page.evaluate(() => {
    (
      window as unknown as { __allowMeasuredFont: boolean }
    ).__allowMeasuredFont = true;
  });
  await page
    .getByRole("button", { name: "Retry renderer", exact: true })
    .click();
  await waitFrame(page);
  expect(await hash(page, true)).toBe(original);
  expect(await hash(page)).not.toBe(original);
});

test("SPA unmount keeps native encoder pixels owned until its late callback settles", async ({
  page,
}) => {
  const downloads: string[] = [],
    errors: string[] = [];
  page.on("download", (d) => downloads.push(d.suggestedFilename()));
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const state = {
      token: crypto.randomUUID(),
      canvas: null as HTMLCanvasElement | null,
      pending: false,
    };
    Object.defineProperty(window, "__nativeEncoderProbe", { value: state });
    const native = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
      state.canvas = this;
      native.call(
        this,
        (blob) => {
          state.pending = true;
          setTimeout(() => {
            callback(blob);
            state.pending = false;
          }, 2000);
        },
        type,
        quality,
      );
    };
  });
  await page.goto("/app");
  await waitFrame(page);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("button", { name: "Export PNG", exact: true }).click();
  const probe = () =>
    page.evaluate(() => {
      const s = (
        window as unknown as {
          __nativeEncoderProbe: {
            token: string;
            canvas: HTMLCanvasElement | null;
            pending: boolean;
          };
        }
      ).__nativeEncoderProbe;
      return {
        token: s.token,
        pending: s.pending,
        width: s.canvas?.width,
        height: s.canvas?.height,
      };
    });
  await expect.poll(async () => (await probe()).pending).toBe(true);
  const initial = await probe();
  expect(initial.width).toBe(1000);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page
    .getByRole("link", { name: "Open legacy Studio", exact: true })
    .click();
  await expect(page).toHaveURL(/\/studio$/);
  expect(await probe()).toEqual(initial);
  await expect
    .poll(probe)
    .toEqual({ token: initial.token, pending: false, width: 0, height: 0 });
  expect(downloads).toEqual([]);
  expect(errors).toEqual([]);
  await page.goBack();
  await waitFrame(page);
  expect((await probe()).token).toBe(initial.token);
});
