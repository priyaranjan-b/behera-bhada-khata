import { notFound } from "next/navigation";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/money";
import { tenantDisplayName } from "@/lib/tenant";
import AdjustmentForm, { type AdjustablePeriod } from "./AdjustmentForm";

export default async function AdjustPaymentPage({
  params,
}: {
  params: Promise<{ paymentId: string }>;
}) {
  const { paymentId } = await params;
  const supabase = await createClient();

  const { data: payment } = await supabase
    .from("payments")
    .select("id, tenant_id, amount, payment_date, status")
    .eq("id", paymentId)
    .single();
  if (!payment || payment.status !== "confirmed") notFound();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("name, business_name")
    .eq("id", payment.tenant_id)
    .single();
  const tenantName = tenant ? tenantDisplayName(tenant) : undefined;

  const { data: allocations } = await supabase
    .from("payment_allocations")
    .select("rent_period_id, amount_allocated")
    .eq("payment_id", paymentId);

  const rentPeriodIds = (allocations ?? []).map((a) => a.rent_period_id);
  const { data: rentPeriods } = rentPeriodIds.length
    ? await supabase.from("rent_periods").select("id, period_month").in("id", rentPeriodIds)
    : { data: [] as { id: string; period_month: string }[] };
  const periodMonthById = new Map((rentPeriods ?? []).map((p) => [p.id, p.period_month]));

  const periods: AdjustablePeriod[] = (allocations ?? []).map((a) => ({
    rentPeriodId: a.rent_period_id,
    periodMonth: periodMonthById.get(a.rent_period_id) ?? "",
    originallyAllocated: Number(a.amount_allocated),
  }));

  return (
    <Stack spacing={3}>
      <Typography variant="h5" sx={{ fontWeight: 700 }}>
        Adjust payment · {tenantName} · {formatMoney(payment.amount)} on {payment.payment_date}
      </Typography>
      <AdjustmentForm paymentId={paymentId} periods={periods} />
    </Stack>
  );
}
