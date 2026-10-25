import type { SourceRef } from "./character-contract";
import type { STYLE_DISPATCH_IDS } from "./style-contract";
import type { StyleSettingsV1, RgbaFrameV1 } from "./style-contract";
import {
  RenderError,
  validateWorkerRequest,
  type RenderIdentity,
  type RenderTimings,
} from "./protocol";
/** Reserved initial dispatch identities; settings remain limited to accepted codecs. */
export type InitialStyleId = Exclude<
  keyof typeof STYLE_DISPATCH_IDS,
  "characters"
>;
export type StyleRenderType = "renderStylePreview" | "renderStyleExport";
export interface StyleRenderRequest extends RenderIdentity {
  source: SourceRef;
  styleId: InitialStyleId;
  settings: StyleSettingsV1;
  timeUs: number;
  outputWidth?: number;
  outputHeight?: number;
}
export interface StyleRenderResult extends RenderIdentity {
  styleId: InitialStyleId;
  frame: RgbaFrameV1;
  backend: "rust-cpu";
  timings: RenderTimings;
}
export function validateStyleRenderRequest(
  value: unknown,
  type: StyleRenderType,
): StyleRenderRequest {
  if (
    !value ||
    typeof value !== "object" ||
    ["version", "requestId", "type"].some((k) => Object.hasOwn(value, k))
  )
    throw new RenderError("InvalidInput", "Invalid style request");
  validateWorkerRequest({
    ...value,
    version: 1,
    requestId: "style-validation",
    type,
  });
  return value as StyleRenderRequest;
}
