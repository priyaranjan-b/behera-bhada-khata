import { ownerRoute, readQuery } from "@/server/http";
import { listActivity } from "@/server/services/audit";

// Page: /dashboard/activity (?category=&from=&to=&before=)
export const GET = ownerRoute((ctx, request) => listActivity(ctx, readQuery(request)));
