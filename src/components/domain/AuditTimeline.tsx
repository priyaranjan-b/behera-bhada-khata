"use client";

import { useEffect, useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import MuiLink from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import Link from "@/components/ui/Link";
import { EmptyState } from "@/components/ui/DataDisplay";
import { Loader, LoadingButton } from "@/components/ui/Loading";
import { api, errorMessage } from "@/lib/api-client";
import type { AuditEntry } from "@/lib/contracts";
import { formatDateTime } from "@/lib/dates";
import { routes } from "@/lib/routes";


/** Consecutive entries written in one transaction are one change (a move-out and the months it dropped). */
function groupByChange(entries: AuditEntry[]): AuditEntry[][] {
  const groups: AuditEntry[][] = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (last && last[0].txId === entry.txId) last.push(entry);
    else groups.push([entry]);
  }
  return groups;
}

/**
 * A history timeline from audit_log, newest first, with "Show older"; loads
 * on mount (the house History dialog). `showTenant` links each change to its tenant.
 */
export default function AuditTimeline({
  unitCode,
  showTenant = false,
}: {
  unitCode: string;
  showTenant?: boolean;
}) {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const groups = useMemo(() => groupByChange(entries ?? []), [entries]);

  useEffect(() => {
    let cancelled = false;
    api.dashboard.houses.history(unitCode)
      .then((page) => {
        if (cancelled) return;
        setEntries(page.entries);
        setNextBefore(page.nextBefore);
      })
      .catch((err) => !cancelled && setError(errorMessage(err, "Couldn't load the history.")));
    return () => {
      cancelled = true;
    };
  }, [unitCode]);

  async function showOlder() {
    if (nextBefore === null) return;
    try {
      const page = await api.dashboard.houses.history(unitCode, nextBefore);
      setEntries((current) => [...(current ?? []), ...page.entries]);
      setNextBefore(page.nextBefore);
    } catch (err) {
      setError(errorMessage(err, "Couldn't load older changes."));
    }
  }

  if (error) return <Alert severity="error">{error}</Alert>;
  if (entries === null) return <Loader label="Loading history" />;
  if (entries.length === 0) {
    return (
      <EmptyState
        icon={<HistoryRoundedIcon />}
        title="No changes recorded yet"
        description="Changes are recorded from when history was switched on."
      />
    );
  }

  return (
    <Stack spacing={1.5}>
      <Stack spacing={1.5} divider={<Divider flexItem />} component="ol" sx={{ m: 0, p: 0, listStyle: "none" }}>
        {groups.map((group) => (
          <Stack key={group[0].id} component="li" spacing={0.75}>
            <Typography variant="caption" color="textSecondary">
              {formatDateTime(group[0].at)} · {group[0].actorName}
            </Typography>
            {group.map((entry) => (
              <ChangeItem key={entry.id} entry={entry} showTenant={showTenant} />
            ))}
          </Stack>
        ))}
      </Stack>
      {nextBefore !== null ? (
        <Box>
          <LoadingButton size="small" onClick={showOlder}>
            Show older changes
          </LoadingButton>
        </Box>
      ) : null}
    </Stack>
  );
}

function ChangeItem({ entry, showTenant }: { entry: AuditEntry; showTenant: boolean }) {
  return (
    <Box>
      <Typography variant="subtitle2" component="p">
        {entry.title}
        {showTenant && entry.tenantId && entry.tenantName ? (
          <>
            {" · "}
            <MuiLink component={Link} href={routes.tenants.detail(entry.tenantId)}>
              {entry.tenantName}
            </MuiLink>
          </>
        ) : null}
      </Typography>
      {entry.details ? (
        <Typography variant="body2" color="textSecondary">
          {entry.details}
        </Typography>
      ) : null}
    </Box>
  );
}
