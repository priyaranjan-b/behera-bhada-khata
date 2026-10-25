import Stack from "@mui/material/Stack";
import { serverApi } from "@/lib/api-client/server";
import { formatMoney } from "@/lib/money";
import { PageHeader } from "@/components/ui/DataDisplay";
import AdjustmentForm from "./AdjustmentForm";

export default async function AdjustPaymentPage({
  params,
}: {
  params: Promise<{ paymentId: string }>;
}) {
  const { paymentId } = await params;
  // 404s unless it's one of the owner's confirmed payments.
  const payment = await serverApi.dashboard.payments.adjust(paymentId);

  return (
    <Stack spacing={2}>
      <PageHeader
        title="Adjust payment"
        subtitle={`${payment.tenantName ? `${payment.tenantName} · ` : ""}${formatMoney(payment.amount)} on ${payment.paymentDate}`}
      />
      <AdjustmentForm
        paymentId={paymentId}
        periods={payment.periods}
        tenantId={payment.tenantId}
        originalAmount={payment.amount}
        savedSignature={payment.savedSignature}
        tenantMessaging={payment.tenantMessaging}
      />
    </Stack>
  );
}
