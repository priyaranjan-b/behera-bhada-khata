import Stack from "@mui/material/Stack";
import { serverApi } from "@/lib/api-client/server";
import { PageHeader } from "@/components/DataComponents";
import TenantSearchList from "./TenantSearchList";

export default async function TenantsIndexPage() {
  const rows = await serverApi.dashboard.tenants.list();

  return (
    <Stack spacing={2}>
      <PageHeader title="Tenants" subtitle="Search and sort across every property." />
      <TenantSearchList rows={rows} />
    </Stack>
  );
}
