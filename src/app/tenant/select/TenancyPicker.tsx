"use client";

import { useState } from "react";
import Alert from "@mui/material/Alert";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import TenantStatusBadge from "@/components/domain/TenantStatusBadge";
import { Loader } from "@/components/ui/Loading";
import { api, errorMessage } from "@/lib/api-client";
import type { TenancyOption } from "@/lib/contracts";
import { formatDateKey } from "@/lib/dates";

/** One button per tenancy of the signed-in phone; choosing opens it (A32). */
export default function TenancyPicker({ tenancies }: { tenancies: TenancyOption[] }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(tenantId: string) {
    setBusyId(tenantId);
    setError(null);
    try {
      const result = await api.tenant.selectTenancy({ tenantId });
      window.location.assign(result.next);
    } catch (err) {
      setError(errorMessage(err, "Couldn't open it. Try again."));
      setBusyId(null);
    }
  }

  return (
    <Stack spacing={2}>
      {error ? <Alert severity="error">{error}</Alert> : null}
      <List disablePadding>
        {tenancies.map((t) => (
          <ListItemButton key={t.id} disabled={busyId !== null} onClick={() => choose(t.id)} divider>
            <ListItemText
              primary={t.displayName}
              secondary={[t.unitCodes.join(", "), t.leaseStart ? `since ${formatDateKey(t.leaseStart)}` : null]
                .filter(Boolean)
                .join(" · ")}
            />
            {busyId === t.id ? <Loader size="sm" label="Opening…" /> : <TenantStatusBadge status={t.status} movedOutOn={t.movedOutOn} />}
          </ListItemButton>
        ))}
      </List>
    </Stack>
  );
}
