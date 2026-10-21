/** Logical owned-byte charges, not a process/RSS limit. Caller snapshots end ownership at handoff. */
export const DEFAULT_CALIBRATION_LIMITS = {
  retainedBytes: 16 * 1024 * 1024,
  workingBytes: 128 * 1024 * 1024,
  cacheBytes: 32 * 1024 * 1024,
  cacheEntries: 16,
  activeJobs: 16,
  subscribers: 16,
} as const;
export type CalibrationLimits = {
  [K in keyof typeof DEFAULT_CALIBRATION_LIMITS]: number;
};
export class CalibrationBudgetError extends Error {
  constructor(message = "Glyph calibration budget exceeded") {
    super(message);
    this.name = "CalibrationBudgetError";
  }
}
function safe(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new CalibrationBudgetError("Unsafe calibration byte arithmetic");
  return value;
}
export function estimateGlyphCalibration(
  width: number,
  height: number,
  count: number,
) {
  if (
    ![width, height, count].every((v) => Number.isSafeInteger(v) && v > 0) ||
    count < 2 ||
    count > 256
  )
    throw new CalibrationBudgetError(
      "Invalid calibration raster dimensions/count",
    );
  const pixels = safe(width * height),
    maskBytes = safe(pixels * count);
  const retainedBytes = safe(maskBytes + 40 * count);
  return {
    pixels,
    maskBytes,
    retainedBytes,
    cacheBytes: safe(retainedBytes + 16384),
    deliveryBytes: safe(retainedBytes + 16384),
    jobBytes: safe(2 * maskBytes + 76 * count + 8 * pixels + 36 + 65536),
  };
}
export type CalibrationEstimate = ReturnType<typeof estimateGlyphCalibration>;
/** Before font loading: one tiny RGBA surface plus bounded bookkeeping, no masks.
 * Each subscriber reserves the maximum result snapshot plus metadata allowance.
 */
export function estimateReferenceMetrics(): CalibrationEstimate {
  return {
    pixels: 256,
    maskBytes: 0,
    retainedBytes: 0,
    cacheBytes: 0,
    deliveryBytes: DEFAULT_CALIBRATION_LIMITS.retainedBytes + 16384,
    jobBytes: 65536 + 16 * 16 * 4,
  };
}

export interface CalibrationReservation {
  readonly id: symbol;
}
type Kind = "job" | "delivery" | "cache";
interface Charge {
  kind: Kind;
  bytes: number;
  pins: number;
  evict?: () => void;
}
/** Tokens remain owned until settlement, even when pending lookups/cache generations clear. */
export function createCalibrationBudget(
  overrides: Partial<CalibrationLimits> = {},
) {
  const limits: CalibrationLimits = Object.freeze({
    ...DEFAULT_CALIBRATION_LIMITS,
    ...overrides,
  });
  if (
    Object.values(limits).some((v) => !Number.isSafeInteger(v) || v <= 0) ||
    limits.cacheBytes > limits.workingBytes
  )
    throw new CalibrationBudgetError("Invalid calibration limits");
  const charges = new Map<CalibrationReservation, Charge>();
  const caches = new Map<CalibrationReservation, Charge>();
  function usage() {
    let cacheBytes = 0,
      activeJobBytes = 0,
      deliveryBytes = 0,
      activeJobs = 0,
      subscribers = 0;
    for (const c of charges.values()) {
      if (c.kind === "cache") cacheBytes += c.bytes;
      else if (c.kind === "job") {
        activeJobBytes += c.bytes;
        activeJobs++;
      } else {
        deliveryBytes += c.bytes;
        subscribers++;
      }
    }
    return {
      cacheBytes,
      activeJobBytes,
      deliveryBytes,
      activeJobs,
      subscribers,
      cacheEntries: caches.size,
      totalBytes: cacheBytes + activeJobBytes + deliveryBytes,
    };
  }
  function charge(token: CalibrationReservation): Charge {
    const c = charges.get(token);
    if (!c) throw new Error("Calibration reservation already released");
    return c;
  }
  function release(token: CalibrationReservation) {
    const c = charge(token);
    if (c.pins) throw new Error("Pinned calibration reservation");
    charges.delete(token);
    caches.delete(token);
    if (c.kind === "cache") c.evict?.();
  }
  function evictOne(): boolean {
    for (const [t, c] of caches)
      if (!c.pins) {
        release(t);
        return true;
      }
    return false;
  }
  function fit(bytes: number) {
    safe(bytes);
    while (usage().totalBytes + bytes > limits.workingBytes)
      if (!evictOne()) throw new CalibrationBudgetError();
  }
  function add(kind: Kind, bytes: number): CalibrationReservation {
    const t = { id: Symbol(kind) };
    charges.set(t, { kind, bytes, pins: 0 });
    return t;
  }
  function retained(e: CalibrationEstimate) {
    if (e.retainedBytes > limits.retainedBytes)
      throw new CalibrationBudgetError(
        "Glyph calibration retained-result budget exceeded",
      );
  }
  return {
    limits,
    get usage() {
      return Object.freeze(usage());
    },
    reserveJob(
      e: CalibrationEstimate,
    ): [CalibrationReservation, CalibrationReservation] {
      retained(e);
      const u = usage();
      if (
        u.activeJobs >= limits.activeJobs ||
        u.subscribers >= limits.subscribers
      )
        throw new CalibrationBudgetError(
          "Glyph calibration job/subscriber limit exceeded",
        );
      fit(safe(e.jobBytes + e.deliveryBytes));
      return [add("job", e.jobBytes), add("delivery", e.deliveryBytes)];
    },
    reserveDelivery(e: CalibrationEstimate) {
      retained(e);
      if (usage().subscribers >= limits.subscribers)
        throw new CalibrationBudgetError(
          "Glyph calibration subscriber limit exceeded",
        );
      fit(e.deliveryBytes);
      return add("delivery", e.deliveryBytes);
    },
    /** Validate the entire replacement before mutating tokens or evicting cache.
     * Synchronous commit makes the measured J + all current D upgrade atomic.
     */
    reviseJob(
      token: CalibrationReservation,
      deliveries: CalibrationReservation[],
      e: CalibrationEstimate,
    ) {
      for (const bytes of Object.values(e)) safe(bytes);
      retained(e);
      const job = charge(token);
      if (job.kind !== "job") throw new Error("Expected job reservation");
      if (new Set(deliveries).size !== deliveries.length)
        throw new Error("Duplicate delivery reservation");
      const subscribers = deliveries.map((t) => {
        const c = charge(t);
        if (c.kind !== "delivery")
          throw new Error("Expected delivery reservation");
        return c;
      });
      const replacement = safe(
        e.jobBytes + safe(e.deliveryBytes * subscribers.length),
      );
      const previous =
        job.bytes + subscribers.reduce((sum, c) => sum + c.bytes, 0);
      let total = safe(usage().totalBytes - previous + replacement);
      const evictions: CalibrationReservation[] = [];
      for (const [t, c] of caches) {
        if (total <= limits.workingBytes) break;
        if (!c.pins) {
          evictions.push(t);
          total -= c.bytes;
        }
      }
      if (total > limits.workingBytes) throw new CalibrationBudgetError();
      for (const t of evictions) release(t);
      job.bytes = e.jobBytes;
      for (const c of subscribers) c.bytes = e.deliveryBytes;
    },
    release,
    pin(token: CalibrationReservation) {
      const c = charge(token);
      if (c.kind !== "cache") throw new Error("Expected cache reservation");
      c.pins++;
      caches.delete(token);
      caches.set(token, c);
      let done = false;
      return () => {
        if (done) throw new Error("Calibration pin already released");
        done = true;
        c.pins--;
      };
    },
    cache(
      token: CalibrationReservation,
      e: CalibrationEstimate,
      evict: () => void,
    ): boolean {
      const c = charge(token);
      if (c.kind !== "job") throw new Error("Expected job reservation");
      if (e.cacheBytes > limits.cacheBytes) return false;
      while (
        caches.size >= limits.cacheEntries ||
        usage().cacheBytes + e.cacheBytes > limits.cacheBytes ||
        usage().totalBytes - c.bytes + e.cacheBytes > limits.workingBytes
      )
        if (!evictOne()) return false;
      c.kind = "cache";
      c.bytes = e.cacheBytes;
      c.evict = evict;
      caches.set(token, c);
      return true;
    },
    clearCache() {
      for (const t of [...caches.keys()]) release(t);
    },
  };
}
