"use client";

import { useState } from "react";
import { useAppRouter } from "@/components/ui/Loading";
import Papa from "papaparse";
import type { GridColDef } from "@mui/x-data-grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Tooltip from "@mui/material/Tooltip";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import DataTable from "@/components/ui/DataTable";
import { DashboardCardPanel, StatusBadge } from "@/components/ui/DataDisplay";
import { ActionStack, BadgeRow, DropzoneCard, FormActions, GridCell } from "@/components/ui";
import { downloadBlob } from "@/lib/download";
import { createTenantSchema } from "@/lib/validation";
import { api, errorMessage } from "@/lib/api-client";
import type { z } from "zod";
import type { PreferredChannel } from "@/lib/types";

const CSV_HEADER = "Business Name,Tenant Name,Phone,Houses,Preferred Channel,Monthly Rent,Lease Start,Paid Up To,Deposit";

/** A template using this tower's vacant houses, one tenant taking two of them. */
function sampleCsv(vacant: string[]): string {
  const [a = "AC-T1-G01", b = "AC-T1-G02", c = "AC-T1-101"] = vacant;
  return [
    CSV_HEADER,
    `Sharma General Store,Amit Sharma,+919876543210,${a};${b},whatsapp,25000,2019-04-01,2026-09,50000`,
    `,Rina Das,+919876543211,${c},both,8000,2026-10-01,,`,
    "",
  ].join("\n");
}

/** "AC-T1-G01; AC-T1-G02" (or comma / pipe separated) -> codes. */
function splitHouses(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(/[;,|]/)
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
}

const HEADER_ALIASES: Record<string, string> = {
  "business name": "businessName",
  businessname: "businessName",
  "tenant name": "name",
  name: "name",
  phone: "phone",
  houses: "units",
  house: "units",
  units: "units",
  "house codes": "units",
  "preferred channel": "preferredChannel",
  preferredchannel: "preferredChannel",
  "monthly rent": "monthlyRentAmount",
  monthlyrent: "monthlyRentAmount",
  "monthly rent amount": "monthlyRentAmount",
  "combined rent": "monthlyRentAmount",
  "lease start": "leaseStart",
  leasestart: "leaseStart",
  "moved in": "leaseStart",
  "paid up to": "paidThrough",
  deposit: "depositAmount",
  "security deposit": "depositAmount",
  "deposit amount": "depositAmount",
  "paid through": "paidThrough",
  paidthrough: "paidThrough",
};

function normalizeHeader(header: string): string {
  const key = header.trim().toLowerCase();
  return HEADER_ALIASES[key] ?? key;
}

type TenantInput = z.infer<typeof createTenantSchema>;

interface ParsedRow {
  rowNumber: number;
  name: string;
  houses: string;
  data?: TenantInput;
  error?: string;
}

const previewColumns: GridColDef<ParsedRow>[] = [
  { field: "rowNumber", headerName: "Row", type: "number", width: 80, headerAlign: "left", align: "left" },
  { field: "name", headerName: "Name", flex: 1, minWidth: 180 },
  { field: "houses", headerName: "Houses", flex: 1, minWidth: 160 },
  {
    field: "status",
    headerName: "Status",
    minWidth: 140,
    sortable: true,
    valueGetter: (_value, row) => (row.data ? "Ready" : "Fix required"),
    renderCell: ({ row }) => (
      <GridCell>
        {row.data ? (
          <StatusBadge tone="success" label="Ready" />
        ) : (
          <Tooltip title={row.error}>
            <span>
              <StatusBadge tone="danger" label="Fix required" />
            </span>
          </Tooltip>
        )}
      </GridCell>
    ),
  },
  {
    field: "error",
    headerName: "Issue",
    flex: 1.4,
    minWidth: 220,
    renderCell: ({ row }) => (
      <GridCell>
        <Typography variant="body2" color="textSecondary" noWrap title={row.error}>
          {row.error ?? "-"}
        </Typography>
      </GridCell>
    ),
  },
];

function downloadSampleCsv(vacant: string[]) {
  downloadBlob(new Blob([sampleCsv(vacant)], { type: "text/csv;charset=utf-8;" }), "tenants-template.csv");
}

export default function BulkTenantUpload({
  propertyCode,
  vacantUnitCodes,
}: {
  propertyCode: string;
  vacantUnitCodes: string[];
}) {
  const router = useAppRouter();
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ created: number; failed: { rowNumber: number; error: string }[] } | null>(
    null,
  );

  function handleFile(file: File) {
    setResult(null);
    setParseError(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: normalizeHeader,
      complete: (results) => {
        if (results.data.length === 0) {
          setParseError("That file has no data rows.");
          setRows([]);
          return;
        }

        const vacant = new Set(vacantUnitCodes);
        const claimed = new Set<string>();
        const parsed: ParsedRow[] = results.data.map((raw, i) => {
          const unitCodes = splitHouses(raw.units);
          const candidate = {
            name: raw.name?.trim(),
            businessName: raw.businessName?.trim() || undefined,
            unitCodes,
            phone: raw.phone?.trim(),
            preferredChannel: (raw.preferredChannel?.trim().toLowerCase() || "both") as PreferredChannel,
            monthlyRentAmount: raw.monthlyRentAmount?.trim(),
            leaseStart: raw.leaseStart?.trim(),
            paidThrough: raw.paidThrough?.trim() || undefined,
            depositAmount: raw.depositAmount?.trim() || undefined,
          };
          const parsedResult = createTenantSchema.safeParse(candidate);
          // Catch houses that are taken, unknown, or used twice in this file
          // before uploading; the server checks again in its transaction.
          const taken = parsedResult.success
            ? parsedResult.data.unitCodes.find((c) => !vacant.has(c) || claimed.has(c))
            : undefined;
          let error: string | undefined;
          if (!parsedResult.success) error = parsedResult.error.issues[0]?.message;
          else if (taken) error = claimed.has(taken) ? `${taken} is used by an earlier row` : `${taken} isn't vacant`;
          else parsedResult.data.unitCodes.forEach((c) => claimed.add(c));
          return {
            rowNumber: i + 2, // +1 for 1-indexing, +1 for the header row
            name: raw.name?.trim() || raw.businessName?.trim() || "(no name)",
            houses: unitCodes.join(", "),
            data: parsedResult.success && !taken ? parsedResult.data : undefined,
            error,
          };
        });
        setRows(parsed);
      },
      error: (err) => setParseError(err.message),
    });
  }

  const validRows = rows.filter((r) => r.data);
  const invalidRows = rows.filter((r) => !r.data);

  async function handleUpload() {
    setUploading(true);
    setResult(null);
    try {
      const body = await api.dashboard.properties.bulkCreateTenants(
        propertyCode,
        validRows.map((r) => r.data)
      );

      // Server reports failures by index into what we sent - map back to the
      // original CSV row numbers for a message the owner can act on.
      const failed = body.failed.map((f) => ({
        rowNumber: validRows[f.rowNumber - 1]?.rowNumber ?? f.rowNumber,
        error: f.error,
      }));
      setResult({ created: body.created, failed });
      router.refresh();
    } catch (err) {
      setParseError(errorMessage(err, "Upload failed"));
    } finally {
      setUploading(false);
    }
  }

  return (
    <Stack spacing={2}>
      <DropzoneCard
        icon={<UploadFileRoundedIcon />}
        title="Upload a CSV of tenants"
        description={
          <>
            Download the template, fill in one row per tenant, then upload it here. Put all of a tenant&apos;s houses
            in one cell separated by &quot;;&quot; (e.g. AC-T1-G01;AC-T1-G02); Monthly Rent is their combined rent.
            Preferred channel defaults to &quot;both&quot;. &quot;Paid Up To&quot; (yyyy-MM, optional) is the last month
            already paid on paper - billing starts the month after; leave it blank for new tenants.{" "}
            {vacantUnitCodes.length} houses are vacant.
          </>
        }
        actions={
          <ActionStack>
            <Button
              variant="outlined"
              startIcon={<DownloadRoundedIcon />}
              onClick={() => downloadSampleCsv(vacantUnitCodes)}
            >
              Download sample CSV
            </Button>
            <Button variant="contained" component="label" startIcon={<UploadFileRoundedIcon />}>
              Choose CSV file
              <input
                type="file"
                accept=".csv,text/csv"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                  e.target.value = "";
                }}
              />
            </Button>
          </ActionStack>
        }
      />

      {parseError ? <Alert severity="error">{parseError}</Alert> : null}

      {rows.length > 0 ? (
        <>
          <DashboardCardPanel
            title="Preview"
            subtitle="Rows that need fixing show the reason in the Issue column."
            action={
              <BadgeRow align="end">
                <StatusBadge tone="success" label={`${validRows.length} ready to upload`} />
                {invalidRows.length > 0 ? (
                  <StatusBadge tone="danger" label={`${invalidRows.length} need fixing`} />
                ) : null}
              </BadgeRow>
            }
            flush
          >
            <DataTable<ParsedRow>
              variant="plain"
              rows={rows}
              columns={previewColumns}
              getRowId={(row) => row.rowNumber}
              rowDensity="dense"
              search={false}
              columnsButton={false}
              filterButton={false}
              label="CSV preview"
            />
          </DashboardCardPanel>

          <FormActions
            submitLabel={`Upload ${validRows.length} tenant${validRows.length === 1 ? "" : "s"}`}
            pendingLabel="Uploading…"
            pending={uploading}
            disabled={validRows.length === 0}
            onAction={handleUpload}
          />
        </>
      ) : null}

      {result ? (
        <Stack spacing={1}>
          <Alert severity={result.failed.length === 0 ? "success" : "warning"}>
            Created {result.created} tenant{result.created === 1 ? "" : "s"}
            {result.failed.length > 0 ? `, ${result.failed.length} failed` : ""}.
          </Alert>
          {result.failed.map((f) => (
            <Typography key={f.rowNumber} variant="body2" color="error">
              Row {f.rowNumber}: {f.error}
            </Typography>
          ))}
        </Stack>
      ) : null}
    </Stack>
  );
}
