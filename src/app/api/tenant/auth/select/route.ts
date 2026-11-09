import { publicRoute, readJson } from "@/server/http";
import { listTenancies, selectTenancy } from "@/server/services/tenantAuth";

// /tenant/select: the tenancies the signed-in phone may open, and choosing one (A32)
export const GET = publicRoute(async () => listTenancies());
export const POST = publicRoute(async (request) => selectTenancy(await readJson(request)));
