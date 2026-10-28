import { MAX_BACKING_PIXELS, MAX_BACKING_SIDE } from "@/core/render";

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit++)
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

/** PNG color type 6 stores native straight RGBA directly. Stored DEFLATE blocks
 * avoid browser canvas premultiplication and keep allocation to one output buffer.
 * Each scanline uses filter 0; block boundaries may fall anywhere in a scanline. */
export function encodeRgbaPng(
  width: number,
  height: number,
  rgba: Uint8Array,
): Uint8Array<ArrayBuffer> {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > MAX_BACKING_SIDE ||
    height > MAX_BACKING_SIDE ||
    width * height > MAX_BACKING_PIXELS ||
    !(rgba instanceof Uint8Array) ||
    rgba.length !== width * height * 4
  )
    throw new Error("PNG frame bounds are invalid");
  const stride = width * 4 + 1;
  const rawLength = stride * height;
  const blocks = Math.ceil(rawLength / 65535);
  const zlibLength = 2 + rawLength + blocks * 5 + 4;
  const output = new Uint8Array(8 + 25 + 12 + zlibLength + 12);
  const view = new DataView(output.buffer);
  output.set([137, 80, 78, 71, 13, 10, 26, 10]);
  let cursor = 8;
  function beginChunk(name: string, length: number) {
    view.setUint32(cursor, length);
    for (let i = 0; i < 4; i++) output[cursor + 4 + i] = name.charCodeAt(i);
    cursor += 8;
    return cursor - 4;
  }
  function finishChunk(start: number) {
    let crc = 0xffffffff;
    for (let i = start; i < cursor; i++)
      crc = crcTable[(crc ^ output[i]) & 255] ^ (crc >>> 8);
    view.setUint32(cursor, (crc ^ 0xffffffff) >>> 0);
    cursor += 4;
  }
  const header = beginChunk("IHDR", 13);
  view.setUint32(cursor, width);
  view.setUint32(cursor + 4, height);
  output.set([8, 6, 0, 0, 0], cursor + 8);
  cursor += 13;
  finishChunk(header);
  const data = beginChunk("IDAT", zlibLength);
  output.set([0x78, 0x01], cursor);
  cursor += 2;
  let raw = 0,
    source = 0,
    adlerA = 1,
    adlerB = 0;
  while (raw < rawLength) {
    const length = Math.min(65535, rawLength - raw);
    output[cursor++] = raw + length === rawLength ? 1 : 0;
    view.setUint16(cursor, length, true);
    view.setUint16(cursor + 2, length ^ 65535, true);
    cursor += 4;
    for (let end = raw + length; raw < end; raw++) {
      const value = raw % stride === 0 ? 0 : rgba[source++];
      output[cursor++] = value;
      adlerA = (adlerA + value) % 65521;
      adlerB = (adlerB + adlerA) % 65521;
    }
  }
  view.setUint32(cursor, ((adlerB << 16) | adlerA) >>> 0);
  cursor += 4;
  finishChunk(data);
  const end = beginChunk("IEND", 0);
  finishChunk(end);
  return output;
}
