/**
 * Every row fits the smallest page: the pager has nothing to do. It hides then,
 * but only at the smallest size, so a bigger page size the user picked can
 * always be undone. Shared by DataTable's footer and DataTablePagination.
 */
export function fitsOnePage(rowCount: number, pageSize: number, pageSizeOptions: readonly number[]): boolean {
  return rowCount <= Math.min(pageSize, ...pageSizeOptions);
}
