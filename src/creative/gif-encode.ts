export interface GifOptions {
  quality?: number;
  loop?: boolean;
  maxBytes?: number;
}
type RGB = [number, number, number];
function paletteFor(rgba: Uint8ClampedArray, quality: number) {
  const exact = new Map<number, number>();
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3] / 255,
      key =
        (Math.round(rgba[i] * a) << 16) |
        (Math.round(rgba[i + 1] * a) << 8) |
        Math.round(rgba[i + 2] * a);
    exact.set(key, (exact.get(key) || 0) + 1);
    if (exact.size > 32768) break;
  }
  const limit = quality >= 80 ? 256 : quality >= 40 ? 128 : 64;
  if (exact.size <= limit)
    return {
      exact: true,
      colors: [...exact.keys()].map(
        (k) => [k >>> 16, (k >>> 8) & 255, k & 255] as RGB,
      ),
    };
  // Bounded histogram followed by weighted median-cut. The exact path preserves artwork colors.
  const histogram = new Map<number, { rgb: RGB; count: number }>();
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3] / 255,
      r = Math.round(rgba[i] * a),
      g = Math.round(rgba[i + 1] * a),
      b = Math.round(rgba[i + 2] * a),
      key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3),
      entry = histogram.get(key);
    if (entry) {
      entry.rgb[0] += r;
      entry.rgb[1] += g;
      entry.rgb[2] += b;
      entry.count++;
    } else histogram.set(key, { rgb: [r, g, b], count: 1 });
  }
  type Color = { rgb: RGB; count: number };
  const colors = [...histogram.values()].map((e) => ({
    rgb: e.rgb.map((v) => Math.round(v / e.count)) as RGB,
    count: e.count,
  }));
  const boxes: Color[][] = [colors];
  while (boxes.length < limit) {
    let chosen = -1,
      best = -1,
      channel = 0;
    boxes.forEach((box, i) => {
      if (box.length < 2) return;
      for (let c = 0; c < 3; c++) {
        let min = 255,
          max = 0,
          weight = 0;
        for (const e of box) {
          min = Math.min(min, e.rgb[c]);
          max = Math.max(max, e.rgb[c]);
          weight += e.count;
        }
        const score = (max - min) * Math.sqrt(weight);
        if (score > best) {
          chosen = i;
          best = score;
          channel = c;
        }
      }
    });
    if (chosen < 0) break;
    const box = boxes[chosen].sort((a, b) => a.rgb[channel] - b.rgb[channel]),
      total = box.reduce((s, e) => s + e.count, 0);
    let sum = 0,
      mid = 1;
    for (; mid < box.length; mid++) {
      sum += box[mid - 1].count;
      if (sum >= total / 2) break;
    }
    mid = Math.min(mid, box.length - 1);
    boxes.splice(chosen, 1, box.slice(0, mid), box.slice(mid));
  }
  return {
    exact: false,
    colors: boxes.map((box) => {
      const total = box.reduce((s, e) => s + e.count, 0);
      return [0, 1, 2].map((c) =>
        Math.round(box.reduce((s, e) => s + e.rgb[c] * e.count, 0) / total),
      ) as RGB;
    }),
  };
}
function lzw(indices: Uint8Array, minimum: number) {
  const clear = 1 << minimum,
    end = clear + 1,
    bytes: number[] = [];
  let width = minimum + 1,
    next = end + 1,
    bits = 0,
    count = 0,
    dict = new Map<number, number>();
  const emit = (code: number) => {
    bits |= code << count;
    count += width;
    while (count >= 8) {
      bytes.push(bits & 255);
      bits >>>= 8;
      count -= 8;
    }
  };
  emit(clear);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const symbol = indices[i],
      key = prefix * 256 + symbol,
      known = dict.get(key);
    if (known !== undefined) {
      prefix = known;
      continue;
    }
    emit(prefix);
    // Encoder is one dictionary entry ahead of the decoder until the next emitted code.
    if (next === 1 << width && width < 12) width++;
    if (next < 4096) dict.set(key, next++);
    else {
      emit(clear);
      dict = new Map();
      next = end + 1;
      width = minimum + 1;
    }
    prefix = symbol;
  }
  emit(prefix);
  if (next === 1 << width && width < 12) width++;
  emit(end);
  if (count) bytes.push(bits & 255);
  return bytes;
}
export function encodeGif(
  frames: { rgba: Uint8ClampedArray; delay: number }[],
  width: number,
  height: number,
  options: GifOptions = {},
) {
  if (
    !frames.length ||
    frames.length > 120 ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 2048 ||
    height > 2048 ||
    width * height * frames.length > 24_000_000
  )
    throw new Error("GIF exceeds resource limits");
  const quality = options.quality ?? 100,
    maxBytes = options.maxBytes ?? 80_000_000;
  if (
    !Number.isFinite(quality) ||
    quality < 1 ||
    quality > 100 ||
    !Number.isFinite(maxBytes) ||
    maxBytes <= 0
  )
    throw new Error("Invalid GIF quality or file-size budget.");
  const out: number[] = [];
  const byte = (...values: number[]) => {
      out.push(...values.map((v) => v & 255));
      if (out.length > maxBytes)
        throw new Error(
          "GIF exceeds the file-size budget. Reduce resolution, quality, or frame count.",
        );
    },
    word = (v: number) => byte(v, v >>> 8),
    str = (s: string) => byte(...Array.from(s, (c) => c.charCodeAt(0)));
  str("GIF89a");
  word(width);
  word(height);
  byte(0x70, 0, 0);
  if (options.loop !== false) {
    byte(0x21, 0xff, 11);
    str("NETSCAPE2.0");
    byte(3, 1, 0, 0, 0);
  }
  let totalDelay = 0,
    encodedDelay = 0;
  for (const frame of frames) {
    if (
      frame.rgba.length !== width * height * 4 ||
      !Number.isFinite(frame.delay) ||
      frame.delay < 20 ||
      frame.delay > 10000
    )
      throw new Error("Invalid GIF frame");
    const result = paletteFor(frame.rgba, quality),
      palette = result.colors,
      size = Math.max(2, 2 ** Math.ceil(Math.log2(palette.length))),
      minimum = Math.max(2, Math.log2(size));
    byte(0x21, 0xf9, 4, 4);
    totalDelay += frame.delay;
    const delay = Math.max(2, Math.round(totalDelay / 10) - encodedDelay);
    encodedDelay += delay;
    word(delay);
    byte(0, 0, 0x2c);
    word(0);
    word(0);
    word(width);
    word(height);
    byte(0x80 | (Math.log2(size) - 1));
    for (let i = 0; i < size; i++) byte(...(palette[i] || [0, 0, 0]));
    const indices = new Uint8Array(width * height),
      cache = new Map<number, number>();
    for (let i = 0; i < indices.length; i++) {
      const offset = i * 4,
        a = frame.rgba[offset + 3] / 255,
        r = Math.round(frame.rgba[offset] * a),
        g = Math.round(frame.rgba[offset + 1] * a),
        b = Math.round(frame.rgba[offset + 2] * a),
        key = result.exact
          ? (r << 16) | (g << 8) | b
          : ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      let index = cache.get(key);
      if (index === undefined) {
        let distance = Infinity;
        index = 0;
        palette.forEach((p, j) => {
          const d = 2 * (r - p[0]) ** 2 + 4 * (g - p[1]) ** 2 + (b - p[2]) ** 2;
          if (d < distance) {
            distance = d;
            index = j;
          }
        });
        if (cache.size < 65536) cache.set(key, index);
      }
      indices[i] = index;
    }
    byte(minimum);
    const data = lzw(indices, minimum);
    for (let p = 0; p < data.length; p += 255) {
      const block = data.slice(p, p + 255);
      byte(block.length, ...block);
    }
    byte(0);
  }
  byte(0x3b);
  return Uint8Array.from(out);
}
