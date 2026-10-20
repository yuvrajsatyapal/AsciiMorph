/** Initial transport contract only; scheduling and service messages arrive in Task 6. */
export const RENDER_PROTOCOL_VERSION = 1 as const;
export interface RenderMessageEnvelope {
  version: typeof RENDER_PROTOCOL_VERSION;
  requestId: string;
}
export type RenderErrorCode =
  | "InvalidInput"
  | "UnsupportedVersion"
  | "BudgetExceeded"
  | "MissingSource"
  | "MissingCalibration"
  | "Cancelled"
  | "Disposed";
export interface RenderErrorPayload {
  code: RenderErrorCode;
  message: string;
  recoverable: boolean;
}
