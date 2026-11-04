import Stack from "@mui/material/Stack";
import { serverApi } from "@/lib/api-client/server";
import { PageHeader } from "@/components/ui/DataDisplay";
import MaintenanceForm from "@/components/domain/MaintenanceForm";

export default async function NewMaintenancePage({ searchParams }: { searchParams: Promise<{ fromPayment?: string }> }) {
  const { fromPayment } = await searchParams;
  const { houses, tagSuggestions, prefill } = await serverApi.dashboard.maintenance.newForm({ fromPayment });
  return (
    <Stack spacing={2}>
      <PageHeader
        title="Record maintenance"
        subtitle="Money spent on one house, or on several with the cost split equally."
      />
      <MaintenanceForm houses={houses} tagSuggestions={tagSuggestions} prefill={prefill ?? undefined} />
    </Stack>
  );
}
