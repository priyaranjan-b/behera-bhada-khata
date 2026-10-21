"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Paper from "@mui/material/Paper";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import Chip from "@mui/material/Chip";
import Tooltip from "@mui/material/Tooltip";
import DownloadIcon from "@mui/icons-material/Download";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import { createTenantSchema } from "@/lib/validation";
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
    null
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
      const res = await fetch(`/api/properties/${propertyId}/tenants/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenants: validRows.map((r) => r.data) }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Upload failed");

      // Server reports failures by index into what we sent - map back to the
      // original CSV row numbers for a message the owner can act on.
      const failed = (body.failed as { rowNumber: number; error: string }[]).map((f) => ({
        rowNumber: validRows[f.rowNumber - 1]?.rowNumber ?? f.rowNumber,
        error: f.error,
      }));
      setResult({ created: body.created, failed });
      router.refresh();
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Stack spacing={3}>
      <Alert severity="info">
        Download the template, fill in one row per tenant, then upload it here. Unit type defaults to
        &quot;residential&quot; and preferred channel to &quot;both&quot; if left blank.
      </Alert>

      <Stack direction="row" spacing={2}>
        <Button variant="outlined" startIcon={<DownloadIcon />} onClick={downloadSampleCsv}>
          Download sample CSV
        </Button>
        <Button
          variant="contained"
          component="label"
          startIcon={<UploadFileIcon />}
        >
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
      </Stack>

      {parseError ? <Alert severity="error">{parseError}</Alert> : null}

      {rows.length > 0 ? (
        <>
          <Stack direction="row" spacing={1}>
            <Chip size="small" color="success" label={`${validRows.length} ready to upload`} />
            {invalidRows.length > 0 ? (
              <Chip size="small" color="error" label={`${invalidRows.length} need fixing`} />
            ) : null}
          </Stack>

          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Row</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.rowNumber}>
                    <TableCell>{row.rowNumber}</TableCell>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>
                      {row.data ? (
                        <Chip size="small" color="success" label="Ready" />
                      ) : (
                        <Tooltip title={row.error}>
                          <Chip size="small" color="error" label="Fix required" />
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Button
            variant="contained"
            size="large"
            disabled={validRows.length === 0 || uploading}
            onClick={handleUpload}
            sx={{ alignSelf: "flex-start" }}
          >
            {uploading ? "Uploading…" : `Upload ${validRows.length} tenant${validRows.length === 1 ? "" : "s"}`}
          </Button>
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
