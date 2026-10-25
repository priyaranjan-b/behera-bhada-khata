import Stack from "@mui/material/Stack";
import { serverApi } from "@/lib/api-client/server";
import { PageHeader } from "@/components/ui/DataDisplay";
import ActivityList from "./ActivityList";

export default async function ActivityPage() {
  const initial = await serverApi.dashboard.activity();

  return (
    <Stack spacing={2}>
      <PageHeader
        title="Activity"
        subtitle="Every change to tenants, rent, houses and payments, with who made it and when. History can't be edited."
      />
      <ActivityList initial={initial} />
    </Stack>
  );
}
