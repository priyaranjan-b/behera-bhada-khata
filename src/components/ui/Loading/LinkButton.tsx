"use client";

import { useEffect, useState } from "react";
import { useLinkStatus } from "next/link";
import Button, { type ButtonProps } from "@mui/material/Button";
import Link from "@/components/ui/Link";
import Loader from "./Loader";

// useLinkStatus only works below the <Link>, i.e. inside the button's
// children, so this reports the pending state back up to the button.
function PendingProbe({ onChange }: { onChange: (pending: boolean) => void }) {
  const { pending } = useLinkStatus();
  useEffect(() => onChange(pending), [pending, onChange]);
  return null;
}

/**
 * A Button that navigates (`<Button component={Link}>`) and shows the
 * app's spinner while its route loads. Server-safe props, so Server
 * Component pages can render it directly.
 */
export default function LinkButton({
  href,
  children,
  startIcon,
  ...props
}: Pick<
  ButtonProps,
  "variant" | "color" | "size" | "startIcon" | "endIcon" | "fullWidth" | "disabled" | "sx" | "children" | "aria-label"
> & { href: string }) {
  const [pending, setPending] = useState(false);
  return (
    <Button
      {...props}
      component={Link}
      href={href}
      startIcon={startIcon}
      loading={pending}
      loadingPosition={startIcon ? "start" : "center"}
      loadingIndicator={<Loader size="sm" />}
    >
      {children}
      <PendingProbe onChange={setPending} />
    </Button>
  );
}
