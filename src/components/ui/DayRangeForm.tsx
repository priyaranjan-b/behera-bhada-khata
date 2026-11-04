"use client";

import { useContext, useState } from "react";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import DateField from "./DateField";
import { InSheetContext } from "./inSheet";
import { useAppRouter } from "./Loading";
import { withQuery } from "@/lib/routes";

/**
 * From / To days for a page listed by day (Payments, Maintenance); Show opens
 * `path?from=&to=`. `path` is the page's own route (routes.payments.list()).
 */
export default function DayRangeForm({ from, to, path, fromLabel }: { from: string; to: string; path: string; fromLabel: string }) {
  const router = useAppRouter();
  // In the phone sheet: fields share the row, the button takes its own.
  const inSheet = useContext(InSheetContext);
  const field = inSheet ? { flex: "1 1 140px", minWidth: 0 } : { width: 180 };
  const [start, setStart] = useState(from);
  const [end, setEnd] = useState(to);

  return (
    <Stack
      component="form"
      direction="row"
      spacing={1}
      useFlexGap
      sx={{ flexWrap: "wrap", alignItems: "center", width: inSheet ? "100%" : undefined }}
      onSubmit={(e: React.FormEvent) => {
        e.preventDefault();
        router.push(withQuery(path, { from: start || end, to: end || start }));
      }}
    >
      <DateField label={fromLabel} size="small" value={start} onChange={setStart} sx={field} />
      <DateField label="To" size="small" value={end} min={start || undefined} onChange={setEnd} sx={field} />
      <Button type="submit" variant="outlined" fullWidth={inSheet} disabled={!start && !end}>
        Show
      </Button>
    </Stack>
  );
}
