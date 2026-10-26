import type { GridFilterModel, GridPaginationModel, GridSortModel } from "@mui/x-data-grid";
import { getGridStringOperators, type GridFilterOperator } from "@mui/x-data-grid";
import { activeFilters, GRID_TEXT_OPERATORS, type GridFilter, type GridQueryParams } from "@/lib/domain/gridQuery";

// A DataTable with paginationMode="server" (A14): its MUI models as the query
// params the server reads (gridQuerySchema in src/lib/validation.ts).

/** The text filter operators the server understands, for a server-side column's `filterOperators`. */
export const SERVER_TEXT_OPERATORS: GridFilterOperator[] = getGridStringOperators().filter((op) =>
  (GRID_TEXT_OPERATORS as readonly string[]).includes(op.value)
);

export function toGridQueryParams(
  pagination: GridPaginationModel,
  sort: GridSortModel,
  filter: GridFilterModel
): GridQueryParams {
  const [sorted] = sort;
  const q = (filter.quickFilterValues ?? []).map(String).join(" ").trim();
  const filters = activeFilters(
    filter.items.map(
      (item): GridFilter => ({
        field: item.field,
        operator: item.operator as GridFilter["operator"],
        value: item.value == null ? undefined : String(item.value),
      })
    )
  );
  return {
    page: pagination.page,
    pageSize: pagination.pageSize,
    sort: sorted?.sort ? sorted.field : undefined,
    dir: sorted?.sort ?? undefined,
    q: q || undefined,
    filters: filters.length > 0 ? JSON.stringify(filters) : undefined,
    logic: filters.length > 1 && filter.logicOperator === "or" ? "or" : undefined,
  };
}
