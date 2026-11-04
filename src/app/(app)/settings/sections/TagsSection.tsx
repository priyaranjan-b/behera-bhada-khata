import type { PaymentTagView } from "@/lib/contracts";
import PaymentTagsCard from "../PaymentTagsCard";

/** Settings: the payment tags list, streamed on its own call (A12). */
export default async function TagsSection({ tags }: { tags: Promise<PaymentTagView[]> }) {
  return <PaymentTagsCard tags={await tags} />;
}
