import "server-only";
import { rentSplitProblem, splitEqually, type HouseShare } from "@/lib/domain/houses";
import { ApiError } from "@/lib/errors";
import { round2 } from "@/lib/money";
import type { HouseRent } from "@/server/ports";

// House rents (D39): what each house goes for, kept when it is vacant so the
// next tenant can be priced. Set whenever a tenant's rent is set; billing
// never reads them.

/**
 * The houses' rents for a tenant's `rent` over `unitCodes`: one house takes
 * the whole rent; several need the owner's `split`, one share per house
 * adding up to the rent (else 400). No rent or no houses sets nothing.
 */
export function houseRentsFor(
  rent: number | null | undefined,
  unitCodes: readonly string[],
  split: readonly HouseShare[] | undefined
): HouseRent[] {
  if (!rent || rent <= 0 || unitCodes.length === 0) return [];
  if (unitCodes.length === 1) return [{ unit_code: unitCodes[0], base_rent: round2(rent) }];
  if (!split) throw new ApiError(400, "Split the rent between the tenant's houses.");
  const problem = rentSplitProblem(rent, unitCodes, split);
  if (problem) throw new ApiError(400, problem);
  return split.map((s) => ({ unit_code: s.unitCode, base_rent: round2(s.share) }));
}

/** Bulk upload asks nothing: several houses get the rent split equally unless the row gives a split. */
export function houseRentsOrEqual(
  rent: number | null | undefined,
  unitCodes: readonly string[],
  split: readonly HouseShare[] | undefined
): HouseRent[] {
  return houseRentsFor(rent, unitCodes, split ?? (rent ? splitEqually(rent, unitCodes) : undefined));
}
