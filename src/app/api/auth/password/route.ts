import { publicRoute, readJson, requestMeta } from "@/server/http";
import { signInWithPassword } from "@/server/services/auth";

// POST from /login (Password tab)
export const POST = publicRoute(async (request) => signInWithPassword(await readJson(request), requestMeta(request)));
