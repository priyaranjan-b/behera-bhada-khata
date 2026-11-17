import type { CorrectionPinView } from "@/lib/contracts";
import CorrectionPinCard from "../CorrectionPinCard";

/** Profile: the corrections PIN card, once its status loads (on its own, so Profile works without it). */
export default async function CorrectionPinSection({ status }: { status: Promise<CorrectionPinView> }) {
  return <CorrectionPinCard status={await status} />;
}
