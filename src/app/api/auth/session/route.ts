import { ownerRoute, publicRoute, readJson } from "@/server/http";
import { getSession, setSessionFromTokens } from "@/server/services/auth";

// GET  -> the signed-in owner (401 if none). Used by the dashboard layout.
// POST -> finish an implicit-flow sign-in from the /auth/callback page.
export const GET = ownerRoute(() => getSession());
export const POST = publicRoute(async (request) => setSessionFromTokens(await readJson(request)));
