import Stack from "@mui/material/Stack";
import { serverApi } from "@/lib/api-client/server";
import { PageHeader } from "@/components/ui/DataDisplay";
import MaintenanceForm from "@/components/domain/MaintenanceForm";

export default async function NewMaintenancePage() {
  const { houses, tagSuggestions } = await serverApi.dashboard.maintenance.newForm();
  return (
    <Stack spacing={2}>
      <PageHeader
        title="Record maintenance"
        subtitle="Money spent on one house, or on several with the cost split equally."
      />
      <MaintenanceForm houses={houses} tagSuggestions={tagSuggestions} />
    </Stack>
  );
}
