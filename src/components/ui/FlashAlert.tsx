"use client";

import { useEffect } from "react";
import Alert, { type AlertColor } from "@mui/material/Alert";

/**
 * A one-time message driven by a query param (e.g. `?resent=1` after a
 * redirect). Shows once, then removes the param from the URL so a reload or
 * the back button doesn't show it again.
 */
export default function FlashAlert({
  param,
  severity,
  children,
}: {
  param: string;
  severity: AlertColor;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(param)) return;
    url.searchParams.delete(param);
    // Next.js syncs native history calls with its router, without a refetch.
    window.history.replaceState(window.history.state, "", url);
  }, [param]);

  return <Alert severity={severity}>{children}</Alert>;
}
