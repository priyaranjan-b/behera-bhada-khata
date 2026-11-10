"use client";

import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { DateField, FileAttachmentsField, FormActions, SectionCard, SummaryLine } from "@/components/ui";
import { useAppRouter } from "@/components/ui/Loading";
import HousePicker from "@/components/domain/HousePicker";
import TagsField from "@/components/domain/TagsField";
import { api, errorMessage } from "@/lib/api-client";
import type { MaintenanceDetail, MaintenanceHouseOption, MaintenancePrefill } from "@/lib/contracts";
import { formatDateKey, todayKey } from "@/lib/dates";
import { splitEqually } from "@/lib/domain/houses";
import { MAINTENANCE_CATEGORY_OPTIONS } from "@/lib/domain/maintenance";
import { recentDayPicks } from "@/lib/domain/payments";
import { formatMoney } from "@/lib/money";
import { prepareProofFile } from "@/lib/proofImages";
import { FLASH, routes } from "@/lib/routes";
import type { MaintenanceCategory } from "@/lib/types";
import { MAINTENANCE_FILE_LIMITS, MAINTENANCE_LIMITS } from "@/lib/validation";

/**
 * Records a maintenance expense (0031, D35) on one or more houses, split
 * equally (the preview is splitEqually, the database's own rule), with who
 * paid and its receipts; or edits one (`expense`): every field and the
 * houses. Who paid and files change on the expense's page.
 */
export default function MaintenanceForm({
  houses,
  tagSuggestions,
  expense,
  prefill,
}: {
  /** Every house in use, by tower. */
  houses: MaintenanceHouseOption[];
  tagSuggestions: string[];
  /** Edit mode. */
  expense?: MaintenanceDetail;
  /** A new expense started from a set-off payment (A22). */
  prefill?: MaintenancePrefill;
}) {
  const router = useAppRouter();
  // An edited expense may cover a house since retired: keep it choosable.
  const options = useMemo(() => {
    const extra = (expense?.houses ?? []).filter((h) => !houses.some((o) => o.unitCode === h.unitCode));
    return [...houses, ...extra];
  }, [houses, expense]);
  const [chosen, setChosen] = useState<MaintenanceHouseOption[]>(
    options.filter((o) => expense?.houses.some((h) => h.unitCode === o.unitCode))
  );
  const start = expense ?? prefill;
  const [amount, setAmount] = useState(start ? String(start.amount) : "");
  // No default, as on Record payment: back entries kept getting saved as today.
  const [expenseDate, setExpenseDate] = useState(start?.expenseDate ?? "");
  const [category, setCategory] = useState<MaintenanceCategory | "">(expense?.category ?? "");
  const [description, setDescription] = useState(start?.description ?? "");
  const [vendor, setVendor] = useState(start?.vendor ?? "");
  const [note, setNote] = useState(start?.note ?? "");
  const [tags, setTags] = useState<string[]>(prefill?.tags ?? []);
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountNumber = Number(amount) || 0;
  const shares = splitEqually(
    amountNumber,
    chosen.map((h) => h.unitCode)
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (chosen.length === 0) {
      setError("Choose at least one house");
      return;
    }
    if (!category) {
      setError("Choose a category");
      return;
    }
    const fields = {
      expenseDate,
      amount: amountNumber,
      category,
      description,
      vendor: vendor || undefined,
      note: note || undefined,
      unitCodes: chosen.map((h) => h.unitCode),
    };
    setSubmitting(true);
    try {
      if (expense) {
        await api.dashboard.maintenance.update(expense.id, fields);
        router.push(routes.maintenance.detail(expense.id, { [FLASH.maintenanceSaved]: "1" }));
      } else {
        const { id } = await api.dashboard.maintenance.create(
          { ...fields, tags, settledByPaymentId: prefill?.paymentId },
          files
        );
        router.push(routes.maintenance.detail(id, { [FLASH.maintenanceSaved]: "1" }));
      }
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Couldn't save that expense."));
      setSubmitting(false);
    }
  }

  return (
    <Box component="form" onSubmit={handleSubmit}>
      <Grid container spacing={2} columns={12}>
        <Grid size={{ xs: 12, md: 7 }}>
          <Stack spacing={2}>
            <SectionCard title="Expense">
              <TextField
                label="Amount spent"
                type="number"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                slotProps={{ htmlInput: { step: "0.01", min: 0 } }}
                fullWidth
              />
              <DateField
                label="Date spent"
                required
                value={expenseDate}
                onChange={setExpenseDate}
                max={todayKey()}
                quickPicks={recentDayPicks()}
                fullWidth
              />
              <TextField
                label="Category"
                select
                required
                value={category}
                onChange={(e) => setCategory(e.target.value as MaintenanceCategory)}
                fullWidth
              >
                {MAINTENANCE_CATEGORY_OPTIONS.map((o) => (
                  <MenuItem key={o.value} value={o.value}>
                    {o.label}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="What for"
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Kitchen tap replaced"
                slotProps={{ htmlInput: { maxLength: MAINTENANCE_LIMITS.descriptionMax } }}
                fullWidth
              />
              <HousePicker
                options={options}
                value={chosen}
                onChange={setChosen}
                caption={(h) => h.label ?? ""}
                wholeTowers
                required
                disabled={submitting}
                helperText={
                  chosen.length > 1
                    ? `Split equally over ${chosen.length} houses`
                    : "One house, or several to split the cost equally"
                }
              />
              <TextField
                label="Paid to (optional)"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                placeholder="Plumber, society, municipality…"
                slotProps={{ htmlInput: { maxLength: MAINTENANCE_LIMITS.vendorMax } }}
                fullWidth
              />
              {expense ? null : (
                <TagsField
                  value={tags}
                  onChange={setTags}
                  suggestions={tagSuggestions}
                  disabled={submitting}
                  label="Paid by (optional)"
                  helperText="Who paid it - pick one or type a new name"
                />
              )}
              <TextField
                label="Note (optional)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                multiline
                minRows={2}
                slotProps={{ htmlInput: { maxLength: MAINTENANCE_LIMITS.noteMax } }}
                fullWidth
              />
            </SectionCard>

            {expense ? null : (
              <FileAttachmentsField
                title="Receipts (optional)"
                caption="Bills, invoices, photos of the work - kept with this expense."
                files={files}
                onChange={setFiles}
                accept={MAINTENANCE_FILE_LIMITS.accept}
                maxFiles={MAINTENANCE_FILE_LIMITS.maxFiles}
                maxTotalBytes={MAINTENANCE_FILE_LIMITS.maxTotalBytes}
                prepare={prepareProofFile}
                disabled={submitting}
              />
            )}
          </Stack>
        </Grid>

        <Grid size={{ xs: 12, md: 5 }}>
          <SectionCard title="Split" sticky>
            {shares.length === 0 ? (
              <Typography variant="body2" color="textSecondary">
                Choose the houses to see each one&apos;s share.
              </Typography>
            ) : (
              <Stack spacing={1}>
                {shares.map((s) => (
                  <SummaryLine key={s.unitCode} label={s.unitCode} value={formatMoney(s.share)} />
                ))}
              </Stack>
            )}
            <Divider />
            <SummaryLine label="Total" value={formatMoney(amountNumber)} emphasis="strong" />
          </SectionCard>
        </Grid>

        <Grid size={12}>
          <FormActions
            error={error}
            cancelHref={expense ? routes.maintenance.detail(expense.id) : routes.maintenance.list()}
            submitLabel={
              expense ? "Save changes" : expenseDate ? `Save expense · ${formatDateKey(expenseDate)}` : "Save expense"
            }
            pendingLabel="Saving…"
            pending={submitting}
          />
        </Grid>
      </Grid>
    </Box>
  );
}
