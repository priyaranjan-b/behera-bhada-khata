import { describe, expect, it } from "vitest";
import { pickColumnTotals, sumColumns } from "./totals";

const columns = [
  { field: "amount", headerName: "Amount" },
  { field: "balance", headerName: "Balance" },
];

describe("sumColumns", () => {
  it("adds up each column over every row, rounded to paise", () => {
    const rows = [
      { amount: 0.1, balance: 100 },
      { amount: 0.2, balance: 50.5 },
    ];
    expect(sumColumns(rows, columns, (row, col) => row[col.field as keyof typeof row])).toEqual([
      { field: "amount", label: "Amount", amount: 0.3 },
      { field: "balance", label: "Balance", amount: 150.5 },
    ]);
  });

  it("counts blank and non-number cells as nothing", () => {
    const rows = [{ amount: null }, { amount: "—" }, { amount: Number.NaN }, { amount: 25 }];
    expect(sumColumns(rows, [columns[0]], (row) => row.amount)).toEqual([{ field: "amount", label: "Amount", amount: 25 }]);
  });

  it("is zero with no rows, and labels a column without a header by its field", () => {
    expect(sumColumns([], [{ field: "credit" }], () => 1)).toEqual([{ field: "credit", label: "credit", amount: 0 }]);
  });
});

describe("pickColumnTotals", () => {
  it("takes the server's figure per column, in column order, leaving out columns it didn't add up", () => {
    const labelled = columns.map((c) => ({ field: c.field, label: c.headerName }));
    expect(pickColumnTotals(labelled, { balance: 22000, amount: 120000 })).toEqual([
      { field: "amount", label: "Amount", amount: 120000 },
      { field: "balance", label: "Balance", amount: 22000 },
    ]);
    expect(pickColumnTotals(labelled, { balance: 5 })).toEqual([{ field: "balance", label: "Balance", amount: 5 }]);
  });
});
