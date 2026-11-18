import Stack from "@mui/material/Stack";
import { serverApi } from "@/lib/api-client/server";
import { PageHeader } from "@/components/ui/DataDisplay";
import RecordPaymentPicker from "./RecordPaymentPicker";

/** Quick add → Record payment (A37): pick the tenant, then their Record payment form. */
export default async function RecordPaymentPage() {
  const index = await serverApi.dashboard.search();

  return (
    <Stack spacing={2}>
      <PageHeader title="Record payment" subtitle="Choose the tenant who paid." />
      <RecordPaymentPicker index={index} />
    </Stack>
  );
}
