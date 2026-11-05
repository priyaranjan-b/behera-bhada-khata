import Stack from "@mui/material/Stack";
import { serverApi } from "@/lib/api-client/server";
import { formatMonth } from "@/lib/dates";
import { AGING_BAND_TONE } from "@/lib/domain/reports";
import { formatMoney } from "@/lib/money";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import StatCard from "@/components/ui/StatCard";
import { PageHeader } from "@/components/ui/DataDisplay";
import DefaultersList from "./DefaultersList";
import StatCardRow from "@/components/ui/StatCardRow";
import { DEFAULTER_STAT_COLUMNS } from "./defaulterStatColumns";

const tenants = (n: number) => `${n} tenant${n === 1 ? "" : "s"}`;

export default async function DefaultersPage() {
  const report = await serverApi.dashboard.defaulters();

  return (
    <Stack spacing={2}>
      <PageHeader
        title="Defaulters"
        subtitle={`${formatMoney(report.totalOutstanding)} unpaid up to the end of ${formatMonth(report.asOfMonth)}, from ${tenants(report.rows.length)}. Most months behind first.`}
      />

      <StatCardRow columns={DEFAULTER_STAT_COLUMNS} label="Arrears by age">
        {report.groups.map((group) => (
          <StatCard
            key={group.key}
            title={`${group.label} behind`}
            icon={<ScheduleRoundedIcon />}
            value={formatMoney(group.outstanding)}
            caption={tenants(group.tenantCount)}
            badge={
              group.tenantCount > 0
                ? { label: "Follow up", tone: AGING_BAND_TONE[group.key] }
                : { label: "None", tone: "success" }
            }
          />
        ))}
      </StatCardRow>

      <DefaultersList rows={report.rows} />
    </Stack>
  );
}
