import { publicRoute, readJson } from "@/server/http";
import { requestMagicLink } from "@/server/services/auth";

export const POST = publicRoute(async (request) => requestMagicLink(await readJson(request)));
