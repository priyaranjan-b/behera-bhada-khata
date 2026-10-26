"use client";

import { useTransition } from "react";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import { useAppRouter } from "@/components/ui/Loading";
import { PAID_DIRECT_PARAM } from "@/lib/preferences";

/**
 * "Include Govt paid direct" on Overview and Billing: whether government rent
 * paid to the owner directly (A11) counts in the figures. Off on every visit;
 * switching it sets `?paidDirect=show` on this page's URL (nothing is
 * remembered), and the page re-renders on the server with the new totals.
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
            const url = new URL(window.location.href);
            if (e.target.checked) url.searchParams.set(PAID_DIRECT_PARAM, "show");
            else url.searchParams.delete(PAID_DIRECT_PARAM);
            startTransition(() => router.replace(`${url.pathname}${url.search}`, { scroll: false }));
          }}
        />
      }
      label="Include Govt paid direct"
      slotProps={{ typography: { variant: "body2", noWrap: true } }}
    />
  );
}
