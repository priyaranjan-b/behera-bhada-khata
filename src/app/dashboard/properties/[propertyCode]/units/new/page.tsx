import Stack from "@mui/material/Stack";
import { serverApi } from "@/lib/api-client/server";
import { PageHeader } from "@/components/ui/DataDisplay";
import UnitForm from "./UnitForm";

export default async function NewUnitPage({ params }: { params: Promise<{ propertyCode: string }> }) {
  const { propertyCode } = await params;
  const property = await serverApi.dashboard.properties.newUnit(propertyCode);

  return (
    <Stack spacing={2}>
      <PageHeader title="Add house" subtitle={`${property.name} · ${property.code}`} />
      <UnitForm propertyCode={property.code} />
    </Stack>
  );
}
