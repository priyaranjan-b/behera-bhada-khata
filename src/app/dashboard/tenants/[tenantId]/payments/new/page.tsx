import Stack from "@mui/material/Stack";
import { serverApi } from "@/lib/api-client/server";
import { PageHeader } from "@/components/DataComponents";
import PaymentForm from "./PaymentForm";

export default async function NewPaymentPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const { tenantName, openPeriods } = await serverApi.dashboard.tenants.newPayment(tenantId);

  return (
    <Stack spacing={2}>
      <PageHeader
        title="Record payment"
        subtitle={`${tenantName} · the tenant confirms with a signature and OTP before it counts.`}
      />
      <PaymentForm tenantId={tenantId} periods={openPeriods} />
    </Stack>
  );
}
