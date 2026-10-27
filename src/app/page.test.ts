import { describe, expect, it } from "vitest";
import Page from "./page";

describe("default application entry", () => {
  it("redirects to the rebuilt effects Studio", () => {
    let redirect: unknown;
    try {
      Page();
    } catch (error) {
      redirect = error;
    }
    expect(redirect).toMatchObject({
      digest: expect.stringContaining(";/app;"),
    });
  });
});
