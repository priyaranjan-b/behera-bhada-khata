"use client";

import { useState } from "react";
import { MonthField } from "@/components/ui";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
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
      <MonthField
        label="From"
        size="small"
        value={start}
        onChange={setStart}
        sx={{ width: 170 }}
      />
      <MonthField
        label="To"
        size="small"
        value={end}
        onChange={setEnd}
        sx={{ width: 170 }}
      />
      <Button type="submit" variant="outlined" disabled={!start && !end}>
        Show
      </Button>
    </Stack>
  );
}
