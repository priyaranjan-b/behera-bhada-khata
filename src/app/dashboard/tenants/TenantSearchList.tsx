"use client";

import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import InputAdornment from "@mui/material/InputAdornment";
import Paper from "@mui/material/Paper";
import Avatar from "@mui/material/Avatar";
import Chip from "@mui/material/Chip";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import SearchIcon from "@mui/icons-material/Search";
import PeopleOutlineIcon from "@mui/icons-material/PeopleOutlineOutlined";
import Link from "@/components/Link";
import { formatMoney } from "@/lib/money";

export interface TenantSearchRow {
  tenantId: string;
  displayName: string;
  contactName: string | null;
  businessName: string | null;
  unitType: "residential" | "commercial";
  unitLabel: string;
  phone: string;
  propertyName: string;
  propertyAddress: string;
  totalOutstanding: number;
  overdueMonths: number;
}

type SortKey = "delinquency" | "name" | "property" | "location";

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export default function TenantSearchList({ rows }: { rows: TenantSearchRow[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("delinquency");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q
      ? rows.filter(
          (r) =>
            r.displayName.toLowerCase().includes(q) ||
            (r.businessName?.toLowerCase().includes(q) ?? false) ||
            (r.contactName?.toLowerCase().includes(q) ?? false)
        )
      : rows;

    return [...matched].sort((a, b) => {
      switch (sort) {
        case "name":
          return a.displayName.localeCompare(b.displayName);
        case "property":
          return a.propertyName.localeCompare(b.propertyName);
        case "location":
          return a.propertyAddress.localeCompare(b.propertyAddress);
        case "delinquency":
        default:
          if (b.overdueMonths !== a.overdueMonths) return b.overdueMonths - a.overdueMonths;
          return b.totalOutstanding - a.totalOutstanding;
      }
    });
  }, [rows, query, sort]);

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4" sx={{ fontWeight: 800 }}>
          Tenants
        </Typography>
        <Typography variant="body2" color="textSecondary">
          Search and sort across every property.
        </Typography>
      </Box>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <TextField
          placeholder="Search by tenant or business name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
          fullWidth
        />
        <TextField
          select
          label="Sort by"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          sx={{ minWidth: 200 }}
        >
          <MenuItem value="delinquency">Delinquency</MenuItem>
          <MenuItem value="name">Tenant name</MenuItem>
          <MenuItem value="property">Property</MenuItem>
          <MenuItem value="location">Location</MenuItem>
        </TextField>
      </Stack>

      {filtered.length === 0 ? (
        <Paper sx={{ p: 6, textAlign: "center" }}>
          <PeopleOutlineIcon sx={{ fontSize: 40, color: "text.disabled", mb: 1 }} />
          <Typography variant="body1" sx={{ fontWeight: 600 }}>
            No tenants match
          </Typography>
          <Typography variant="body2" color="textSecondary">
            {rows.length === 0 ? "No active tenants yet." : "Try a different search term."}
          </Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Tenant</TableCell>
                <TableCell>Property</TableCell>
                <TableCell>Unit</TableCell>
                <TableCell align="right">Outstanding</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((row) => (
                <TableRow key={row.tenantId} hover>
                  <TableCell>
                    <Box
                      component={Link}
                      href={`/dashboard/tenants/${row.tenantId}`}
                      sx={{ display: "flex", alignItems: "center", gap: 1.5, color: "inherit", textDecoration: "none" }}
                    >
                      <Avatar sx={{ width: 32, height: 32, bgcolor: "primary.main", fontSize: 13 }}>
                        {initials(row.displayName)}
                      </Avatar>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {row.displayName}
                        </Typography>
                        {row.contactName ? (
                          <Typography variant="caption" color="textSecondary">
                            {row.contactName}
                          </Typography>
                        ) : null}
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{row.propertyName}</Typography>
                    {row.propertyAddress ? (
                      <Typography variant="caption" color="textSecondary">
                        {row.propertyAddress}
                      </Typography>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                      <Chip size="small" variant="outlined" label={row.unitType} />
                      {row.unitLabel ? (
                        <Typography variant="caption" color="textSecondary">
                          {row.unitLabel}
                        </Typography>
                      ) : null}
                    </Stack>
                  </TableCell>
                  <TableCell align="right">
                    {row.totalOutstanding > 0 ? (
                      <Chip
                        size="small"
                        color={row.overdueMonths > 0 ? "error" : "warning"}
                        label={
                          formatMoney(row.totalOutstanding) +
                          (row.overdueMonths > 0 ? ` · ${row.overdueMonths}mo` : "")
                        }
                      />
                    ) : (
                      <Typography variant="body2" color="textSecondary">
                        -
                      </Typography>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Stack>
  );
}
