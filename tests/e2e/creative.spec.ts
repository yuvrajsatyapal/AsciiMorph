import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test("all creative routes are reachable, render actual art and fit mobile", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/create");
  await expect(
    page.getByRole("heading", { name: "A character for every idea." }),
  ).toBeVisible();
  for (const route of [
    "/generate",
    "/three",
    "/type",
    "/gallery",
    "/audio",
    "/animate",
  ]) {
    await page.goto(route);
    await expect(page.locator("h1")).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
    if (["/generate", "/three"].includes(route)) {
      await expect
        .poll(() =>
          page
            .locator("canvas")
            .first()
            .evaluate((c: HTMLCanvasElement) => c.width),
        )
        .toBeGreaterThan(1);
    }
    await page.screenshot({
      path: `test-results/${route.slice(1)}-${info.project.name}.png`,
      fullPage: true,
    });
  }
  expect(errors).toEqual([]);
});
test("generator exports real animated GIF and hands editable frames to animation", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.goto("/generate");
  const first = await page.locator("details pre").textContent();
  await page.getByLabel("Generator", { exact: true }).selectOption("fractal");
  expect(await page.locator("details pre").textContent()).not.toBe(first);
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export animation", exact: true })
    .click();
  const bytes = await readFile((await (await pending).path())!);
  expect(bytes.subarray(0, 6).toString()).toBe("GIF89a");
  expect(bytes.at(-1)).toBe(0x3b);
  const decoded = await page.evaluate(async (base64) => {
    const data = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const image = new Image();
    image.src = URL.createObjectURL(new Blob([data], { type: "image/gif" }));
    await image.decode();
    const size = [image.width, image.height];
    URL.revokeObjectURL(image.src);
    return size;
  }, bytes.toString("base64"));
  expect(decoded[0]).toBeGreaterThan(1);
  await page
    .getByRole("button", { name: "Edit animation", exact: true })
    .click();
  await expect(page).toHaveURL(/animate/);
  await expect(
    page.getByRole("list", { name: "Animation frames" }).getByRole("listitem"),
  ).toHaveCount(30);
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(
    page.getByRole("list", { name: "Animation frames" }).getByRole("listitem"),
  ).toHaveCount(31);
  await page.getByRole("button", { name: "Play loop", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
});
test("OBJ upload changes mesh, snapshot and layers remain editable", async ({
  page,
}) => {
  await page.goto("/three");
  await page.getByLabel("Choose OBJ or GLB model").setInputFiles({
    name: "triangle.obj",
    mimeType: "text/plain",
    buffer: Buffer.from("v -1 -1 0\nv 1 -1 0\nv 0 1 0\nf 1 2 3"),
  });
  await expect(page.getByText(/triangle.obj · 3 vertices/)).toBeVisible();
  await page
    .getByRole("button", { name: "Edit in Studio", exact: true })
    .click();
  await expect(page.getByTestId("ascii-canvas")).toBeVisible();
  expect(await page.getByTestId("document-text").textContent()).toMatch(
    /[.:-=+*#%@]/,
  );
});
test("Rust engine is used and smart edges produce actual conversion", async ({
  page,
}) => {
  await page.goto("/convert");
  await page
    .getByLabel("Browse image")
    .setInputFiles("tests/fixtures/gradient.png");
  await expect(page.getByTestId("conversion-status")).toContainText("Rust");
  await page.getByLabel("Smart directional edges").check();
  await expect(page.getByTestId("conversion-status")).toContainText("Ready");
});
test("local audio drives real FFT motion and exports a captured still", async ({
  page,
}) => {
  await page.goto("/audio");
  const samples = 16000,
    header = Buffer.alloc(44),
    pcm = Buffer.alloc(samples * 2);
  header.write("RIFF");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(16000, 24);
  header.writeUInt32LE(32000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  for (let i = 0; i < samples; i++)
    pcm.writeInt16LE(
      Math.round(Math.sin((i * 440 * Math.PI * 2) / 16000) * 20000),
      i * 2,
    );
  await page.getByLabel("Local audio").setInputFiles({
    name: "tone.wav",
    mimeType: "audio/wav",
    buffer: Buffer.concat([header, pcm]),
  });
  await expect(page.getByRole("status")).toHaveText("tone.wav");
  await page
    .getByRole("button", { name: "Play audio and motion", exact: true })
    .click();
  await expect
    .poll(() => page.locator("details pre").first().textContent())
    .toMatch(/[=|]/);
  await page
    .getByRole("button", { name: "Capture still", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Captured still" }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export artwork", exact: true })
    .click();
  expect(
    (await readFile((await (await download).path())!)).length,
  ).toBeGreaterThan(100);
  await page
    .getByRole("button", { name: "Stop and release source", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("No audio source");
});
test("typography and gallery search, favorites, exports and saved creations", async ({
  page,
}) => {
  await page.goto("/type");
  await expect(page.getByLabel("FIGlet typography preview")).toBeVisible();
  await page.getByLabel("Your text", { exact: true }).fill("A\nASCII");
  await page.getByLabel("Alignment", { exact: true }).selectOption("right");
  await page.getByLabel("Letter spacing", { exact: true }).fill("2");
  await page.getByLabel("Export format", { exact: true }).selectOption("json");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const doc = JSON.parse(
    (await readFile((await (await pending).path())!)).toString(),
  );
  expect(
    doc.layers[0].cells.some((c: { char: string }) => c.char === "#"),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Open in Studio", exact: true })
    .click();
  await expect(page.getByTestId("ascii-canvas")).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.goto("/gallery");
  await page.getByLabel("Gallery category").selectOption("My creations");
  await expect(
    page.getByRole("button", { name: /Preview .*A/ }).first(),
  ).toBeVisible();
  await page.getByLabel("Gallery category").selectOption("All");
  await page.getByLabel("Search gallery").fill("orbital");
  await page
    .getByRole("button", { name: "Favorite Orbital study", exact: true })
    .click();
  await page.reload();
  await page.getByRole("button", { name: /★ Favorites/ }).click();
  await expect(page.getByRole("button", { name: /^Preview / })).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Unfavorite Orbital study" }),
  ).toHaveAttribute("aria-pressed", "true");
});
test("GIF media import retains timing and video exports decode in the browser", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.goto("/animate");
  const bytes = Buffer.from([
    71, 73, 70, 56, 57, 97, 2, 0, 1, 0, 0x81, 0, 0, 255, 0, 0, 0, 0, 255, 0,
    255, 0, 0, 0, 0, 0x21, 0xf9, 4, 8, 10, 0, 0, 0, 0x2c, 0, 0, 0, 0, 1, 0, 1,
    0, 0, 2, 2, 0x4c, 0x01, 0, 0x21, 0xf9, 4, 1, 25, 0, 0, 0, 0x2c, 1, 0, 0, 0,
    1, 0, 1, 0, 0, 2, 2, 0x54, 0x01, 0, 0x3b,
  ]);
  await page.getByLabel("Choose video or GIF", { exact: true }).setInputFiles({
    name: "two-frames.gif",
    mimeType: "image/gif",
    buffer: bytes,
  });
  await expect(
    page.getByRole("list", { name: "Animation frames" }).getByRole("listitem"),
  ).toHaveCount(2);
  const timeline = page.getByRole("list", { name: "Animation frames" });
  await expect(timeline).toContainText("100 ms");
  await expect(timeline).toContainText("250 ms");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export WEBM", exact: true }).click();
  const video = await readFile((await (await pending).path())!);
  expect(video.subarray(0, 4).toString("hex")).toBe("1a45dfa3");
  const geometry = await page.evaluate(async (base64) => {
    const video = document.createElement("video"),
      bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)),
      url = URL.createObjectURL(new Blob([bytes], { type: "video/webm" }));
    try {
      return await new Promise<number[]>((resolve, reject) => {
        video.onloadeddata = () =>
          resolve([video.videoWidth, video.videoHeight]);
        video.onerror = () => reject(new Error("Recorded WebM cannot decode"));
        video.src = url;
      });
    } finally {
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
    }
  }, video.toString("base64"));
  expect(geometry[0]).toBeGreaterThan(1);
  await page.getByLabel("Choose video or GIF", { exact: true }).setInputFiles({
    name: "recorded.webm",
    mimeType: "video/webm",
    buffer: video,
  });
  await expect(page.locator(".media-import progress")).toHaveCount(0, {
    timeout: 20000,
  });
  await expect(page.locator(".media-import [role=alert]")).toHaveCount(0);
  await expect(
    page.getByRole("list", { name: "Animation frames" }).getByRole("listitem"),
  ).toHaveCount(3);
});
test("audio recording includes a decodable source soundtrack", async ({
  page,
}) => {
  await page.goto("/audio");
  const samples = 32000,
    header = Buffer.alloc(44),
    pcm = Buffer.alloc(samples * 2);
  header.write("RIFF");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(16000, 24);
  header.writeUInt32LE(32000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  for (let i = 0; i < samples; i++)
    pcm.writeInt16LE(
      Math.round(Math.sin((i * 440 * Math.PI * 2) / 16000) * 15000),
      i * 2,
    );
  await page
    .getByLabel("Local audio")
    .setInputFiles({
      name: "soundtrack.wav",
      mimeType: "audio/wav",
      buffer: Buffer.concat([header, pcm]),
    });
  await expect(page.getByRole("status")).toHaveText("soundtrack.wav");
  await page.getByLabel("Seconds", { exact: true }).fill("1");
  await page
    .getByRole("button", { name: "Play audio and motion", exact: true })
    .click();
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Record live response", exact: true })
    .click();
  const bytes = await readFile((await (await pending).path())!);
  const audio = await page.evaluate(async (base64) => {
    const context = new AudioContext();
    try {
      const data = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)),
        audio = await context.decodeAudioData(data.buffer);
      return {
        channels: audio.numberOfChannels,
        duration: audio.duration,
        peak: Math.max(
          ...audio.getChannelData(0).subarray(0, 16000).map(Math.abs),
        ),
      };
    } finally {
      await context.close();
    }
  }, bytes.toString("base64"));
  expect(audio.channels).toBeGreaterThan(0);
  expect(audio.duration).toBeGreaterThan(0.5);
  expect(audio.peak).toBeGreaterThan(0.01);
});
