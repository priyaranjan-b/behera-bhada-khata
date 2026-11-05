"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";

/**
 * The tail of a list that phones keep short: hidden below `sm` behind a
 * "Show N more" button, always shown from `sm` up. Put the first items
 * before it and the rest inside it. Done in CSS, so the server's page is
 * already short on a phone: no jump on load.
 */
export default function MoreOnPhone({ count, children }: { count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  if (count <= 0) return null;
  return (
    <>
      <Box sx={open ? undefined : { display: { xs: "none", sm: "block" } }}>{children}</Box>
      {open ? null : (
        <Button
          size="small"
          variant="text"
          onClick={() => setOpen(true)}
          sx={{ display: { xs: "inline-flex", sm: "none" }, alignSelf: "flex-start" }}
        >
          Show {count} more
        </Button>
      )}
    </>
  );
}
