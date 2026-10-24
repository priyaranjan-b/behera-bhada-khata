import Stack from "@mui/material/Stack";
import { serverApi } from "@/lib/api-client/server";
import { PageHeader } from "@/components/ui/DataDisplay";
import UnitForm from "@/components/domain/UnitForm";

export default async function AddHousePage() {
  const { towers } = await serverApi.dashboard.houses.newForm();

  return (
    <Stack spacing={2}>
      <PageHeader title="Add house" subtitle="Choose the tower; the house code is the tower code plus the house number." />
      <UnitForm towers={towers} />
    </Stack>
  );
}
