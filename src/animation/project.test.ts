import { describe, expect, it } from "vitest";
import { createDocument } from "@/core/document";
import {
  createAnimation,
  validateAnimation,
  duplicateFrame,
  removeFrame,
  moveFrame,
  frameAt,
  parseAnimation,
  serializeAnimation,
} from "./project";
describe("animation project", () => {
  it("clones independent documents and validates bounded durations and shape", () => {
    const d = createDocument(2, 1);
    const p = createAnimation([
      { doc: d, duration: 100 },
      { doc: d, duration: 200 },
    ]);
    expect(p.frames[0].doc.layers[0].cells[0]).not.toBe(
      p.frames[1].doc.layers[0].cells[0],
    );
    expect(() =>
      validateAnimation({ ...p, frames: [{ doc: d, duration: 0 }] }),
    ).toThrow();
    expect(() =>
      createAnimation([
        { doc: d, duration: 100 },
        { doc: createDocument(1, 1), duration: 100 },
      ]),
    ).toThrow();
    expect(parseAnimation(serializeAnimation(p))).toEqual(p);
  });
  it("keeps frames independent through duplication and respects per-frame playback timing", () => {
    const p = createAnimation([
      { doc: createDocument(1, 1), duration: 100 },
      { doc: createDocument(1, 1), duration: 250 },
    ]);
    const q = duplicateFrame(p, 0);
    expect(q.frames).toHaveLength(3);
    expect(q.frames[0].doc).not.toBe(q.frames[1].doc);
    expect(frameAt(p, 99)).toBe(0);
    expect(frameAt(p, 100)).toBe(1);
    expect(frameAt(p, 350)).toBe(0);
    expect(removeFrame(createAnimation(), 0).frames).toHaveLength(1);
    expect(moveFrame(p, 0, 1).frames[1]).toBe(p.frames[0]);
  });
  it("rejects excessive JSON and unsupported versions", () => {
    expect(() => parseAnimation('{"version":2}')).toThrow();
    expect(() => validateAnimation({ version: 1, frames: [] })).toThrow();
  });
});
