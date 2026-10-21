import { notFound } from "next/navigation";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { createClient } from "@/lib/supabase/server";
import { ensureRentPeriods } from "@/lib/periods";
import { tenantDisplayName } from "@/lib/tenant";
import PaymentForm from "./PaymentForm";

export default async function NewPaymentPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const supabase = await createClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, name, business_name")
    .eq("id", tenantId)
    .single();
  if (!tenant) notFound();

  await ensureRentPeriods(tenantId);

  const { data: periods } = await supabase
    .from("rent_periods")
    .select("id, period_month, amount_due, amount_allocated")
    .eq("tenant_id", tenantId)
    .order("period_month", { ascending: true });

  const pendingPeriods = (periods ?? []).filter(
    (p) => Number(p.amount_due) > Number(p.amount_allocated)
  );

  return (
    <Stack spacing={3}>
      <Typography variant="h5" sx={{ fontWeight: 700 }}>
        Record payment · {tenantDisplayName(tenant)}
      </Typography>
      <PaymentForm tenantId={tenantId} periods={pendingPeriods} />
    </Stack>
  );
}
