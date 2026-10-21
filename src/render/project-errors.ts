/** Shared without importing the default registry: no initialization cycle. */
export type ProjectErrorCode =
  | "invalid-project"
  | "unsupported-version"
  | "unsupported-version-feature"
  | "unknown-parameter"
  | "unsupported-schema"
  | "not-ready"
  | "missing-source"
  | "source-mismatch"
  | "missing-mask-asset";
export class ProjectValidationError extends Error {
  constructor(
    public readonly code: ProjectErrorCode,
    public readonly path: string,
    message: string,
  ) {
    super(message);
    this.name = "ProjectValidationError";
  }
}
