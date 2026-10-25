import { ownerRoute, readQuery } from "@/server/http";
import { unitHistory } from "@/server/services/audit";

type Params = { unitCode: string };

// The house History dialog on /dashboard/houses and tower pages (?before=)
export const GET = ownerRoute<Params>((ctx, request, { unitCode }) => unitHistory(ctx, unitCode, readQuery(request)));
