import Stack from "@mui/material/Stack";
import { serverApi } from "@/lib/api-client/server";
import { PageHeader } from "@/components/ui/DataDisplay";
import TenantSearchList from "./TenantSearchList";

export default async function TenantsIndexPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { show } = await searchParams;
  const rows = await serverApi.dashboard.tenants.list();

  return (
    <Stack spacing={2}>
      <PageHeader title="Tenants" subtitle="Search and sort across every property." />
      {/* key: a new ?show= (e.g. from a dashboard card) resets the filter. */}
      <TenantSearchList key={show ?? ""} rows={rows} initialStatus={show} />
    </Stack>
  );
}
