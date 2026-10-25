"use client";

import { useTransition } from "react";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import { useAppRouter } from "@/components/ui/Loading";
import { savePaidDirectView } from "@/lib/preferences";

/**
 * "Include Govt paid direct" on Overview and Billing: one remembered choice
 * (a cookie) whether government rent paid to the owner directly (A11) counts
 * in the figures. The page re-renders on the server with the new totals.
 */
export default function PaidDirectToggle({ shown }: { shown: boolean }) {
  const router = useAppRouter();
  const [pending, startTransition] = useTransition();
  return (
    <FormControlLabel
      control={
        <Switch
          size="small"
          checked={shown}
          disabled={pending}
          onChange={(e) => {
            savePaidDirectView(e.target.checked ? "show" : "hide");
            startTransition(() => router.refresh());
          }}
        />
      }
      label="Include Govt paid direct"
      slotProps={{ typography: { variant: "body2", noWrap: true } }}
    />
  );
}
