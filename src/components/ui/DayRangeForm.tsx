"use client";

import { useState } from "react";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import DateField from "./DateField";
import { useAppRouter } from "./Loading";
import { withQuery } from "@/lib/routes";

/**
 * From / To days for a page listed by day (Payments, Maintenance); Show opens
 * `path?from=&to=`. `path` is the page's own route (routes.payments.list()).
 */
export default function DayRangeForm({ from, to, path, fromLabel }: { from: string; to: string; path: string; fromLabel: string }) {
  const router = useAppRouter();
  const [start, setStart] = useState(from);
  const [end, setEnd] = useState(to);

  return (
    <Stack
      component="form"
      direction="row"
      spacing={1}
      useFlexGap
      sx={{ flexWrap: "wrap", alignItems: "center" }}
      onSubmit={(e: React.FormEvent) => {
        e.preventDefault();
        router.push(withQuery(path, { from: start || end, to: end || start }));
      }}
    >
      <DateField label={fromLabel} size="small" value={start} onChange={setStart} sx={{ width: 180 }} />
      <DateField label="To" size="small" value={end} min={start || undefined} onChange={setEnd} sx={{ width: 180 }} />
      <Button type="submit" variant="outlined" disabled={!start && !end}>
        Show
      </Button>
    </Stack>
  );
}
