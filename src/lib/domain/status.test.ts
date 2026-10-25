import { describe, expect, it } from "vitest";
import { statusLabel } from "./status";

describe("statusLabel", () => {
  it("turns a status into sentence-case words", () => {
    expect(statusLabel("partially_paid")).toBe("Partially paid");
    expect(statusLabel("not_due_yet")).toBe("Not due yet");
    expect(statusLabel("paid")).toBe("Paid");
  });
});
