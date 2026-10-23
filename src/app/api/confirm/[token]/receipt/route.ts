import { publicRoute, redirectTo } from "@/server/http";
import { confirmReceiptUrl } from "@/server/services/confirm";

type Params = { token: string };

// Opened as a link: redirects to a short-lived signed PDF URL.
export const GET = publicRoute<Params>(async (request, { token }) =>
  redirectTo(await confirmReceiptUrl(token, new URL(request.url).searchParams.get("recordType")))
);
