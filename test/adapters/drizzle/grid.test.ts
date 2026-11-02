// The grid builder's pure pieces (src/server/adapters/drizzle/grid). How the
// SQL it builds behaves is checked against the SQL functions it replaces, in
// queries/*Page.test.ts.
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { checkGrid, gridWords, likeEscape, type GridQuery, type GridTable } from "@/server/adapters/drizzle/grid";

describe("grid builder", () => {
  it("escapes \\, % and _ for LIKE, and nothing else", () => {
    expect(likeEscape("50% off_now \\ ok")).toBe("50\\% off\\_now \\\\ ok");
    expect(likeEscape("plain text")).toBe("plain text");
  });

  it("splits the search into words, as grid_words", () => {
    expect(gridWords("  asha   upi ")).toEqual(["asha", "upi"]);
    expect(gridWords("")).toEqual([]);
    expect(gridWords(undefined)).toEqual([]);
    expect(gridWords("   ")).toEqual([]);
    // A no-break space is not a word break in Postgres' \s, so not here either.
    expect(gridWords("Flat\u00a0101 asha")).toEqual(["Flat\u00a0101", "asha"]);
  });

  it("refuses a sort or a filter field the table doesn't offer, even an inherited name", () => {
    const table: GridTable<"a", "f"> = { sorts: { a: sql`a` }, fields: { f: sql`f` }, searchText: sql`f`, tieBreak: [] };
    const ok: GridQuery<"a", "f"> = { filters: [], logic: "and", sort: "a", dir: "asc", page: 0, pageSize: 10 };
    expect(() => checkGrid(table, ok)).not.toThrow();
    expect(() => checkGrid(table, { ...ok, sort: "toString" as "a" })).toThrow("That table query isn't valid");
    expect(() =>
      checkGrid(table, { ...ok, filters: [{ field: "constructor" as "f", operator: "contains", value: "x" }] })
    ).toThrow("That table filter isn't valid");
  });
});
