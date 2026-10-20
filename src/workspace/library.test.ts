import "fake-indexeddb/auto";
import { beforeEach, expect, it } from "vitest";
import { createDocument } from "@/core/document";
import { createAnimation } from "@/animation/project";
import { saveProject, listProjects, getSnapshots } from "@/editor/persistence";
import { saveAnimation, loadAnimation } from "@/animation/persistence";
import {
  exportLibrary,
  importLibrary,
  parseLibrary,
  deleteLibraryItem,
  duplicateLibraryItem,
  renameLibraryItem,
  getLibrary,
  setProjectDetails,
  readProjectDetails,
} from "./library";
beforeEach(() => localStorage.clear());
it("round-trips library documents, animations, snapshots and metadata without replacing originals", async () => {
  const doc = createDocument(2, 2, "Keep me");
  await saveProject(doc);
  const animation = createAnimation();
  await saveAnimation(animation);
  setProjectDetails(`artwork:${doc.id}`, {
    folder: "Studies",
    pinned: true,
    tags: ["gold"],
  });
  const backup = await exportLibrary();
  const imported = await importLibrary(backup);
  expect(imported.artworks).toBeGreaterThan(0);
  const docs = await listProjects();
  expect(docs.find((d) => d.id === doc.id)?.name).toBe("Keep me");
  const restored = docs.find((d) => d.id !== doc.id && d.name === "Keep me")!;
  expect(restored).toBeDefined();
  expect((await getSnapshots(restored.id)).length).toBeGreaterThan(0);
  expect(readProjectDetails(`artwork:${restored.id}`)).toMatchObject({
    folder: "Studies",
    pinned: true,
  });
  expect((await loadAnimation(animation.id))?.id).toBe(animation.id);
});
it("validates the entire backup before writing any project", async () => {
  const before = (await listProjects()).length;
  const archive = JSON.parse(await exportLibrary());
  archive.artworks.push({ document: { invalid: true }, snapshots: [] });
  await expect(importLibrary(JSON.stringify(archive))).rejects.toThrow();
  expect((await listProjects()).length).toBe(before);
  expect(() => parseLibrary('{"kind":"evil"}')).toThrow();
});
it("renames, duplicates with fresh IDs and explicitly deletes projects", async () => {
  const doc = createDocument(2, 2, "Original");
  await saveProject(doc);
  await renameLibraryItem(`artwork:${doc.id}`, "Renamed");
  const copy = await duplicateLibraryItem(`artwork:${doc.id}`);
  expect(copy).not.toBe(`artwork:${doc.id}`);
  expect((await getLibrary()).find((d) => d.key === copy)?.name).toBe(
    "Renamed copy",
  );
  await deleteLibraryItem(copy);
  expect((await getLibrary()).find((d) => d.key === copy)).toBeUndefined();
  expect(
    (await getLibrary()).find((d) => d.key === `artwork:${doc.id}`)?.name,
  ).toBe("Renamed");
});
it("preserves the latest remaining animation after explicit deletion", async () => {
  const a = createAnimation(),
    b = createAnimation();
  await saveAnimation(a);
  await saveAnimation(b);
  await deleteLibraryItem(`animation:${b.id}`);
  expect(await loadAnimation(b.id)).toBeNull();
  expect((await loadAnimation())?.id).toBe(a.id);
});
it("includes reusable gallery templates and favorites in the complete backup", async () => {
  localStorage.setItem(
    "asciimorph.gallery.favorites.v1",
    '["template:orbital"]',
  );
  localStorage.setItem("asciimorph.gallery.templates.v1", "[]");
  const backup = parseLibrary(await exportLibrary());
  expect(backup.preferences["asciimorph.gallery.favorites.v1"]).toBe(
    '["template:orbital"]',
  );
  expect(backup.preferences["asciimorph.gallery.templates.v1"]).toBe("[]");
});
it("keeps an existing document when the next save runs out of storage", async () => {
  const { vi } = await import("vitest");
  const doc = createDocument(2, 2, "Before quota failure");
  await saveProject(doc);
  const original = IDBObjectStore.prototype.put;
  const blocked = vi
    .spyOn(IDBObjectStore.prototype, "put")
    .mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore["put"]>
    ) {
      if (this.name === "documents")
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      return original.apply(this, args);
    });
  await expect(saveProject({ ...doc, name: "Unsaved change" })).rejects.toThrow(
    "Quota exceeded",
  );
  blocked.mockRestore();
  expect((await listProjects()).find((item) => item.id === doc.id)?.name).toBe(
    "Before quota failure",
  );
});
it("restores template and preset collections alongside already saved collections", async () => {
  const { saveCustomTemplate, readCustomTemplates } = await import(
    "@/gallery/catalog"
  );
  const { DEFAULT_GENERATOR } = await import("@/creative/generators");
  saveCustomTemplate(
    createDocument(2, 2, "Backed-up template"),
    ["saved"],
    "Collection",
    localStorage,
  );
  localStorage.setItem(
    "asciimorph-workspace:generator.presets",
    JSON.stringify([{ name: "Recovered preset", settings: DEFAULT_GENERATOR }]),
  );
  const backup = await exportLibrary();
  localStorage.setItem("asciimorph.gallery.templates.v1", "[]");
  localStorage.setItem(
    "asciimorph-workspace:generator.presets",
    JSON.stringify([{ name: "Current preset", settings: DEFAULT_GENERATOR }]),
  );
  await importLibrary(backup);
  expect(
    readCustomTemplates(localStorage).some(
      (item) => item.name === "Backed-up template",
    ),
  ).toBe(true);
  expect(
    JSON.parse(
      localStorage.getItem("asciimorph-workspace:generator.presets")!,
    ).map((item: { name: string }) => item.name),
  ).toEqual(["Current preset", "Recovered preset"]);
});
it("rejects an oversized backup at export using the same byte budget as import", async () => {
  await expect(exportLibrary(100)).rejects.toThrow(/exceeds/);
  expect(() =>
    parseLibrary(
      JSON.stringify({ kind: "asciimorph-library", version: 1 }),
      10,
    ),
  ).toThrow(/exceeds/);
});
it("rejects malformed saved template and preset collections before importing artworks", async () => {
  const archive = JSON.parse(await exportLibrary());
  archive.preferences["asciimorph-workspace:generator.presets"] = "[null]";
  const before = (await listProjects()).length;
  await expect(importLibrary(JSON.stringify(archive))).rejects.toThrow(
    /preset/,
  );
  expect((await listProjects()).length).toBe(before);
});
it("round-trips the maximum snapshot archive without adding an extra recovery row", async () => {
  const archive = JSON.parse(await exportLibrary());
  const doc=createDocument(2,2,"Snapshot boundary");
  archive.artworks=[{document:doc,snapshots:Array.from({length:100},(_,i)=>({id:`snapshot-${i}`,documentId:doc.id,savedAt:new Date(1700000000000+i).toISOString(),data:JSON.stringify(doc)}))}];
  archive.animations=[];
  archive.preferences={};
  await importLibrary(JSON.stringify(archive));
  const restored=(await listProjects()).find(item=>item.name===doc.name)!;
  expect((await getSnapshots(restored.id)).length).toBe(100);
  const backup=await exportLibrary();
  expect(()=>parseLibrary(backup)).not.toThrow();
});
