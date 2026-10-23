import { it, expect } from "vitest";
import {
  validateWorkerRequest,
  validateWorkerResponse,
  atlasIdentityKey,
} from "./protocol";
import type { ReferenceCharacterAtlasV1 } from "./reference-characters";
const source = { id: "s", revision: 1, width: 5, height: 3 };
const settings = {
  version: 1,
  frameWidth: 5,
  frameHeight: 3,
  fontSize: 3,
  renderScale: 1,
  brightness: 0,
  contrast: 0,
  crop: { x: 0, y: 0, width: 1, height: 1 },
  rotation: 0,
  backdrop: "none",
};
const identity = {
  jobId: "j",
  revision: 1,
  sourceId: "s",
  sourceRevision: 1,
  calibrationId: "a",
};
const request = {
  version: 1,
  requestId: "r",
  type: "renderCharactersPreview",
  ...identity,
  source,
  settings,
  timeUs: 0,
};
const atlas: ReferenceCharacterAtlasV1 = {
  version: 1,
  originX: 0,
  originY: 0,
  spaceIndexOr65535: 65535,
  placement: "top-start-ltr",
  ordering: "input",
  fontPolicy: "reference-system-monospace",
  calibration: {
    version: 1,
    id: "a",
    fontKey: "measured",
    cellWidth: 0.6 * 3,
    cellHeight: 3,
    glyphs: [".", "#"],
    maskWidth: 1,
    maskHeight: 1,
    masks: new Uint8Array([0, 255]),
    coverage: new Float32Array([0, 1]),
    shapes: new Float32Array(18),
  },
};
it("profile transport is closed and exact-source-aware without altering legacy shapes", () => {
  expect(validateWorkerRequest(request)).toBe(request);
  expect(
    validateWorkerRequest({
      ...request,
      type: "renderCharactersExport",
      outputWidth: 5,
      outputHeight: 3,
    }),
  ).toBeTruthy();
  for (const bad of [
    { ...request, unexpected: true },
    { ...request, source: { ...source, width: 6 } },
    { ...request, source: { ...source, id: "other" } },
    { ...request, type: "renderPreview" },
    {
      ...request,
      type: "renderCharactersExport",
      outputWidth: 2,
      outputHeight: 1,
    },
  ])
    expect(() => validateWorkerRequest(bad)).toThrow();
});
it("atlas identity includes wrapper metadata and exact measured calibration", () => {
  expect(
    validateWorkerRequest({
      version: 1,
      requestId: "a",
      type: "setAtlas",
      atlas,
    }),
  ).toBeTruthy();
  for (const changed of [
    { ...atlas, originX: 0.5 },
    { ...atlas, originY: 0.5 },
    { ...atlas, fontPolicy: "verified-family" as const },
    { ...atlas, spaceIndexOr65535: 0 },
  ])
    expect(atlasIdentityKey(changed)).not.toBe(atlasIdentityKey(atlas));
  expect(() =>
    validateWorkerRequest({
      version: 1,
      requestId: "a",
      type: "setAtlas",
      atlas: { ...atlas, ordering: "coverage" },
    }),
  ).toThrow();
});
it("profile result uses a distinct frame discriminant with structural closed validation", () => {
  const response = {
    version: 1,
    requestId: "r",
    type: "charactersResult",
    ...identity,
    frame: {
      version: 1,
      width: 1,
      height: 1,
      rgba: new Uint8Array(4),
      grid: null,
    },
    backend: "rust-cpu",
    timings: { queueMs: 0, computeMs: 0, readbackMs: 0, totalMs: 0 },
  };
  expect(validateWorkerResponse(response)).toBe(response);
  expect(() =>
    validateWorkerResponse({ ...response, type: "result" }),
  ).toThrow();
  expect(() =>
    validateWorkerResponse({
      ...response,
      frame: { ...response.frame, bogus: true },
    }),
  ).toThrow();
});
it("complete context readiness is closed, versioned and separate from glyph-only readiness", () => {
  const base = { version: 1, requestId: "ready", type: "ready" };
  for (const ready of [
    base,
    { ...base, charactersProfileVersion: 1, charactersContextVersion: null },
    { ...base, charactersProfileVersion: 1, charactersContextVersion: 1 },
  ])
    expect(validateWorkerResponse(ready)).toBe(ready);
  for (const bad of [
    { ...base, charactersContextVersion: 1 },
    { ...base, charactersProfileVersion: null, charactersContextVersion: 1 },
    { ...base, charactersProfileVersion: 1, charactersContextVersion: 2 },
    { ...base, charactersProfileVersion: 1, charactersContextVersion: true },
    { ...base, charactersContextVersion: null, unknown: true },
  ])
    expect(() => validateWorkerResponse(bad)).toThrow();
});

it("atlas-retention readiness is separately closed and requires profile support", () => {
  const base = { version: 1, requestId: "ready", type: "ready" };
  const ready = {
    ...base,
    charactersProfileVersion: 1,
    charactersAtlasRetentionVersion: 1,
  };
  expect(validateWorkerResponse(ready)).toBe(ready);
  expect(
    validateWorkerResponse({ ...base, charactersAtlasRetentionVersion: null }),
  ).toBeTruthy();
  for (const bad of [
    { ...base, charactersAtlasRetentionVersion: 1 },
    { ...ready, charactersAtlasRetentionVersion: 2 },
    { ...ready, charactersAtlasRetentionVersion: true },
  ])
    expect(() => validateWorkerResponse(bad)).toThrow();
});
