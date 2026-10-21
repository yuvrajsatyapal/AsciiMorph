import { expect, it, vi } from "vitest";
import {
  CalibrationBudgetError,
  createCalibrationBudget,
  estimateGlyphCalibration,
  DEFAULT_CALIBRATION_LIMITS,
} from "./glyph-calibration-budget";
it("estimates exact reference bytes without allocating payload", () => {
  expect(estimateGlyphCalibration(192, 320, 256)).toEqual({
    pixels: 61440,
    maskBytes: 15728640,
    retainedBytes: 15738880,
    cacheBytes: 15755264,
    deliveryBytes: 15755264,
    jobBytes: 32033828,
  });
  for (const args of [
    [0, 1, 2],
    [1.5, 1, 2],
    [1, 1, 1],
    [1, 1, 257],
    [Number.MAX_SAFE_INTEGER, 2, 2],
  ])
    expect(() =>
      estimateGlyphCalibration(...(args as [number, number, number])),
    ).toThrow();
});
it("admits maximum reference, rejects oversized retained result before reservations", () => {
  const b = createCalibrationBudget();
  const [job, delivery] = b.reserveJob(estimateGlyphCalibration(192, 320, 256));
  expect(b.usage.activeJobs).toBe(1);
  expect(b.usage.subscribers).toBe(1);
  b.release(delivery);
  b.release(job);
  expect(b.usage.totalBytes).toBe(0);
  expect(() => b.reserveJob(estimateGlyphCalibration(512, 512, 256))).toThrow(
    CalibrationBudgetError,
  );
  expect(() => b.release(job)).toThrow(/released/);
});
it("validates positive safe limits and retained boundary", () => {
  for (const limits of [
    { workingBytes: NaN },
    { activeJobs: 0 },
    { cacheBytes: DEFAULT_CALIBRATION_LIMITS.workingBytes + 1 },
    { subscribers: 1.5 },
  ])
    expect(() => createCalibrationBudget(limits)).toThrow();
  const e = estimateGlyphCalibration(1, 1, 2);
  const b = createCalibrationBudget({ retainedBytes: e.retainedBytes });
  const tokens = b.reserveJob(e);
  tokens.forEach((t) => b.release(t));
  expect(() =>
    createCalibrationBudget({ retainedBytes: e.retainedBytes - 1 }).reserveJob(
      e,
    ),
  ).toThrow(CalibrationBudgetError);
});
it("evicts byte LRU, pins used hits, and atomically admits job plus delivery", () => {
  const e = estimateGlyphCalibration(1, 1, 2),
    evict = vi.fn();
  const b = createCalibrationBudget({
    cacheBytes: e.cacheBytes * 2,
    workingBytes: e.jobBytes + e.deliveryBytes + e.cacheBytes - 1,
    subscribers: 2,
  });
  const [a, ad] = b.reserveJob(e);
  b.release(ad);
  expect(b.cache(a, e, evict)).toBe(true);
  const unpin = b.pin(a);
  const d = b.reserveDelivery(e);
  b.release(d);
  expect(() => b.reserveJob(e)).toThrow(CalibrationBudgetError);
  expect(evict).not.toHaveBeenCalled();
  unpin();
  const [c, cd] = b.reserveJob(e);
  expect(evict).toHaveBeenCalledOnce();
  b.release(cd);
  b.release(c);
  expect(b.usage.totalBytes).toBe(0);
});
it("counts deliveries and active jobs independently and keeps tokens over clear", () => {
  const e = estimateGlyphCalibration(1, 1, 2);
  const b = createCalibrationBudget({ activeJobs: 1, subscribers: 2 });
  const [j, d] = b.reserveJob(e);
  const d2 = b.reserveDelivery(e);
  expect(() => b.reserveDelivery(e)).toThrow(CalibrationBudgetError);
  b.clearCache();
  expect(b.usage.activeJobs).toBe(1);
  expect(b.usage.subscribers).toBe(2);
  b.release(d);
  b.release(d2);
  expect(() => b.reserveJob(e)).toThrow(CalibrationBudgetError);
  b.release(j);
});
it("cache byte limit evicts the oldest entry below the count cap", () => {
  const e = estimateGlyphCalibration(1, 1, 2),
    first = vi.fn(),
    second = vi.fn();
  const b = createCalibrationBudget({ cacheBytes: e.cacheBytes });
  const [a, ad] = b.reserveJob(e);
  b.release(ad);
  expect(b.cache(a, e, first)).toBe(true);
  const [c, cd] = b.reserveJob(e);
  b.release(cd);
  expect(b.cache(c, e, second)).toBe(true);
  expect(first).toHaveBeenCalledOnce();
  expect(second).not.toHaveBeenCalled();
  expect(b.usage.cacheEntries).toBe(1);
  b.clearCache();
  expect(second).toHaveBeenCalledOnce();
  expect(b.usage.totalBytes).toBe(0);
});
it("atomic measured upgrade replaces all live charges or changes nothing", () => {
  const e = estimateGlyphCalibration(1, 1, 2);
  const b = createCalibrationBudget({ workingBytes: 100000, cacheBytes: 1 });
  const [j, d] = b.reserveJob(e);
  const d2 = b.reserveDelivery(e);
  const before = b.usage;
  expect(() =>
    b.reviseJob(j, [d, d2], estimateGlyphCalibration(100, 100, 2)),
  ).toThrow(CalibrationBudgetError);
  expect(b.usage).toEqual(before);
  const smaller = estimateGlyphCalibration(1, 2, 2);
  b.reviseJob(j, [d, d2], smaller);
  expect(b.usage.activeJobBytes).toBe(smaller.jobBytes);
  expect(b.usage.deliveryBytes).toBe(2 * smaller.deliveryBytes);
  expect(() => b.reviseJob(j, [d, d], smaller)).toThrow();
  [j, d, d2].forEach(b.release);
  expect(b.usage.totalBytes).toBe(0);
});
it("measured replacement rejects unsafe individual charges without mutating or evicting", () => {
  const e = estimateGlyphCalibration(1, 1, 2),
    evict = vi.fn();
  const b = createCalibrationBudget({
    workingBytes: 200000,
    cacheBytes: 50000,
  });
  const [cached, cd] = b.reserveJob(e);
  b.release(cd);
  b.cache(cached, e, evict);
  const [j, d] = b.reserveJob(e);
  const before = b.usage;
  expect(() => b.reviseJob(j, [d], { ...e, jobBytes: -1 })).toThrow(
    CalibrationBudgetError,
  );
  expect(b.usage).toEqual(before);
  expect(evict).not.toHaveBeenCalled();
  expect(() => b.reviseJob(j, [d], { ...e, jobBytes: 300000 })).toThrow(
    CalibrationBudgetError,
  );
  expect(b.usage).toEqual(before);
  expect(evict).not.toHaveBeenCalled();
  b.release(d);
  b.release(j);
  b.clearCache();
  expect(b.usage.totalBytes).toBe(0);
});
