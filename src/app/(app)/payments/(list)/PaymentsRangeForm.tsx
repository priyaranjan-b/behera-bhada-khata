"use client";

import { useState } from "react";
import { DateField } from "@/components/ui";
import { useAppRouter } from "@/components/ui/Loading";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { routes } from "@/lib/routes";

/** From / To days received for the Payments page; Show opens that range. */
export default function PaymentsRangeForm({ from, to }: { from: string; to: string }) {
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
        router.push(routes.payments.list({ from: start || end, to: end || start }));
      }}
    >
      <DateField label="Received from" size="small" value={start} onChange={setStart} sx={{ width: 180 }} />
      <DateField label="To" size="small" value={end} min={start || undefined} onChange={setEnd} sx={{ width: 180 }} />
      <Button type="submit" variant="outlined" disabled={!start && !end}>
        Show
      </Button>
    </Stack>
  );
}
