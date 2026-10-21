"use client";

import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Button from "@mui/material/Button";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableSortLabel from "@mui/material/TableSortLabel";
import TablePagination from "@mui/material/TablePagination";
import Chip from "@mui/material/Chip";
import type { LedgerRow } from "@/lib/tenantLedger";
import { formatMoney } from "@/lib/money";
import ResendButton from "@/components/ResendButton";
import Link from "@/components/Link";

type FilterMode = "all" | "range" | "month";
type SortKey = "date" | "debit" | "credit" | "balance";

const TYPE_LABEL: Record<LedgerRow["type"], string> = {
  charge: "Charge",
  payment: "Payment",
  adjustment: "Adjustment",
};

function StatusCell({ status }: { status: LedgerRow["status"] }) {
  if (status === "billed") {
    return (
      <Typography variant="caption" color="textSecondary">
        —
      </Typography>
    );
  }
  return <Chip size="small" color={status === "confirmed" ? "success" : "warning"} label={status} />;
}

export default function TenantLedgerTable({ rows, tenantId }: { rows: LedgerRow[]; tenantId: string }) {
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [month, setMonth] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      if (filterMode === "month") {
        if (!month) return true;
        return row.date.slice(0, 7) === month;
      }
      if (filterMode === "range") {
        if (fromDate && row.date < fromDate) return false;
        if (toDate && row.date > toDate) return false;
      }
      return true;
    });
  }, [rows, filterMode, fromDate, toDate, month]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      const cmp = sortKey === "date" ? a.date.localeCompare(b.date) : a[sortKey] - b[sortKey];
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sortKey, sortDir]);

  const paged = sorted.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "date" ? "desc" : "desc");
    }
    setPage(0);
  }

  function resetFilters(mode: FilterMode) {
    setFilterMode(mode);
    setFromDate("");
    setToDate("");
    setMonth("");
    setPage(0);
  }

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ alignItems: { sm: "flex-end" } }}>
        <TextField
          select
          label="Filter"
          size="small"
          value={filterMode}
          onChange={(e) => resetFilters(e.target.value as FilterMode)}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="all">All time</MenuItem>
          <MenuItem value="range">Date range</MenuItem>
          <MenuItem value="month">Month</MenuItem>
        </TextField>

        {filterMode === "range" ? (
          <>
            <TextField
              label="From"
              type="date"
              size="small"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPage(0);
              }}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="To"
              type="date"
              size="small"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPage(0);
              }}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </>
        ) : null}

        {filterMode === "month" ? (
          <TextField
            label="Month"
            type="month"
            size="small"
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              setPage(0);
            }}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        ) : null}
      </Stack>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sortDirection={sortKey === "date" ? sortDir : false}>
                <TableSortLabel active={sortKey === "date"} direction={sortDir} onClick={() => toggleSort("date")}>
                  Date
                </TableSortLabel>
              </TableCell>
              <TableCell>Description</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right" sortDirection={sortKey === "debit" ? sortDir : false}>
                <TableSortLabel active={sortKey === "debit"} direction={sortDir} onClick={() => toggleSort("debit")}>
                  Debit
                </TableSortLabel>
              </TableCell>
              <TableCell align="right" sortDirection={sortKey === "credit" ? sortDir : false}>
                <TableSortLabel active={sortKey === "credit"} direction={sortDir} onClick={() => toggleSort("credit")}>
                  Credit
                </TableSortLabel>
              </TableCell>
              <TableCell align="right" sortDirection={sortKey === "balance" ? sortDir : false}>
                <TableSortLabel
                  active={sortKey === "balance"}
                  direction={sortDir}
                  onClick={() => toggleSort("balance")}
                >
                  Balance
                </TableSortLabel>
              </TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {paged.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7}>
                  <Typography variant="body2" color="textSecondary" sx={{ py: 2, textAlign: "center" }}>
                    No entries match this filter.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              paged.map((row) => (
                <TableRow key={row.id} hover>
                  <TableCell>{row.date}</TableCell>
                  <TableCell>
                    <Typography variant="body2">{row.description}</Typography>
                    <Typography variant="caption" color="textSecondary">
                      {TYPE_LABEL[row.type]}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <StatusCell status={row.status} />
                  </TableCell>
                  <TableCell align="right">{row.debit > 0 ? formatMoney(row.debit) : ""}</TableCell>
                  <TableCell align="right">{row.credit > 0 ? formatMoney(row.credit) : ""}</TableCell>
                  <TableCell align="right">{formatMoney(row.balance)}</TableCell>
                  <TableCell align="right">
                    {row.type !== "charge" && row.refId ? (
                      row.status === "confirmed" ? (
                        <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
                          <Button
                            size="small"
                            href={`/api/owner/receipt/${row.type === "payment" ? "payment" : "adjustment"}/${row.refId}`}
                          >
                            Receipt
                          </Button>
                          {row.type === "payment" ? (
                            <Button size="small" component={Link} href={`/dashboard/payments/${row.refId}/adjust`}>
                              Adjust
                            </Button>
                          ) : null}
                        </Stack>
                      ) : (
                        <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                          <ResendButton
                            kind={row.type === "payment" ? "payment" : "adjustment"}
                            recordId={row.refId}
                            tenantId={tenantId}
                            amount={row.rawAmount ?? 0}
                          />
                        </Box>
                      )
                    ) : null}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <TablePagination
          component="div"
          count={sorted.length}
          page={page}
          onPageChange={(_, newPage) => setPage(newPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(Number(e.target.value));
            setPage(0);
          }}
          rowsPerPageOptions={[10, 25, 50]}
        />
      </TableContainer>
    </Stack>
  );
}
