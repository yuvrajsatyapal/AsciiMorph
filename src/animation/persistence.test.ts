import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { createAnimation } from "./project";
import { loadAnimation, saveAnimation } from "./persistence";
describe("animation persistence", () => {
  it("saves a separate validated animation without aliasing documents", async () => {
    const p = createAnimation();
    await saveAnimation(p);
    const restored = await loadAnimation();
    expect(restored).toEqual(p);
    expect(restored?.frames[0].doc).not.toBe(p.frames[0].doc);
  });
  it("rejects malformed projects before writing", async () => {
    const p = createAnimation();
    await saveAnimation(p);
    await expect(saveAnimation({ ...p, frames: [] })).rejects.toThrow();
    expect((await loadAnimation())?.id).toBe(p.id);
  });
});
it("archives animations by ID and lists lightweight metadata", async () => {
  const { listAnimations } = await import("./persistence");
  const first = createAnimation();
  first.name = "Earlier work";
  await saveAnimation(first);
  const second = createAnimation();
  await saveAnimation(second);
  expect((await loadAnimation(first.id))?.name).toBe("Earlier work");
  expect((await loadAnimation())?.id).toBe(second.id);
  const rows = await listAnimations();
  expect(rows.find((row) => row.id === first.id)?.frames).toBe(1);
  expect(rows[0]).not.toHaveProperty("frames.doc");
  expect(rows[0]).not.toHaveProperty("document");
});
it("bounds archived project count while retaining the most recent project", async () => {
  const { listAnimations } = await import("./persistence");
  let last = createAnimation();
  for (let i = 0; i < 10; i++) {
    last = createAnimation();
    await saveAnimation(last);
  }
  expect((await listAnimations()).length).toBeLessThanOrEqual(8);
  expect((await loadAnimation())?.id).toBe(last.id);
});
it("migrates a version 1 latest animation into the project archive", async () => {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("asciimorph-animation");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  const old = createAnimation();
  old.name = "Legacy animation";
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("asciimorph-animation", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("projects");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result,
        tx = db.transaction("projects", "readwrite");
      tx.objectStore("projects").put(JSON.stringify(old), "latest");
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
  });
  const { listAnimations } = await import("./persistence");
  expect((await loadAnimation())?.name).toBe("Legacy animation");
  expect((await listAnimations()).find((row) => row.id === old.id)?.name).toBe(
    "Legacy animation",
  );
  expect((await loadAnimation(old.id))?.frames).toEqual(old.frames);
});
