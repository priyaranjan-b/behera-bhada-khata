import { describe, expect, it } from "vitest";
import { pgTimestampToIso } from "./columns";

describe("pgTimestampToIso", () => {
  it("turns Postgres' text form into the ISO form PostgREST sends", () => {
    expect(pgTimestampToIso("2026-03-05 10:00:00.123456+00")).toBe("2026-03-05T10:00:00.123456+00:00");
    expect(pgTimestampToIso("2026-03-05 10:00:00+05:30")).toBe("2026-03-05T10:00:00+05:30");
  });

  it("keeps a value that is already ISO, and accepts a Date", () => {
    expect(pgTimestampToIso("2026-03-05T10:00:00+00:00")).toBe("2026-03-05T10:00:00+00:00");
    expect(pgTimestampToIso(new Date("2026-03-05T10:00:00Z"))).toBe("2026-03-05T10:00:00.000Z");
  });
});
