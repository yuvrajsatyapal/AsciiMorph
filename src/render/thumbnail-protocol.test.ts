import { expect, it } from "vitest";
import fixtures from "../../tests/fixtures/render/styles/wire-v1.json";
import { validateWorkerRequest, validateWorkerResponse } from "./protocol";
import { validateStyleSettings } from "./style-contract";

const f = fixtures.cases[0];
const request = {
  version: 1,
  requestId: "t",
  type: "renderThumbnail",
  jobId: "t",
  revision: 1,
  sourceId: f.source.id,
  sourceRevision: f.source.revision,
  calibrationId: "",
  source: f.source,
  timeUs: f.settings.timeUs,
  profile: {
    kind: "style",
    settings: validateStyleSettings(f.settings, f.source),
  },
  maxSide: 192,
};
it("validates distinct thumbnail identity and bounded size", () => {
  expect(validateWorkerRequest(request).type).toBe("renderThumbnail");
  for (const maxSide of [0, 193, 1.5, -1])
    expect(() => validateWorkerRequest({ ...request, maxSide })).toThrow();
  expect(() =>
    validateWorkerRequest({ ...request, sourceId: "other" }),
  ).toThrow();
  expect(() =>
    validateWorkerRequest({ ...request, outputWidth: 192 }),
  ).toThrow();
  expect(() =>
    validateWorkerRequest({ ...request, type: "renderStyleExport" }),
  ).toThrow();
});
it("validates separate thumbnail result envelope", () => {
  expect(
    validateWorkerResponse({
      version: 1,
      requestId: "t",
      type: "thumbnailResult",
      jobId: "t",
      revision: 1,
      sourceId: f.source.id,
      sourceRevision: f.source.revision,
      calibrationId: "",
      styleId: "pixel",
      backend: "rust-cpu",
      frame: { version: 1, width: 1, height: 1, rgba: new Uint8Array(4) },
      timings: { queueMs: 0, computeMs: 1, readbackMs: 0, totalMs: 1 },
    }).type,
  ).toBe("thumbnailResult");
});
