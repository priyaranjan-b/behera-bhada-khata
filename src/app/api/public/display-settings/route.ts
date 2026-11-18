import { publicRoute, requestMeta } from "@/server/http";
import { getPublicDisplaySettings } from "@/server/services/displaySettings";

// How the UI shows dates (A36), for pages without a session (/tenant/select, a confirm link); rate limited per client
export const GET = publicRoute(async (request) => getPublicDisplaySettings(requestMeta(request)));
