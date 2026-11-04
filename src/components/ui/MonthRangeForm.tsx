"use client";

import { useState } from "react";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import MonthField from "./MonthField";
import { useAppRouter } from "./Loading";
import { withQuery } from "@/lib/routes";

/**
 * From / To months for a page listed by month (Billing, Earnings); Show opens
 * `path?from=&to=` (yyyy-MM) plus `query` (e.g. the paid-direct view).
 */
export default function MonthRangeForm({
  from,
  to,
  path,
  query,
}: {
  /** yyyy-MM. */
  from: string;
  to: string;
  /** The page's own route, e.g. routes.billing(). */
  path: string;
  /** Kept on Show, e.g. paidDirectQuery(view). */
  query?: Record<string, string | undefined>;
}) {
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
        router.push(withQuery(path, { from: start || end, to: end || start, ...query }));
      }}
    >
      <MonthField label="From" size="small" value={start} onChange={setStart} sx={{ width: 170 }} />
      <MonthField label="To" size="small" value={end} onChange={setEnd} sx={{ width: 170 }} />
      <Button type="submit" variant="outlined" disabled={!start && !end}>
        Show
      </Button>
    </Stack>
  );
}
