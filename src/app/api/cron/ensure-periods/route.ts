import { ApiError } from "@/lib/errors";
import { publicRoute } from "@/server/http";
import { ensureAllActiveTenantPeriods } from "@/server/services/periods";

// Scheduled by vercel.json. Vercel sends `Authorization: Bearer $CRON_SECRET`
// automatically for cron invocations when that env var is set.
export const GET = publicRoute(async (request) => {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    throw new ApiError(401, "Unauthorized");
  }
  return { ok: true, ...(await ensureAllActiveTenantPeriods()) };
});
