import { ownerRoute, readJson } from "@/server/http";
import { setHouseRent } from "@/server/services/properties";

type Params = { unitCode: string };

// "Set rent" on /houses and the tower pages (D39)
export const PUT = ownerRoute<Params>(async (ctx, request, { unitCode }) =>
  setHouseRent(ctx, unitCode, await readJson(request))
);
