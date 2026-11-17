"use client";

import { forwardRef, useState } from "react";
import Button, { type ButtonProps } from "@mui/material/Button";
import Loader from "./Loader";
import { beginLoading } from "./store";

export type LoadingButtonProps = Omit<ButtonProps, "onClick"> & {
  /** Return a promise to show the spinner (and the top bar) until it settles. */
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => unknown;
};

/**
 * MUI Button with the app's loading state: pass `loading`, or return a
 * promise from `onClick` and it spins until that settles. Disabled while
 * loading, so a second click can't send the request twice. The spinner sits
 * at the start, beside the label ("Saving…"): MUI's centred spinner hides
 * the label, which left a blank button.
 */
const LoadingButton = forwardRef<HTMLButtonElement, LoadingButtonProps>(function LoadingButton(
  { onClick, loading, startIcon, loadingPosition, ...props },
  ref
) {
  const [running, setRunning] = useState(false);

  async function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    const result = onClick?.(event);
    if (!(result instanceof Promise)) return;
    setRunning(true);
    const done = beginLoading();
    try {
      await result;
    } finally {
      done();
      setRunning(false);
    }
  }

  return (
    <Button
      ref={ref}
      {...props}
      startIcon={startIcon}
      onClick={onClick ? handleClick : undefined}
      loading={Boolean(loading) || running}
      loadingPosition={loadingPosition ?? "start"}
      loadingIndicator={<Loader size="sm" />}
    />
  );
});

export default LoadingButton;
