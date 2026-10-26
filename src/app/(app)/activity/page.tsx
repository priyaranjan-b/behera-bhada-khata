import Stack from "@mui/material/Stack";
import { serverApi } from "@/lib/api-client/server";
import { PageHeader } from "@/components/ui/DataDisplay";
import AuditHistoryTable from "@/components/domain/AuditHistoryTable";

export default async function ActivityPage() {
  const initial = await serverApi.dashboard.activity();

  return (
    <Stack spacing={2}>
      <PageHeader
        title="Activity"
        subtitle="Every change to tenants, rent, houses and payments, with who made it and when. History can't be edited."
      />
      <AuditHistoryTable
        source={{ kind: "all" }}
        initial={initial}
        title="Activity"
        subtitle="Who changed what, and when"
        emptyDescription="Every change to tenants, rent, houses and payments shows up here from now on."
      />
    </Stack>
  );
}
