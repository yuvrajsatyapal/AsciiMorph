import { describe, it, expect, vi } from "vitest";
import { createDocument } from "./document";
import { displayList, documentText, paint } from "./render";
import { exportDocument } from "./exports";
const readBlob = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
describe("render contract", () => {
  it("keeps pixel geometry and separate cell and layer alpha", () => {
    const d = createDocument(2, 1);
    d.layers[0].opacity = 0.4;
    d.layers[0].cells[1] = {
      char: "😀",
      fg: "#ff0000",
      bg: "#ffffff",
      alpha: 0.5,
    };
    const c = displayList(d)[1];
    expect(c).toMatchObject({
      x: 9,
      y: 0,
      width: 9,
      height: 18,
      char: "😀",
      alpha: 0.5,
      layerOpacity: 0.4,
    });
  });
  it("flattens visible text while retaining trailing whitespace", () => {
    const d = createDocument(3, 2);
    d.layers[0].cells[0].char = "A";
    d.layers.push({
      ...d.layers[0],
      id: "top",
      cells: d.layers[0].cells.map((c) => ({ ...c, char: " " })),
    });
    d.layers[1].cells[1].char = "B";
    expect(documentText(d)).toBe("AB \n   ");
    d.layers[1].visible = false;
    expect(documentText(d)).toBe("A  \n   ");
  });
  it("escapes self contained SVG and HTML, embeds font and license", async () => {
    const d = createDocument(1, 1);
    d.layers[0].cells[0].char = "<";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith(".woff2")
          ? new Response(new Uint8Array([1, 2, 3]))
          : new Response("SIL & license"),
      ),
    );
    const svg = await readBlob(await exportDocument(d, "svg"));
    const html = await readBlob(await exportDocument(d, "html"));
    expect(svg).toContain("&lt;");
    expect(svg).toContain("data:font/woff2;base64,AQID");
    expect(svg).toContain("SIL &amp; license");
    expect(html).toContain("&lt;");
    expect(html).not.toContain("<script");
    vi.unstubAllGlobals();
  });
  it("shares the canvas renderer with raster exports and clips glyphs", async () => {
    const contexts: Record<string, ReturnType<typeof vi.fn>>[] = [];
    const canvases: HTMLCanvasElement[] = [];
    const make = () => {
      const context = Object.fromEntries(
        [
          "setTransform",
          "clearRect",
          "save",
          "restore",
          "beginPath",
          "rect",
          "clip",
          "fillRect",
          "fillText",
          "drawImage",
        ].map((k) => [k, vi.fn()]),
      );
      contexts.push(context);
      const canvas = {
        width: 0,
        height: 0,
        style: {},
        getContext: () => context,
        toBlob: (cb: (b: Blob) => void, type: string) =>
          cb(new Blob(["raster"], { type })),
      } as unknown as HTMLCanvasElement;
      canvases.push(canvas);
      return canvas;
    };
    vi.stubGlobal("document", {
      createElement: () => make(),
      fonts: { load: vi.fn(async () => [{}]), ready: Promise.resolve() },
    });
    const d = createDocument(1, 1);
    d.layers[0].cells[0] = {
      char: "W",
      fg: "#ff0000",
      bg: "#ffffff",
      alpha: 0.5,
    };
    paint(make(), d);
    expect(contexts.some((c) => c.clip.mock.calls.length > 0)).toBe(true);
    expect(contexts.some((c) => c.fillText.mock.calls.length > 0)).toBe(true);
    expect((await exportDocument(d, "png")).type).toBe("image/png");
    expect(canvases[0].width).toBe(9);
    vi.unstubAllGlobals();
  });
  it("applies cell alpha once and layer alpha once, then repaints only changed cells", () => {
    const contexts: ReturnType<typeof context>[] = [];
    function context() {
      return {
        globalAlpha: 1,
        setTransform: vi.fn(),
        clearRect: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        rect: vi.fn(),
        clip: vi.fn(),
        fillRect: vi.fn(),
        fillText: vi.fn(),
        drawImage: vi.fn(function (this: { globalAlpha: number }) {
          return this.globalAlpha;
        }),
      };
    }
    const make = () => {
      const ctx = context();
      contexts.push(ctx);
      return {
        width: 0,
        height: 0,
        style: {},
        getContext: () => ctx,
      } as unknown as HTMLCanvasElement;
    };
    vi.stubGlobal("document", { createElement: () => make() });
    const d = createDocument(3, 2);
    d.layers[0].opacity = 0.4;
    d.layers[0].cells[0] = {
      char: "X",
      fg: "#ffffff",
      bg: "#ff0000",
      alpha: 0.5,
    };
    const canvas = make();
    paint(canvas, d, { pixelRatio: 1 });
    expect(contexts[0].drawImage.mock.results[0].value).toBe(0.4);
    expect(contexts[2].drawImage.mock.results[0].value).toBe(0.5);
    const changed = {
      ...d,
      layers: [
        {
          ...d.layers[0],
          cells: d.layers[0].cells.map((c, i) =>
            i === 4 ? { ...c, char: "Y" } : c,
          ),
        },
      ],
    };
    paint(canvas, changed, { previous: d, pixelRatio: 1 });
    expect(contexts[0].clearRect).toHaveBeenLastCalledWith(9, 18, 9, 18);
    paint(canvas, changed, {
      previous: changed,
      monochrome: true,
      pixelRatio: 1,
    });
    expect(contexts[0].clearRect).toHaveBeenLastCalledWith(0, 0, 27, 36);
    vi.unstubAllGlobals();
  });
  it("preserves CSS sizing supplied by the zoom container", () => {
    const context = Object.fromEntries(
      [
        "setTransform",
        "clearRect",
        "save",
        "restore",
        "beginPath",
        "rect",
        "clip",
        "fillRect",
        "fillText",
        "drawImage",
      ].map((key) => [key, vi.fn()]),
    );
    const make = () =>
      ({
        width: 0,
        height: 0,
        style: { width: "100%", height: "100%" },
        getContext: () => context,
      }) as unknown as HTMLCanvasElement;
    vi.stubGlobal("document", { createElement: make });
    const canvas = make();
    paint(canvas, createDocument(3, 2), { pixelRatio: 2 });
    expect(canvas.width).toBe(54);
    expect(canvas.height).toBe(72);
    expect(canvas.style.width).toBe("100%");
    expect(canvas.style.height).toBe("100%");
    vi.unstubAllGlobals();
  });
  it("rejects oversized backing stores before allocating or touching the current canvas", () => {
    const make = vi.fn();
    vi.stubGlobal("document", { createElement: make });
    const canvas = {
      width: 10,
      height: 10,
      getContext: vi.fn(),
    } as unknown as HTMLCanvasElement;
    const doc = createDocument(300, 200);
    doc.cellWidth = 64;
    doc.cellHeight = 128;
    expect(() => paint(canvas, doc, { pixelRatio: 3 })).toThrow(
      /too large.*reduce/i,
    );
    expect(canvas.width).toBe(10);
    expect(canvas.height).toBe(10);
    expect(canvas.getContext).not.toHaveBeenCalled();
    expect(make).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
  it("includes DPR and maximum side length in backing store limits", () => {
    const canvas = { getContext: vi.fn() } as unknown as HTMLCanvasElement;
    const d = createDocument(200, 100);
    d.cellWidth = 32;
    d.cellHeight = 32;
    expect(() => paint(canvas, d, { pixelRatio: 2 })).toThrow(
      /too large.*reduce/i,
    );
    const wide = createDocument(300, 1);
    wide.cellWidth = 64;
    expect(() => paint(canvas, wide, { pixelRatio: 1 })).toThrow(
      /too large.*reduce/i,
    );
    for (const pixelRatio of [0, -1, NaN, Infinity])
      expect(() => paint(canvas, d, { pixelRatio })).toThrow(/pixel ratio/i);
    expect(canvas.getContext).not.toHaveBeenCalled();
  });
  it("allocates only cell-sized scratch surfaces for a one-cell dirty update", () => {
    const canvases: HTMLCanvasElement[] = [];
    const context = Object.fromEntries(
      [
        "setTransform",
        "clearRect",
        "save",
        "restore",
        "beginPath",
        "rect",
        "clip",
        "fillRect",
        "fillText",
        "drawImage",
      ].map((key) => [key, vi.fn()]),
    );
    const make = () => {
      const c = {
        width: 0,
        height: 0,
        getContext: () => context,
      } as unknown as HTMLCanvasElement;
      canvases.push(c);
      return c;
    };
    vi.stubGlobal("document", { createElement: make });
    const d = createDocument(3, 2),
      canvas = make();
    paint(canvas, d, { pixelRatio: 2 });
    const changed = {
      ...d,
      layers: [
        {
          ...d.layers[0],
          cells: d.layers[0].cells.map((c, i) =>
            i === 4 ? { ...c, char: "Y" } : c,
          ),
        },
      ],
    };
    const before = canvases.length;
    paint(canvas, changed, { previous: d, pixelRatio: 2 });
    expect(canvases.slice(before).map((c) => [c.width, c.height])).toEqual([
      [18, 36],
      [18, 36],
    ]);
    expect(context.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, -18, -36);
    vi.unstubAllGlobals();
  });
});
it("bounds preview DPR for large editable conversions without changing document geometry", async () => {
  const { previewPixelRatio, backingSize } = await import("./render");
  expect(previewPixelRatio(720, 360, 3)).toBe(3);
  const ratio = previewPixelRatio(4800, 5600, 3);
  expect(ratio).toBeLessThan(1.1);
  expect(() => backingSize(4800, 5600, ratio)).not.toThrow();
  expect(previewPixelRatio(100, 100, 0)).toBe(1);
});
