import Alert from "@mui/material/Alert";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import MuiLink from "@mui/material/Link";
import { serverApi } from "@/lib/api-client/server";
import { dateKeyOf, formatDateKey, formatDateTime } from "@/lib/dates";
import { isCashExpense, maintenanceCategoryLabel } from "@/lib/domain/maintenance";
import { formatMoney } from "@/lib/money";
import { FLASH, routes, type Flash } from "@/lib/routes";
import { ActionStack, DetailList, DetailRow, SectionCard, SummaryLine } from "@/components/ui";
import { PageHeader, StatusBadge } from "@/components/ui/DataDisplay";
import FlashAlert from "@/components/ui/FlashAlert";
import Link from "@/components/ui/Link";
import { LinkButton } from "@/components/ui/Loading";
import AuditTimeline from "@/components/domain/AuditTimeline";
import MaintenanceFilesCard from "./MaintenanceFilesCard";
import PaidByCard from "./PaidByCard";
import VoidExpenseButton from "./VoidExpenseButton";

/** One maintenance expense (0031): its details, the split per house, who paid, its files and its history. */
export default async function MaintenanceExpensePage({
  params,
  searchParams,
}: {
  params: Promise<{ expenseId: string }>;
  searchParams: Promise<Flash>;
}) {
  const { expenseId } = await params;
  const suggestions = serverApi.dashboard.payments.tagSuggestions();
  const [expense, flash] = await Promise.all([serverApi.dashboard.maintenance.detail(expenseId), searchParams]);
  const voided = expense.voidedAt !== null;
  const summary = `${expense.description} · ${formatMoney(expense.amount)} on ${formatDateKey(expense.expenseDate)}`;

  return (
    <Stack spacing={2}>
      <PageHeader
        title={expense.description}
        subtitle={`${maintenanceCategoryLabel(expense.category)} · ${formatMoney(expense.amount)} on ${formatDateKey(expense.expenseDate)}`}
        action={
          voided ? undefined : (
            <ActionStack phone="primaryOnTop">
              <VoidExpenseButton expenseId={expense.id} description={expense.description} amount={expense.amount} />
              <LinkButton href={routes.maintenance.edit(expense.id)} variant="contained">
                Edit
              </LinkButton>
            </ActionStack>
          )
        }
      />
      {flash[FLASH.maintenanceSaved] ? (
        <FlashAlert param={FLASH.maintenanceSaved} severity="success">
          Expense saved.
        </FlashAlert>
      ) : null}
      {flash[FLASH.maintenanceVoided] ? (
        <FlashAlert param={FLASH.maintenanceVoided} severity="success">
          Expense voided. It no longer counts in any total.
        </FlashAlert>
      ) : null}
      {!isCashExpense(expense) && expense.settledBy ? (
        <Alert severity="info">
          Paid by a set-off against rent{expense.settledBy.receiptNo ? ` (receipt ${expense.settledBy.receiptNo})` : ""}: the
          tenant kept it back from their rent, so no cash went out.
        </Alert>
      ) : null}
      {voided ? (
        <Alert severity="info">
          Voided on {formatDateTime(expense.voidedAt!)}: {expense.voidReason}. It stays on record but counts nowhere.
        </Alert>
      ) : null}

      <Grid container spacing={2} columns={12}>
        <Grid size={{ xs: 12, md: 7 }} sx={{ minWidth: 0 }}>
          <Stack spacing={2}>
            <SectionCard title="Details" action={voided ? <StatusBadge tone="neutral" label="Voided" /> : undefined}>
              <DetailList dividers>
                <DetailRow label="Amount">{formatMoney(expense.amount)}</DetailRow>
                <DetailRow label="Spent on">{formatDateKey(expense.expenseDate)}</DetailRow>
                <DetailRow label="Category">{maintenanceCategoryLabel(expense.category)}</DetailRow>
                <DetailRow label="Paid to">{expense.vendor ?? "—"}</DetailRow>
                {expense.note ? <DetailRow label="Note">{expense.note}</DetailRow> : null}
                <DetailRow label="Recorded">{formatDateKey(dateKeyOf(expense.recordedAt))}</DetailRow>
              </DetailList>
            </SectionCard>
            <SectionCard
              title="Split"
              caption={expense.houses.length > 1 ? `Equally over ${expense.houses.length} houses` : undefined}
            >
              <Stack spacing={1}>
                {expense.houses.map((h) => (
                  <SummaryLine
                    key={h.unitCode}
                    label={`${h.unitCode} · ${h.propertyName}`}
                    value={
                      <MuiLink component={Link} href={routes.properties.detail(h.propertyCode)} aria-label={`Tower of ${h.unitCode}`}>
                        {formatMoney(h.share)}
                      </MuiLink>
                    }
                  />
                ))}
              </Stack>
              <Divider />
              <SummaryLine label="Total" value={formatMoney(expense.amount)} emphasis="strong" />
            </SectionCard>
            <SectionCard title="History">
              <AuditTimeline subject={{ kind: "maintenance", expenseId: expense.id }} />
            </SectionCard>
          </Stack>
        </Grid>
        <Grid size={{ xs: 12, md: 5 }} sx={{ minWidth: 0 }}>
          <Stack spacing={2}>
            <PaidByCard expenseId={expense.id} summary={summary} tags={expense.tags} suggestions={await suggestions} />
            <MaintenanceFilesCard expenseId={expense.id} files={expense.files} />
          </Stack>
        </Grid>
      </Grid>
    </Stack>
  );
}
