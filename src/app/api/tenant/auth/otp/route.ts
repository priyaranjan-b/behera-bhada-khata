import { publicRoute, readJson, requestMeta } from "@/server/http";
import { sendTenantOtp } from "@/server/services/tenantAuth";

// POST from /tenant/login: text a sign-in code to the tenant's phone (A32)
export const POST = publicRoute(async (request) => sendTenantOtp(await readJson(request), requestMeta(request)));
