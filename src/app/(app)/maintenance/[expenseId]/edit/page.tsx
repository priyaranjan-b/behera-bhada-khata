import Stack from "@mui/material/Stack";
import { serverApi } from "@/lib/api-client/server";
import { PageHeader } from "@/components/ui/DataDisplay";
import MaintenanceForm from "@/components/domain/MaintenanceForm";

export default async function EditMaintenancePage({ params }: { params: Promise<{ expenseId: string }> }) {
  const { expenseId } = await params;
  const form = serverApi.dashboard.maintenance.newForm();
  const expense = await serverApi.dashboard.maintenance.detail(expenseId);
  const { houses, tagSuggestions } = await form;
  return (
    <Stack spacing={2}>
      <PageHeader title={`Edit: ${expense.description}`} subtitle="Changing the amount or the houses redoes the split." />
      <MaintenanceForm houses={houses} tagSuggestions={tagSuggestions} expense={expense} />
    </Stack>
  );
}
