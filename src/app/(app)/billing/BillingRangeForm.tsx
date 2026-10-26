"use client";

import { useState } from "react";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useAppRouter } from "@/components/ui/Loading";
import { paidDirectQuery } from "@/lib/preferences";
import { routes } from "@/lib/routes";
import type { PaidDirectView } from "@/lib/types";

/** From / To month inputs for the Billing page; Show opens that range, keeping the paid-direct view. */
export default function BillingRangeForm({ from, to, paidDirect }: { from: string; to: string; paidDirect: PaidDirectView }) {
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
        router.push(routes.billing({ from: start || end, to: end || start, ...paidDirectQuery(paidDirect) }));
      }}
    >
      <TextField
        label="From"
        type="month"
        size="small"
        value={start}
        onChange={(e) => setStart(e.target.value)}
        slotProps={{ inputLabel: { shrink: true } }}
        sx={{ width: 170 }}
      />
      <TextField
        label="To"
        type="month"
        size="small"
        value={end}
        onChange={(e) => setEnd(e.target.value)}
        slotProps={{ inputLabel: { shrink: true } }}
        sx={{ width: 170 }}
      />
      <Button type="submit" variant="outlined" disabled={!start && !end}>
        Show
      </Button>
    </Stack>
  );
}
