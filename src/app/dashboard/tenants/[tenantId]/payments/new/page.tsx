import Stack from "@mui/material/Stack";
import { serverApi } from "@/lib/api-client/server";
import { PageHeader } from "@/components/ui/DataDisplay";
import PaymentForm from "./PaymentForm";

export default async function NewPaymentPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const { tenantName, openPeriods, savedSignature, tenantMessaging } = await serverApi.dashboard.tenants.newPayment(tenantId);

  return (
    <Stack spacing={2}>
      <PageHeader
        title="Record payment"
        subtitle={`${tenantName} · counts as soon as you save; the tenant can acknowledge it later.`}
      />
      <PaymentForm tenantId={tenantId} periods={openPeriods} savedSignature={savedSignature}
        tenantMessaging={tenantMessaging} />
    </Stack>
  );
}
