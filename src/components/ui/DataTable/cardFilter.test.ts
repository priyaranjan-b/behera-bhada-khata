import { describe, expect, it } from "vitest";
import { isCardFilterOn, toggleCardFilter } from "./cardFilter";

const cash = { field: "mode", operator: "is", value: "Cash" };
const chequeOrOther = { field: "mode", operator: "isAnyOf", value: ["Cheque", "Other"] };
const tenant = { id: 1, field: "tenantName", operator: "contains", value: "asha" };

describe("toggleCardFilter", () => {
  it("turns the card's filter on, replacing a filter on the same column but keeping the others", () => {
    const next = toggleCardFilter({ items: [tenant, { id: 2, field: "mode", operator: "is", value: "UPI" }] }, cash);
    expect(next.items).toEqual([tenant, { id: "card-mode", field: "mode", operator: "is", value: "Cash" }]);
    expect(isCardFilterOn(next, cash)).toBe(true);
  });

  it("clears that column when the same card is tapped again", () => {
    const on = toggleCardFilter({ items: [tenant] }, cash);
    expect(toggleCardFilter(on, cash).items).toEqual([tenant]);
  });

  it("matches a list of values in any order", () => {
    const on = { items: [{ id: 3, field: "mode", operator: "isAnyOf", value: ["Other", "Cheque"] }] };
    expect(isCardFilterOn(on, chequeOrOther)).toBe(true);
    expect(isCardFilterOn(on, cash)).toBe(false);
    expect(isCardFilterOn({ items: [] }, chequeOrOther)).toBe(false);
  });
});
