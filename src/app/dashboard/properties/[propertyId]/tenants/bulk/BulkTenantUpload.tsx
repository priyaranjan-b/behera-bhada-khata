"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import type { GridColDef } from "@mui/x-data-grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Tooltip from "@mui/material/Tooltip";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import AppDataGrid from "@/components/AppDataGrid";
import { DashboardCardPanel, StatusBadge } from "@/components/DataComponents";
import { ActionStack, BadgeRow, DropzoneCard, FormActions, GridCell } from "@/components/ui";
import { createTenantSchema } from "@/lib/validation";
import { api, errorMessage } from "@/lib/api-client";
import type { z } from "zod";

const SAMPLE_CSV =
  "Unit Type,Business Name,Tenant Name,Phone,Tower,Floor,House Number,Preferred Channel,Monthly Rent,Lease Start\n" +
  "residential,,Amit Sharma,+919876543210,A,3,12,both,15000,2026-01-01\n" +
  "commercial,Sharma General Store,Amit Sharma,+919876543210,B,Ground,3,whatsapp,25000,2026-01-01\n";

const HEADER_ALIASES: Record<string, string> = {
  "unit type": "unitType",
  unittype: "unitType",
  "business name": "businessName",
  businessname: "businessName",
  "tenant name": "name",
  name: "name",
  phone: "phone",
  tower: "tower",
  floor: "floor",
  "house number": "houseNumber",
  housenumber: "houseNumber",
  "preferred channel": "preferredChannel",
  preferredchannel: "preferredChannel",
  "monthly rent": "monthlyRentAmount",
  monthlyrent: "monthlyRentAmount",
  "monthly rent amount": "monthlyRentAmount",
  "lease start": "leaseStart",
  leasestart: "leaseStart",
};

function normalizeHeader(header: string): string {
  const key = header.trim().toLowerCase();
  return HEADER_ALIASES[key] ?? key;
}

type TenantInput = z.infer<typeof createTenantSchema>;

interface ParsedRow {
  rowNumber: number;
  name: string;
  data?: TenantInput;
  error?: string;
}

const previewColumns: GridColDef<ParsedRow>[] = [
  { field: "rowNumber", headerName: "Row", type: "number", width: 80, headerAlign: "left", align: "left" },
  { field: "name", headerName: "Name", flex: 1, minWidth: 180 },
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

function downloadSampleCsv() {
  const blob = new Blob([SAMPLE_CSV], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "tenants-template.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function BulkTenantUpload({ propertyId }: { propertyId: string }) {
  const router = useRouter();
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

        const parsed: ParsedRow[] = results.data.map((raw, i) => {
          const candidate = {
            propertyId,
            name: raw.name?.trim(),
            businessName: raw.businessName?.trim() || undefined,
            unitType: (raw.unitType?.trim().toLowerCase() || "residential") as "residential" | "commercial",
            tower: raw.tower?.trim() || undefined,
            floor: raw.floor?.trim() || undefined,
            houseNumber: raw.houseNumber?.trim() || undefined,
            phone: raw.phone?.trim(),
            preferredChannel: (raw.preferredChannel?.trim().toLowerCase() || "both") as "whatsapp" | "sms" | "both",
            monthlyRentAmount: raw.monthlyRentAmount?.trim(),
            leaseStart: raw.leaseStart?.trim(),
          };
          const parsedResult = createTenantSchema.safeParse(candidate);
          return {
            rowNumber: i + 2, // +1 for 1-indexing, +1 for the header row
            name: raw.name?.trim() || raw.businessName?.trim() || "(no name)",
            data: parsedResult.success ? parsedResult.data : undefined,
            error: parsedResult.success ? undefined : parsedResult.error.issues[0]?.message,
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
        propertyId,
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
            Download the template, fill in one row per tenant, then upload it here. Unit type defaults to
            &quot;residential&quot; and preferred channel to &quot;both&quot; if left blank.
          </>
        }
        actions={
          <ActionStack>
            <Button variant="outlined" startIcon={<DownloadRoundedIcon />} onClick={downloadSampleCsv}>
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
            <AppDataGrid<ParsedRow>
              rows={rows}
              columns={previewColumns}
              getRowId={(row) => row.rowNumber}
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
