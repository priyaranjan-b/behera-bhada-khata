import { cronRoute } from "@/server/http";
import { runDailyUpkeep } from "@/server/services/periods";

// Scheduled by vercel.json. Vercel sends `Authorization: Bearer $CRON_SECRET`
// automatically for cron invocations when that env var is set.
export const GET = cronRoute(runDailyUpkeep);
