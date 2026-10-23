"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Grid from "@mui/material/Grid";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { FormActions, SectionCard } from "@/components/ui";
import TenantDocumentsCard, { type PendingDocument } from "@/components/domain/TenantDocumentsCard";
import { api, errorMessage } from "@/lib/api-client";
import type { AvailableUnit, EditTenantForm, TenantDocumentView } from "@/lib/contracts";
import { addMonthsToKey, currentMonthKey, formatMonth, monthKeyOf, todayKey } from "@/lib/dates";
import { formatFloor } from "@/lib/domain/tenant";
import { formatMoney } from "@/lib/money";
import type { PreferredChannel } from "@/lib/types";

type Mode =
  | { kind: "create"; propertyCode: string }
  | { kind: "edit"; tenant: EditTenantForm["tenant"] };

function unitCaption(u: AvailableUnit): string {
  return [u.unitType === "commercial" ? "Commercial" : "Residential", u.label, formatFloor(u.floor)]
    .filter(Boolean)
    .join(" · ");
}

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}

/**
 * Onboards a tenant onto one or more houses at one combined monthly rent, or
 * edits one. Billing is per tenant, so the rent covers every chosen house.
 */
export default function TenantForm({
  mode,
  availableUnits,
  documents,
}: {
  mode: Mode;
  availableUnits: AvailableUnit[];
  /** Edit mode: the tenant's saved documents; new ones added here upload on Save (0011). */
  documents?: TenantDocumentView[];
}) {
  const router = useRouter();
  const editing = mode.kind === "edit" ? mode.tenant : null;
  const movedOut = editing?.status === "inactive";
  // From the paper register: details may still be missing, nothing billed yet.
  const draft = editing?.status === "draft";
  const homeTower = mode.kind === "create" ? mode.propertyCode : null;

  // Options grouped by tower, the tower the form was opened from first.
  const options = useMemo(
    () =>
      [...availableUnits].sort(
        (a, b) =>
          Number(b.propertyCode === homeTower) - Number(a.propertyCode === homeTower) ||
          a.unitCode.localeCompare(b.unitCode)
      ),
    [availableUnits, homeTower]
  );

  const initialCodes = editing?.unitCodes ?? [];
  const [units, setUnits] = useState<AvailableUnit[]>(options.filter((u) => initialCodes.includes(u.unitCode)));
  const [name, setName] = useState(editing?.name ?? "");
  const [businessName, setBusinessName] = useState(editing?.businessName ?? "");
  const [phone, setPhone] = useState(editing?.phone ?? "");
  const [preferredChannel, setPreferredChannel] = useState<PreferredChannel>(editing?.preferredChannel ?? "both");
  const [monthlyRent, setMonthlyRent] = useState(editing && editing.monthlyRent > 0 ? String(editing.monthlyRent) : "");
  const [leaseStart, setLeaseStart] = useState(editing?.leaseStart ?? "");
  // Rent settled outside the app (paper register) up to this month, yyyy-MM.
  // Drafts default to last month so billing starts this month; new tenants to
  // blank (billed from the lease month).
  const [paidThrough, setPaidThrough] = useState(draft ? addMonthsToKey(currentMonthKey(), -1).slice(0, 7) : "");
  const [deposit, setDeposit] = useState(editing?.depositAmount ? String(editing.depositAmount) : "");
  // Set when onboarding or while a draft; frozen once the tenant is active.
  const depositEditable = mode.kind === "create" || draft;
  const [unitsEffective, setUnitsEffective] = useState(todayKey());
  const [rentEffectiveMonth, setRentEffectiveMonth] = useState(addMonthsToKey(currentMonthKey(), 1).slice(0, 7));
  const [submitting, setSubmitting] = useState(false);
  const [pendingDocuments, setPendingDocuments] = useState<PendingDocument[]>([]);
  const [error, setError] = useState<string | null>(null);

  const unitCodes = units.map((u) => u.unitCode);
  const hasCommercial = units.some((u) => u.unitType === "commercial") || Boolean(editing?.businessName);
  // A draft's houses and rent aren't billed yet, so they change without effective dates.
  const unitsChanged = editing && !draft ? !sameSet(unitCodes, initialCodes) : false;
  const rentChanged = editing && !draft ? Number(monthlyRent) !== editing.monthlyRent : false;
  const draftComplete = draft && Boolean(phone.trim() && monthlyRent && leaseStart);
  const settingUpBilling = mode.kind === "create" || draft;

  // Same rule as billing_start_for() in 0008: the month after "paid up to",
  // never before the lease month.
  const billingStart = (() => {
    if (!settingUpBilling || !leaseStart) return null;
    const leaseMonth = monthKeyOf(leaseStart);
    if (!paidThrough) return leaseMonth;
    const afterPaid = addMonthsToKey(`${paidThrough}-01`, 1);
    return afterPaid > leaseMonth ? afterPaid : leaseMonth;
  })();
  // Months already due the moment this is saved (billing start .. this month).
  const monthsDueNow = (() => {
    if (!billingStart) return 0;
    let n = 0;
    for (let m = billingStart; m <= currentMonthKey() && n < 1200; m = addMonthsToKey(m, 1)) n++;
    return n;
  })();
  const cancelHref = editing ? `/dashboard/tenants/${editing.id}` : `/dashboard/properties/${homeTower}`;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (unitCodes.length === 0) {
      setError("Choose at least one house");
      return;
    }
    // Every new document needs its own type (one to one), checked before anything is saved.
    if (pendingDocuments.some((d) => !d.documentType.trim())) {
      setError("Choose or type a document type for each new document");
      return;
    }
    setSubmitting(true);
    if (draft && Boolean(monthlyRent) !== Boolean(leaseStart)) {
      setError("Enter the monthly rent and lease start together (with the phone) to start billing");
      setSubmitting(false);
      return;
    }
    const contact = {
      name,
      businessName: hasCommercial ? businessName || undefined : undefined,
      phone: phone.trim(),
      preferredChannel,
      unitCodes,
      monthlyRentAmount: Number(monthlyRent),
    };
    try {
      if (mode.kind === "edit") {
        await api.dashboard.tenants.update(mode.tenant.id, {
          ...contact,
          phone: contact.phone || undefined,
          monthlyRentAmount: monthlyRent ? Number(monthlyRent) : undefined,
          unitsEffective: unitsChanged ? unitsEffective : undefined,
          rentEffectiveMonth: rentChanged ? `${rentEffectiveMonth}-01` : undefined,
          leaseStart: draft && leaseStart ? leaseStart : undefined,
          paidThrough: draft && paidThrough ? `${paidThrough}-01` : undefined,
          // Only a draft's deposit can change; leave it out otherwise.
          depositAmount: draft && deposit ? Number(deposit) : undefined,
        });
        if (pendingDocuments.length > 0) {
          try {
            await api.dashboard.tenants.uploadDocuments(
              mode.tenant.id,
              { documentTypes: pendingDocuments.map((d) => d.documentType.trim()) },
              pendingDocuments.map((d) => d.file)
            );
          } catch (err) {
            // The tenant's changes are saved; keep the files here so Save can retry them.
            setError(`Tenant saved, but the documents weren't uploaded: ${errorMessage(err, "please try again")}`);
            setSubmitting(false);
            router.refresh();
            return;
          }
        }
        router.push(`/dashboard/tenants/${mode.tenant.id}?saved=1`);
      } else {
        const { id } = await api.dashboard.properties.createTenant(mode.propertyCode, {
          ...contact,
          leaseStart,
          paidThrough: paidThrough ? `${paidThrough}-01` : undefined,
          depositAmount: deposit ? Number(deposit) : undefined,
        });
        router.push(`/dashboard/tenants/${id}?saved=1`);
      }
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Couldn't save that tenant."));
      setSubmitting(false);
    }
  }

  return (
    <Box component="form" onSubmit={handleSubmit}>
      {/* Side by side from md, equal halves; both columns stretch to the same height so the cards line up. */}
      <Grid container spacing={2} columns={12}>
        <Grid size={{ xs: 12, md: 6 }} sx={{ minWidth: 0 }}>
          <SectionCard title="Houses & rent" fill>
            {draft ? (
              <Alert severity={draftComplete ? "success" : "info"}>
                {draftComplete
                  ? `Saving will make this tenant active and start billing from ${billingStart ? formatMonth(billingStart) : "the month after rent was paid up to"}.`
                  : "Draft from the paper register: not billed yet. Add the phone, combined monthly rent, when they moved in and how far rent is already paid, to start billing. You can save partial details now."}
              </Alert>
            ) : null}
            {movedOut ? (
              <Alert severity="info">This tenant has moved out, so their houses and rent can no longer change.</Alert>
            ) : null}
            <Autocomplete
              multiple
              options={options}
              value={units}
              onChange={(_, value) => setUnits(value)}
              disabled={movedOut}
              groupBy={(u) => `${u.propertyName} (${u.propertyCode})`}
              getOptionLabel={(u) => u.unitCode}
              isOptionEqualToValue={(a, b) => a.unitCode === b.unitCode}
              filterSelectedOptions
              renderOption={(props, u) => {
                const { key, ...rest } = props;
                return (
                  <li key={key} {...rest}>
                    <Stack>
                      <Typography variant="body2">{u.unitCode}</Typography>
                      <Typography variant="caption" color="textSecondary">
                        {unitCaption(u)}
                      </Typography>
                    </Stack>
                  </li>
                );
              }}
              renderValue={(value, getItemProps) =>
                value.map((u, index) => {
                  const { key, ...itemProps } = getItemProps({ index });
                  return <Chip key={key} label={u.unitCode} size="small" {...itemProps} />;
                })
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Houses"
                  helperText={
                    options.length === 0
                      ? "No vacant houses - add a house to a tower first."
                      : "Vacant houses only. A tenant can take several, across towers."
                  }
                />
              )}
            />
            {unitsChanged && !movedOut ? (
              <TextField
                label="Houses change from"
                type="date"
                value={unitsEffective}
                onChange={(e) => setUnitsEffective(e.target.value)}
                helperText="Removed houses end the day before; added houses start on this date."
                required
                fullWidth
                slotProps={{ inputLabel: { shrink: true } }}
              />
            ) : null}

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
              <TextField
                label="Combined monthly rent"
                type="number"
                value={monthlyRent}
                onChange={(e) => setMonthlyRent(e.target.value)}
                disabled={movedOut}
                helperText={
                  draft && !monthlyRent
                    ? "Not set yet"
                    : units.length > 1
                    ? `One rent for all ${units.length} houses${Number(monthlyRent) > 0 ? ` (${formatMoney(Number(monthlyRent))})` : ""}`
                    : "Billed once a month for all of this tenant's houses"
                }
                slotProps={{ htmlInput: { step: "0.01", min: 0 } }}
                required={!draft}
                fullWidth
              />
              {editing && !draft ? (
                rentChanged && !movedOut ? (
                  <TextField
                    label="New rent from"
                    type="month"
                    value={rentEffectiveMonth}
                    onChange={(e) => setRentEffectiveMonth(e.target.value)}
                    helperText="Months before keep the old rent"
                    required
                    fullWidth
                    slotProps={{ inputLabel: { shrink: true } }}
                  />
                ) : null
              ) : (
                <TextField
                  label="Moved in (lease start)"
                  type="date"
                  value={leaseStart}
                  onChange={(e) => setLeaseStart(e.target.value)}
                  helperText="When they moved in - kept as history"
                  required={!draft}
                  fullWidth
                  slotProps={{ inputLabel: { shrink: true } }}
                />
              )}
            </Stack>
            {settingUpBilling ? (
              <TextField
                label="Rent paid up to"
                type="month"
                value={paidThrough}
                onChange={(e) => setPaidThrough(e.target.value)}
                helperText={
                  billingStart
                    ? `Billing starts ${formatMonth(billingStart)}. Months before that were settled outside the app.`
                    : draft
                      ? "Last month already paid on paper; billing starts the month after"
                      : "Leave blank for a new tenant: billing starts from the lease start"
                }
                fullWidth
                slotProps={{ inputLabel: { shrink: true } }}
              />
            ) : null}
            <TextField
              label="Security deposit (optional)"
              type="number"
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
              disabled={!depositEditable}
              helperText={
                depositEditable
                  ? "Can't be changed after the tenant is active"
                  : deposit
                    ? "Locked: the deposit can't be changed once the tenant is active"
                    : "No deposit recorded - it can't be added once the tenant is active"
              }
              slotProps={{ htmlInput: { step: "0.01", min: 0 } }}
              fullWidth
            />
            {monthsDueNow > 3 ? (
              <Alert severity="warning">
                Saving creates {monthsDueNow} months of rent due
                {Number(monthlyRent) > 0 ? ` (${formatMoney(monthsDueNow * Number(monthlyRent))})` : ""}. If those months
                were already paid on paper, set &quot;Rent paid up to&quot; to the last paid month.
              </Alert>
            ) : null}
          </SectionCard>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }} sx={{ minWidth: 0 }}>
          {/* The last card grows to fill the column, matching the left card's bottom edge. */}
          <Stack spacing={2} sx={{ height: "100%", "& > :last-child": { flexGrow: 1 } }}>
            <SectionCard title="Tenant details">
              {hasCommercial ? (
                <TextField
                  label="Business name"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  helperText="Shown instead of the contact name"
                  fullWidth
                />
              ) : null}
              <TextField
                label={hasCommercial ? "Contact name" : "Name"}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                fullWidth
              />
              <TextField
                label="Phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                helperText={draft && !phone ? "Not known yet - needed before billing starts" : "With country code, e.g. +919876543210"}
                required={!draft}
                fullWidth
              />
              <TextField
                label="Preferred contact channel"
                select
                value={preferredChannel}
                onChange={(e) => setPreferredChannel(e.target.value as PreferredChannel)}
                fullWidth
              >
                <MenuItem value="both">WhatsApp + SMS</MenuItem>
                <MenuItem value="whatsapp">WhatsApp only</MenuItem>
                <MenuItem value="sms">SMS only</MenuItem>
              </TextField>
            </SectionCard>
            {mode.kind === "edit" && documents ? (
              <TenantDocumentsCard
                tenantId={mode.tenant.id}
                documents={documents}
                pending={pendingDocuments}
                onPendingChange={setPendingDocuments}
                disabled={submitting}
              />
            ) : null}
          </Stack>
        </Grid>

        <Grid size={12}>
          <FormActions
            error={error}
            cancelHref={cancelHref}
            submitLabel="Save"
            pendingLabel="Saving…"
            pending={submitting}
          />
        </Grid>
      </Grid>
    </Box>
  );
}
