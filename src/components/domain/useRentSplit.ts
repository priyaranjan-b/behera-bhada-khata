"use client";

import { useState } from "react";
import { defaultRentSplit, rentSplitProblem, splitEqually, type HouseShare } from "@/lib/domain/houses";

export interface RentSplitHouse {
  unitCode: string;
  label: string | null;
  /** The house's rent now (D39): the split starts in proportion to these. */
  baseRent: number | null;
}

export interface RentSplit {
  /** Several houses and a rent: the owner must say how it splits. */
  needed: boolean;
  houses: RentSplitHouse[];
  rent: number;
  /** What each house's field shows, by code. */
  inputs: Record<string, string>;
  setShare(unitCode: string, value: string): void;
  splitEqually(): void;
  /** Why it can't be saved yet, or null. */
  problem: string | null;
  /** What to send as `houseRents`: undefined when no split is needed. */
  houseRents: HouseShare[] | undefined;
}

interface State {
  houses: string;
  rent: number;
  inputs: Record<string, string>;
  /** The owner typed an amount: a new rent no longer redraws the split. */
  typed: boolean;
}

function startingInputs(rent: number, houses: RentSplitHouse[]): Record<string, string> {
  return Object.fromEntries(defaultRentSplit(rent, houses).map((s) => [s.unitCode, s.share > 0 ? String(s.share) : ""]));
}

/**
 * How a tenant's rent splits over their houses (D39), for the forms that set
 * a rent: Add / Edit tenant, Correct rent, Start tracking rent. Starts in
 * proportion to the houses' own rents (defaultRentSplit) and follows the
 * rent as it is typed - until the owner types an amount, which is then kept
 * and the difference shown. A different set of houses starts again.
 * `enabled` false (an edit that leaves rent and houses alone) asks nothing.
 */
export function useRentSplit(rent: number, houses: RentSplitHouse[], enabled = true): RentSplit {
  const sorted = [...houses].sort((a, b) => a.unitCode.localeCompare(b.unitCode));
  const codes = sorted.map((h) => h.unitCode);
  const houseKey = codes.join(",");
  const [state, setState] = useState<State>(() => ({
    houses: houseKey,
    rent,
    inputs: startingInputs(rent, sorted),
    typed: false,
  }));
  // Redraw during render (no effect, no flash of stale shares) for new
  // houses, or a new rent while nothing has been typed.
  let current = state;
  if (state.houses !== houseKey || (state.rent !== rent && !state.typed)) {
    current = { houses: houseKey, rent, inputs: startingInputs(rent, sorted), typed: false };
    setState(current);
  } else if (state.rent !== rent) {
    current = { ...state, rent };
    setState(current);
  }

  const needed = enabled && rent > 0 && sorted.length >= 2;
  const split = codes.map((unitCode) => ({ unitCode, share: Number(current.inputs[unitCode]) || 0 }));
  return {
    needed,
    houses: sorted,
    rent,
    inputs: current.inputs,
    setShare: (unitCode, value) =>
      setState((s) => ({ ...s, inputs: { ...s.inputs, [unitCode]: value }, typed: true })),
    splitEqually: () =>
      setState((s) => ({
        ...s,
        inputs: Object.fromEntries(splitEqually(rent, codes).map((x) => [x.unitCode, String(x.share)])),
        typed: true,
      })),
    problem: needed ? rentSplitProblem(rent, codes, split) : null,
    houseRents: needed ? split : undefined,
  };
}
