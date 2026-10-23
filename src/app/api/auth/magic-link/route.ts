import { publicRoute, readJson, requestMeta } from "@/server/http";
import { getLoginOptions, requestMagicLink } from "@/server/services/auth";

// Page: /login
export const GET = publicRoute(async () => getLoginOptions());
export const POST = publicRoute(async (request) => requestMagicLink(await readJson(request), requestMeta(request)));
