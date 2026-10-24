"use client";

import { useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import { SectionCard, SignatureField, SignaturePreview } from "@/components/ui";
import type { SignaturePadHandle } from "@/components/ui/SignaturePad";
import type { SavedSignature } from "@/lib/contracts";

export interface OwnerSignatureHandle {
  /**
   * The signature to send: a drawn PNG data URL; undefined = use the saved
   * signature (the server copies it onto the record); null = nothing signed yet.
   */
  value(): string | undefined | null;
}

/**
 * The owner's signature on a payment or adjustment: the saved one from the
 * Profile page when there is one (with "Sign by hand" to draw instead),
 * otherwise a signature pad.
 */
export function OwnerSignatureField({
  saved,
  onReady,
}: {
  saved: SavedSignature | null;
  onReady: (handle: OwnerSignatureHandle) => void;
}) {
  const [useSaved, setUseSaved] = useState(Boolean(saved));
  const useSavedRef = useRef(useSaved);
  const pad = useRef<SignaturePadHandle | null>(null);

  useEffect(() => {
    onReady({
      value: () => {
        if (useSavedRef.current) return undefined;
        return pad.current && !pad.current.isEmpty() ? pad.current.toPngDataUrl() : null;
      },
    });
  }, [onReady]);

  const choose = (saved: boolean) => {
    useSavedRef.current = saved;
    setUseSaved(saved);
  };

  if (saved && useSaved) {
    return (
      <SectionCard
        title="Owner signature"
        caption={`Your saved signature - printed as signed by ${saved.signerName}.`}
        action={
          <Button size="small" onClick={() => choose(false)}>
            Sign by hand
          </Button>
        }
      >
        <SignaturePreview src={saved.url} height={72} />
      </SectionCard>
    );
  }

  return (
    <Box>
      <SignatureField
        title="Owner signature"
        caption={saved ? "Drawn for this receipt only; your saved signature stays as it is." : undefined}
        onReady={(handle) => (pad.current = handle)}
      />
      {saved ? (
        <Button size="small" sx={{ mt: 1 }} onClick={() => choose(true)}>
          Use saved signature
        </Button>
      ) : null}
    </Box>
  );
}
