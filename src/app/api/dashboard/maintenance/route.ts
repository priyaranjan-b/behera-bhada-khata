import { ownerRoute, readJsonWithFiles, readQuery } from "@/server/http";
import { createMaintenanceExpense, getMaintenancePage } from "@/server/services/maintenance";

// Page: /maintenance (?from=yyyy-MM-dd&to=yyyy-MM-dd + the grid's page, sort, search, filters) - the table and its cards
export const GET = ownerRoute((ctx, request) => getMaintenancePage(ctx, readQuery(request)));

// POST from /maintenance/new: multipart `payload` (the expense) + `files` (receipts), or plain JSON
export const POST = ownerRoute(async (ctx, request) => {
  const { body, files } = await readJsonWithFiles(request, "files");
  return createMaintenanceExpense(ctx, body, files);
});
