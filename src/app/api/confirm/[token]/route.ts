import { publicRoute, readJson, requestMeta } from "@/server/http";
import { confirmRecord, getConfirmView } from "@/server/services/confirm";

type Params = { token: string };

// Page: /confirm/[token] (tenant-facing; the token is the authorization)
export const GET = publicRoute<Params>((_request, { token }) => getConfirmView(token));
export const POST = publicRoute<Params>(async (request, { token }) =>
  confirmRecord(token, await readJson(request), requestMeta(request))
);
