"use client";

import SellRoundedIcon from "@mui/icons-material/SellRounded";
import ListSettingCard from "@/components/domain/ListSettingCard";
import { api } from "@/lib/api-client";
import type { PaymentTagView } from "@/lib/contracts";
import { PAYMENT_TAG_LIMITS } from "@/lib/validation";

const usedOn = (count: number) => (count === 0 ? "Not used yet" : count === 1 ? "On 1 payment" : `On ${count} payments`);
const USED_IN = ["Record payment", "Payments", "Maintenance"];

/**
 * The tags offered when recording a payment, editing its tags on Payments and
 * saying who paid a maintenance expense (0030, D34): add, rename or delete
 * them. Each record keeps its own copy of its tag names, so nothing here
 * changes one already tagged.
 */
export default function PaymentTagsCard({ tags }: { tags: PaymentTagView[] }) {
  return (
    <ListSettingCard
      title="Payment tags"
      caption="Who received or paid it. Renaming or deleting one never changes records already tagged."
      icon={<SellRoundedIcon />}
      tone="primary"
      usedIn={USED_IN}
      noun="tag"
      asPill
      items={tags.map((t) => ({ id: t.id, text: t.name, meta: usedOn(t.paymentCount) }))}
      maxItems={PAYMENT_TAG_LIMITS.maxTags}
      maxLength={PAYMENT_TAG_LIMITS.maxLength}
      emptyTitle="No tags yet"
      emptyText="Add the names of the people who collect rent or pay for repairs."
      onCreate={(name) => api.dashboard.createPaymentTag({ name })}
      onRename={(id, name) => api.dashboard.updatePaymentTag(id, { name })}
      onDelete={(id) => api.dashboard.deletePaymentTag(id)}
    />
  );
}
