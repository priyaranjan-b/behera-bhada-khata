import { publicRoute, readJson, requestMeta } from "@/server/http";
import { sendConfirmOtp } from "@/server/services/confirm";

type Params = { token: string };

export const POST = publicRoute<Params>(async (request, { token }) =>
  sendConfirmOtp(token, await readJson(request), requestMeta(request))
);
