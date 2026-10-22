import { it, expect, vi } from "vitest";
import { createMessageChannelScheduler } from "./worker-macrotask";
it("production channel delivers bounded callbacks, cancelled queue generations never run", async () => {
  const s = createMessageChannelScheduler(),
    called: string[] = [];
  const first = s.schedule(() => called.push("cancelled"));
  first();
  s.schedule(() => called.push("live"));
  await vi.waitFor(() => expect(called).toEqual(["live"]));
  s.dispose();
});
it("production channel dispose closes pending work and idempotently refuses new work", async () => {
  const s = createMessageChannelScheduler(),
    run = vi.fn();
  s.schedule(run);
  s.dispose();
  s.dispose();
  s.schedule(run);
  await new Promise((r) => setTimeout(r, 15));
  expect(run).not.toHaveBeenCalled();
});
