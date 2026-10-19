// Local GIF87a/89a decoder. Bounds apply before allocating frame buffers.
export interface GifFrame {
  pixels: Uint8ClampedArray;
  duration: number;
}
const MAX_GIF_PIXELS = 24_000_000;
function decodeLzw(
  compressed: Uint8Array,
  minimum: number,
  pixels: number,
): Uint8Array {
  const clear = 1 << minimum,
    end = clear + 1;
  const prefix = new Uint16Array(4096),
    suffix = new Uint8Array(4096),
    stack = new Uint8Array(4096);
  for (let i = 0; i < clear; i++) suffix[i] = i;
  const output = new Uint8Array(pixels);
  let codeSize = minimum + 1,
    next = end + 1,
    bit = 0,
    previous = -1,
    first = 0,
    at = 0,
    terminated = false;
  while (bit + codeSize <= compressed.length * 8) {
    let code = 0;
    for (let b = 0; b < codeSize; b++)
      code |= ((compressed[(bit + b) >> 3] >> ((bit + b) & 7)) & 1) << b;
    bit += codeSize;
    if (code === clear) {
      codeSize = minimum + 1;
      next = end + 1;
      previous = -1;
      continue;
    }
    if (code === end) {
      terminated = true;
      break;
    }
    const current = code;
    let size = 0;
    if (code === next && previous >= 0) {
      stack[size++] = first;
      code = previous;
    } else if (code >= next) throw new Error("Invalid GIF LZW code.");
    while (code >= clear) {
      if (code < end + 1 || code >= next || size >= stack.length - 1)
        throw new Error("Invalid GIF LZW dictionary.");
      stack[size++] = suffix[code];
      code = prefix[code];
    }
    first = suffix[code];
    stack[size++] = first;
    if (at + size > pixels) throw new Error("GIF pixel budget exceeded.");
    while (size) output[at++] = stack[--size];
    if (previous >= 0 && next < 4096) {
      prefix[next] = previous;
      suffix[next] = first;
      next++;
      if (next === 1 << codeSize && codeSize < 12) codeSize++;
    }
    previous = current;
  }
  if (!terminated || at !== pixels) throw new Error("Incomplete GIF frame.");
  return output;
}
export function decodeGif(buffer: ArrayBuffer) {
  if (buffer.byteLength > 40 * 1024 * 1024)
    throw new Error("GIF file exceeds 40 MiB.");
  const data = new Uint8Array(buffer);
  let p = 0;
  const byte = () => {
    if (p >= data.length) throw new Error("Truncated GIF.");
    return data[p++];
  };
  const word = () => byte() | (byte() << 8);
  const read = (n: number) => {
    if (n < 0 || p + n > data.length) throw new Error("Truncated GIF.");
    const out = data.slice(p, p + n);
    p += n;
    return out;
  };
  const blocks = () => {
    const start = p;
    let total = 0,
      count = 0,
      size = byte();
    while (size) {
      total += size;
      if (total > 24_000_000 || ++count > 200000)
        throw new Error("GIF compressed data exceeds resource limits");
      if (p + size > data.length) throw new Error("Truncated GIF.");
      p += size;
      size = byte();
    }
    const out = new Uint8Array(total);
    let cursor = start,
      offset = 0;
    while (data[cursor]) {
      const n = data[cursor++];
      out.set(data.subarray(cursor, cursor + n), offset);
      cursor += n;
      offset += n;
    }
    return out;
  };
  const header = new TextDecoder().decode(read(6));
  if (!["GIF87a", "GIF89a"].includes(header)) throw new Error("Invalid GIF.");
  const width = word(),
    height = word();
  if (
    width < 1 ||
    height < 1 ||
    width > 2048 ||
    height > 2048 ||
    width * height > 2_000_000
  )
    throw new Error("GIF dimensions exceed limits.");
  const flags = byte(),
    background = byte();
  byte();
  const global = flags & 128 ? read(3 * (1 << ((flags & 7) + 1))) : null;
  if (global && background * 3 >= global.length)
    throw new Error("Invalid GIF background index.");
  let canvas = new Uint8ClampedArray(width * height * 4),
    delay = 100,
    transparent = -1,
    disposal = 0;
  let previous: Uint8ClampedArray | null = null,
    lastRect = [0, 0, 0, 0],
    lastDisposal = 0,
    lastTransparent = -1,
    duration = 0,
    trailer = false;
  const frames: GifFrame[] = [];
  const clearRect = (rect: number[], transparency: number) => {
    const [x, y, w, h] = rect;
    const bg =
      global && transparency < 0
        ? [
            global[background * 3],
            global[background * 3 + 1],
            global[background * 3 + 2],
            255,
          ]
        : [0, 0, 0, 0];
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++) canvas.set(bg, (yy * width + xx) * 4);
  };
  while (p < data.length) {
    const type = byte();
    if (type === 0x3b) {
      trailer = true;
      break;
    }
    if (type === 0x21) {
      const extension = byte();
      if (extension === 0xf9) {
        if (byte() !== 4) throw new Error("Invalid GIF control block.");
        const f = byte();
        disposal = (f >> 2) & 7;
        delay = Math.max(20, word() * 10);
        const index = byte();
        transparent = f & 1 ? index : -1;
        if (byte() !== 0) throw new Error("Invalid GIF control terminator.");
      } else blocks();
      continue;
    }
    if (type !== 0x2c) throw new Error("Invalid GIF block.");
    if (
      frames.length >= 120 ||
      (frames.length + 1) * width * height > MAX_GIF_PIXELS ||
      duration + delay > 120000
    )
      throw new Error(
        "GIF exceeds 120 frames, 24 megapixels total or 120 seconds.",
      );
    if (!frames.length) clearRect([0, 0, width, height], transparent);
    else if (lastDisposal === 2) clearRect(lastRect, lastTransparent);
    else if (lastDisposal === 3 && previous) canvas = previous.slice();
    const x = word(),
      y = word(),
      w = word(),
      h = word(),
      f = byte();
    if (!w || !h || x + w > width || y + h > height)
      throw new Error("GIF frame out of bounds.");
    const table = f & 128 ? read(3 * (1 << ((f & 7) + 1))) : global;
    if (!table) throw new Error("GIF color table missing.");
    if (transparent >= table.length / 3)
      throw new Error("Invalid GIF transparent color index.");
    const minimum = byte();
    if (minimum < 2 || minimum > 8) throw new Error("Invalid GIF LZW size.");
    const output = decodeLzw(blocks(), minimum, w * h);
    previous = disposal === 3 ? canvas.slice() : null;
    const rows: number[] = [];
    if (f & 64) {
      for (const [start, step] of [
        [0, 8],
        [4, 8],
        [2, 4],
        [1, 2],
      ])
        for (let row = start; row < h; row += step) rows.push(row);
    } else for (let row = 0; row < h; row++) rows.push(row);
    for (let row = 0; row < h; row++)
      for (let col = 0; col < w; col++) {
        const index = output[row * w + col];
        if (index === transparent) continue;
        if (index * 3 + 2 >= table.length)
          throw new Error("Invalid GIF color index.");
        canvas.set(
          [table[index * 3], table[index * 3 + 1], table[index * 3 + 2], 255],
          ((y + rows[row]) * width + x + col) * 4,
        );
      }
    frames.push({ pixels: canvas.slice(), duration: delay });
    duration += delay;
    lastRect = [x, y, w, h];
    lastDisposal = disposal;
    lastTransparent = transparent;
    delay = 100;
    disposal = 0;
    transparent = -1;
  }
  if (!trailer) throw new Error("Truncated GIF: missing trailer.");
  if (!frames.length) throw new Error("GIF contains no frames.");
  return { width, height, frames };
}
