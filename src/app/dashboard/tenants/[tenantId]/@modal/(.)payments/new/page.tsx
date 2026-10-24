import { serverApi } from "@/lib/api-client/server";
import { RouteModal } from "@/components/ui/RouteModal";
import PaymentForm from "../../../payments/new/PaymentForm";

// Intercepts /dashboard/tenants/[tenantId]/payments/new when opened from the
// tenant page; the full page is ../../../payments/new/page.tsx.
export default async function NewPaymentModal({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const { tenantName, openPeriods, savedSignature } = await serverApi.dashboard.tenants.newPayment(tenantId);

  return (
    <RouteModal
      title="Record payment"
      subtitle={`${tenantName} · counts as soon as you save; the tenant can acknowledge it later.`}
    >
      <PaymentForm tenantId={tenantId} periods={openPeriods} savedSignature={savedSignature} inDialog />
    </RouteModal>
  );
}
