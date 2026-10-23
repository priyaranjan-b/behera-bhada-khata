"use client";

import { useRef } from "react";
import Button from "@mui/material/Button";
import SignaturePad, { type SignaturePadHandle } from "@/components/SignaturePad";
import { SectionCard } from "./Surfaces";

/** Signature section: heading, Clear action, and the pad. Hands the pad handle to the parent. */
export function SignatureField({
  title = "Signature",
  caption,
  onReady,
}: {
  title?: string;
  caption?: string;
  onReady: (handle: SignaturePadHandle) => void;
}) {
  const handle = useRef<SignaturePadHandle | null>(null);
  return (
    <SectionCard
      title={title}
      caption={caption}
      action={
        <Button size="small" onClick={() => handle.current?.clear()}>
          Clear
        </Button>
      }
    >
      <SignaturePad
        onReady={(h) => {
          handle.current = h;
          onReady(h);
        }}
      />
    </SectionCard>
  );
}
