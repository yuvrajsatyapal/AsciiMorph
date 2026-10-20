/** Sample at most 120 frames, distributing integer milliseconds without timing drift. */
export function generatorTimeline(loopSeconds = 0, startTime = 0) {
  const seconds = loopSeconds || 3;
  const total = Math.round(seconds * 1000);
  const count = Math.max(1, Math.min(120, Math.round(seconds * 10)));
  return Array.from({ length: count }, (_, index) => {
    const start = Math.round((index * total) / count);
    const end = Math.round(((index + 1) * total) / count);
    return { time: startTime + start / 1000, duration: end - start };
  });
}
