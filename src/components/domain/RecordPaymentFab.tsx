"use client";

import { useId, useMemo, useState } from "react";
import InputAdornment from "@mui/material/InputAdornment";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import BottomSheet from "@/components/ui/BottomSheet";
import FloatingActionButton from "@/components/ui/FloatingActionButton";
import Link from "@/components/ui/Link";
import { Loader, LoadingButton } from "@/components/ui/Loading";
import { payableTenants } from "@/lib/domain/search";
import { routes } from "@/lib/routes";
import { useSearchIndex } from "./useSearchIndex";

/**
 * Phones (A37): "Record payment" as a floating button on the main screens.
 * It opens a sheet listing the tenants who are billed (`canRecordPayment`),
 * searchable by name, business or house, and goes to the chosen one's
 * Record payment form. The list is the top-bar search index
 * (`useSearchIndex`: one request per page, shared with the search).
 */
export function RecordPaymentFab({ lowered }: { lowered: boolean }) {
  const sheetId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { index, failed, load } = useSearchIndex();

  const tenants = useMemo(() => (index ? payableTenants(index, query) : []), [index, query]);

  function close() {
    setOpen(false);
    setQuery("");
  }

  return (
    <>
      <FloatingActionButton
        label="Record payment"
        icon={<AddRoundedIcon />}
        lowered={lowered}
        aria-haspopup="dialog"
        aria-controls={open ? sheetId : undefined}
        aria-expanded={open}
        onClick={() => {
          setOpen(true);
          void load();
        }}
      />
      <BottomSheet open={open} onClose={close} title="Record payment for" id={sheetId}>
        <Stack spacing={1.5} sx={{ pb: 1 }}>
          <TextField
            size="small"
            fullWidth
            // The sheet is for picking one person: start typing at once.
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
          {failed ? (
            <Stack spacing={1} sx={{ alignItems: "flex-start" }}>
              <Typography variant="body2" color="textSecondary">
                Couldn&apos;t load the tenants.
              </Typography>
              <LoadingButton variant="outlined" size="small" onClick={load}>
                Try again
              </LoadingButton>
            </Stack>
          ) : !index ? (
            <Loader label="Loading tenants" />
          ) : tenants.length === 0 ? (
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
                  onClick={close}
                >
                  <ListItemText primary={t.primary} secondary={t.secondary || undefined} />
                </ListItemButton>
              ))}
            </List>
          )}
        </Stack>
      </BottomSheet>
    </>
  );
}
