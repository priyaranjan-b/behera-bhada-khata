// Pure and client-safe: the Houses page's "Show" filter. Shared by the
// server page (reads ?show=) and the client table, so it can't live in the
// "use client" grid file.

export type HouseFilter = "all" | "vacant" | "occupied" | "retired";

export const HOUSE_FILTERS: { value: HouseFilter; label: string }[] = [
  { value: "all", label: "All houses" },
  { value: "vacant", label: "Vacant" },
  { value: "occupied", label: "Occupied" },
  { value: "retired", label: "Retired" },
];

/** `?show=` from the URL; anything unknown shows every house. */
export function parseHouseFilter(value: string | null | undefined): HouseFilter {
  return HOUSE_FILTERS.find((f) => f.value === value)?.value ?? "all";
}

/** Vacant = in use with nobody in it today; the dashboard's "Vacant houses" card counts the same. */
export function isVacant(house: { isActive: boolean; occupied: boolean }): boolean {
  return house.isActive && !house.occupied;
}

export function matchesHouseFilter(house: { isActive: boolean; occupied: boolean }, filter: HouseFilter): boolean {
  switch (filter) {
    case "vacant":
      return isVacant(house);
    case "occupied":
      return house.occupied;
    case "retired":
      return !house.isActive;
    default:
      return true;
  }
}
