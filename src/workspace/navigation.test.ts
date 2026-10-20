import { expect, it } from "vitest";
import { prepareNavigation, registerNavigationGuard } from "./navigation";
it("awaits saves before navigation and blocks leaving on failure", async () => {
  let saved = false;
  const remove = registerNavigationGuard(async () => {
    saved = true;
  });
  await prepareNavigation();
  expect(saved).toBe(true);
  remove();
  const stop = registerNavigationGuard(async () => {
    throw new Error("Quota exceeded");
  });
  await expect(prepareNavigation()).rejects.toThrow("Quota exceeded");
  stop();
  await expect(prepareNavigation()).resolves.toBeUndefined();
});
