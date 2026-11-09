import { publicRoute, readJson, requestMeta } from "@/server/http";
import { verifyTenantOtp } from "@/server/services/tenantAuth";

// POST from /tenant/login: check the code and start the tenant session (A32)
export const POST = publicRoute(async (request) => verifyTenantOtp(await readJson(request), requestMeta(request)));
