import Stack from "@mui/material/Stack";
import { serverApi } from "@/lib/api-client/server";
import { PageHeader } from "@/components/ui/DataDisplay";
import PropertyForm from "./PropertyForm";

export default async function NewPropertyPage() {
  const { locations } = await serverApi.dashboard.properties.newForm();
  return (
    <Stack spacing={2}>
      <PageHeader title="Add tower" subtitle="A building at one of your sites. Its code can't be changed later." />
      <PropertyForm locations={locations} />
    </Stack>
  );
}
