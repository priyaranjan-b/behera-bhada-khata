import { describe, expect, it } from "vitest";
import { DISPLAY_DATE_FORMATS } from "@/lib/types";
import { DATE_FORMAT_OPTIONS } from "./dateFormats";

describe("date format options (A36)", () => {
  it("offers every display format, the default first, each with a label and an example", () => {
    expect(DATE_FORMAT_OPTIONS.map((o) => o.value)).toEqual([...DISPLAY_DATE_FORMATS]);
    expect(DATE_FORMAT_OPTIONS.map((o) => o.example("2026-11-18"))).toEqual([
      "18/Nov/2026",
      "18/11/2026",
      "18 Nov 2026",
      "2026-11-18",
    ]);
    for (const option of DATE_FORMAT_OPTIONS) expect(option.label).not.toBe("");
  });
});
