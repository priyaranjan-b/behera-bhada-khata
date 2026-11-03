import { ownerRoute } from "@/server/http";
import { getPaymentTagSuggestions } from "@/server/services/paymentTags";

// Page: /payments - the tag names the tag editor offers
export const GET = ownerRoute((ctx) => getPaymentTagSuggestions(ctx));
