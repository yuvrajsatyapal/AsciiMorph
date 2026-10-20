import { expect, it } from "vitest";
import { generatorTimeline } from "./generator-timeline";
import { createAnimation } from "@/animation/project";
import { createDocument } from "@/core/document";

it.each([13, 17, 29, 30])(
  "keeps a %i second capped generator loop valid and exact",
  (seconds) => {
    const timeline = generatorTimeline(seconds, 2);
    expect(timeline).toHaveLength(120);
    expect(timeline.every((frame) => Number.isInteger(frame.duration))).toBe(
      true,
    );
    expect(timeline.reduce((total, frame) => total + frame.duration, 0)).toBe(
      seconds * 1000,
    );
    expect(timeline[0].time).toBe(2);
    expect(timeline.at(-1)!.time).toBeLessThan(seconds + 2);
    const doc = createDocument(1, 1);
    expect(() =>
      createAnimation(timeline.map(({ duration }) => ({ doc, duration }))),
    ).not.toThrow();
  },
);

it("retains the three second default when looping is disabled", () => {
  const timeline = generatorTimeline(0);
  expect(timeline).toHaveLength(30);
  expect(timeline.reduce((total, frame) => total + frame.duration, 0)).toBe(
    3000,
  );
});
