import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import { serverApi } from "@/lib/api-client/server";
import { formatMonth } from "@/lib/dates";
import { AGING_BAND_TONE } from "@/lib/domain/reports";
import { formatMoney } from "@/lib/money";
import StatCard from "@/components/ui/StatCard";
import { PageHeader } from "@/components/ui/DataDisplay";
import DefaultersList from "./DefaultersList";

const tenants = (n: number) => `${n} tenant${n === 1 ? "" : "s"}`;

export default async function DefaultersPage() {
  const report = await serverApi.dashboard.defaulters();

  return (
    <Stack spacing={2}>
      <PageHeader
        title="Defaulters"
        subtitle={`${formatMoney(report.totalOutstanding)} unpaid up to the end of ${formatMonth(report.asOfMonth)}, from ${tenants(report.rows.length)}. Most months behind first.`}
      />

      <Grid container spacing={2} columns={12}>
        {report.groups.map((group) => (
          <Grid key={group.key} size={{ xs: 12, sm: 6, lg: 3 }}>
            <StatCard
              title={`${group.label} behind`}
              value={formatMoney(group.outstanding)}
              caption={tenants(group.tenantCount)}
              badge={
                group.tenantCount > 0
                  ? { label: "Follow up", tone: AGING_BAND_TONE[group.key] }
                  : { label: "None", tone: "success" }
              }
            />
          </Grid>
        ))}
      </Grid>

      <DefaultersList rows={report.rows} />
    </Stack>
  );
}
