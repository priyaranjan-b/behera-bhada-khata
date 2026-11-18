"use client";

import { useMemo, useState } from "react";
import InputAdornment from "@mui/material/InputAdornment";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import AppCard from "@/components/ui/AppCard";
import Link from "@/components/ui/Link";
import type { SearchIndex } from "@/lib/contracts";
import { payableTenants } from "@/lib/domain/search";
import { routes } from "@/lib/routes";

/**
 * Quick add → Record payment (A37): the tenants Record payment applies to
 * (`canRecordPayment`, moved-out ones last), searchable by name, business or
 * house; choosing one opens their Record payment form.
 */
export default function RecordPaymentPicker({ index }: { index: SearchIndex }) {
  const [query, setQuery] = useState("");
  const tenants = useMemo(() => payableTenants(index, query), [index, query]);

  return (
    <AppCard>
      <Stack spacing={1.5}>
        <TextField
          size="small"
          fullWidth
          // The page is for picking one person: start typing at once.
          autoFocus
          placeholder="Search tenant, business or house"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRoundedIcon fontSize="small" />
                </InputAdornment>
              ),
            },
            htmlInput: { "aria-label": "Search tenants" },
          }}
        />
        {tenants.length === 0 ? (
          <Typography variant="body2" color="textSecondary">
            {query.trim() ? "No tenant matches." : "No tenant to record a payment for yet."}
          </Typography>
        ) : (
          <List disablePadding aria-label="Tenants">
            {tenants.map((t) => (
              <ListItemButton
                key={t.tenantId}
                component={Link}
                href={routes.tenants.newPayment(t.tenantId)}
                transitionTypes={["nav-forward"]}
              >
                <ListItemText primary={t.primary} secondary={t.secondary || undefined} />
              </ListItemButton>
            ))}
          </List>
        )}
      </Stack>
    </AppCard>
  );
}
