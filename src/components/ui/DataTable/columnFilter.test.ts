import { describe, expect, it } from "vitest";
import type { GridColDef } from "@mui/x-data-grid";
import {
  describeColumnFilter,
  emptyNumberValue,
  filterColumnsOf,
  readColumnFilter,
  toFilterItem,
  type FilterColumn,
} from "./columnFilter";

const ops = (...values: string[]) => values.map((value) => ({ value })) as unknown as GridColDef["filterOperators"];

const columns = [
  { field: "name", headerName: "Tenant", filterOperators: ops("contains", "equals") },
  {
    field: "mode",
    headerName: "Mode",
    type: "singleSelect",
    valueOptions: [{ value: "cash", label: "Cash" }, { value: "upi", label: "UPI" }, "Cheque"],
    filterOperators: ops("is", "not", "isAnyOf"),
  },
  { field: "amount", headerName: "Amount", type: "number", filterOperators: ops("=", "!=", ">", ">=", "<", "<=") },
  { field: "balance", headerName: "Balance", type: "number", filterable: false, filterOperators: ops(">=", "<=", "=") },
  { field: "date", headerName: "Date", type: "date", filterOperators: ops("is", "after", "before") },
  { field: "tags", headerName: "Tags", type: "singleSelect", valueOptions: [], filterOperators: ops("isAnyOf") },
  { field: "actions", type: "actions", filterOperators: ops("contains") },
] as GridColDef[];

const filterColumns = filterColumnsOf(columns);
const byField = (field: string) => filterColumns.find((c) => c.field === field) as FilterColumn;

describe("filterColumnsOf", () => {
  it("picks one control per column and skips what it cannot filter", () => {
    expect(filterColumns.map((c) => [c.field, c.kind])).toEqual([
      ["name", "text"],
      ["mode", "choice"],
      ["amount", "number"],
    ]);
  });

  it("labels a choice column's options", () => {
    expect(byField("mode").options).toEqual([
      { value: "cash", label: "Cash" },
      { value: "upi", label: "UPI" },
      { value: "Cheque", label: "Cheque" },
    ]);
  });
});

describe("readColumnFilter", () => {
  it("is none without an item that filters", () => {
    expect(readColumnFilter([], filterColumns)).toEqual({ state: "none" });
    expect(readColumnFilter([{ field: "name", operator: "contains", value: " " }], filterColumns)).toEqual({ state: "none" });
  });

  it("reads each kind", () => {
    expect(readColumnFilter([{ field: "mode", operator: "isAnyOf", value: ["cash"] }], filterColumns)).toMatchObject({
      state: "simple",
      value: { kind: "choice", values: ["cash"] },
    });
    expect(readColumnFilter([{ field: "mode", operator: "is", value: "upi" }], filterColumns)).toMatchObject({
      value: { kind: "choice", values: ["upi"] },
    });
    expect(readColumnFilter([{ field: "name", operator: "contains", value: "ram" }], filterColumns)).toMatchObject({
      value: { kind: "text", text: "ram" },
    });
    expect(readColumnFilter([{ field: "amount", operator: "<=", value: 500 }], filterColumns)).toMatchObject({
      value: { kind: "number", operator: "<=", amount: "500" },
    });
  });

  it("keeps a filter it has no control for as other", () => {
    const notCash = { field: "mode", operator: "not", value: "cash" };
    expect(readColumnFilter([notCash], filterColumns)).toEqual({ state: "other", item: notCash });
    const after = { field: "date", operator: "after", value: "2026-10-01" };
    expect(readColumnFilter([after], filterColumns)).toEqual({ state: "other", item: after });
  });
});

describe("toFilterItem", () => {
  it("writes the item the grid filters by", () => {
    expect(toFilterItem("mode", { kind: "choice", values: ["cash", "upi"] })).toEqual({
      id: "mode",
      field: "mode",
      operator: "isAnyOf",
      value: ["cash", "upi"],
    });
    expect(toFilterItem("name", { kind: "text", text: "  ram " })).toMatchObject({ operator: "contains", value: "ram" });
    expect(toFilterItem("amount", { kind: "number", operator: ">=", amount: "5,000" })).toMatchObject({
      operator: ">=",
      value: 5000,
    });
  });

  it("writes nothing for an empty control", () => {
    expect(toFilterItem("mode", { kind: "choice", values: [] })).toBeNull();
    expect(toFilterItem("name", { kind: "text", text: " " })).toBeNull();
    expect(toFilterItem("amount", emptyNumberValue())).toBeNull();
    expect(toFilterItem("amount", { kind: "number", operator: "=", amount: "abc" })).toBeNull();
  });
});

describe("describeColumnFilter", () => {
  const format = (n: number) => `₹${n}`;
  it("summarises for the chip", () => {
    expect(describeColumnFilter(byField("mode"), { kind: "choice", values: ["cash"] }, format)).toBe("Mode: Cash");
    expect(describeColumnFilter(byField("mode"), { kind: "choice", values: ["cash", "upi", "Cheque"] }, format)).toBe(
      "Mode: Cash, UPI +1"
    );
    expect(describeColumnFilter(byField("name"), { kind: "text", text: "ram" }, format)).toBe("Tenant: “ram”");
    expect(describeColumnFilter(byField("amount"), { kind: "number", operator: ">=", amount: "5000" }, format)).toBe(
      "Amount: ≥ ₹5000"
    );
    expect(describeColumnFilter(byField("amount"), { kind: "number", operator: "<=", amount: "5,000" }, format)).toBe(
      "Amount: ≤ ₹5000"
    );
  });
});
