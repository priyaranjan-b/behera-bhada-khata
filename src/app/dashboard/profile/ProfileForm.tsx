"use client";

import { useRef, useState } from "react";
import { useAppRouter } from "@/components/ui/Loading";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { FormActions, SectionCard, SignatureField, SignaturePreview } from "@/components/ui";
import type { SignaturePadHandle } from "@/components/ui/SignaturePad";
import { api, errorMessage } from "@/lib/api-client";
import type { OwnerProfileView } from "@/lib/contracts";
import { ownerFullName } from "@/lib/domain/owner";
import { signatureImageToPng } from "@/lib/signatureImage";
import { routes } from "@/lib/routes";

/** What happens to the saved signature on Save. */
type SignatureChange = { kind: "upload"; dataUrl: string } | { kind: "draw" } | { kind: "remove" } | null;

export default function ProfileForm({ profile }: { profile: OwnerProfileView }) {
  const router = useAppRouter();
  const [firstName, setFirstName] = useState(profile.firstName ?? "");
  const [lastName, setLastName] = useState(profile.lastName ?? "");
  const [signatureName, setSignatureName] = useState(profile.signatureName ?? "");
  const [change, setChange] = useState<SignatureChange>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pad = useRef<SignaturePadHandle | null>(null);

  const ownerName = ownerFullName(firstName, lastName) ?? "the owner";
  const signer = signatureName.trim() || ownerName;
  const preview = change?.kind === "upload" ? change.dataUrl : change ? null : profile.signatureUrl;

  async function handleUpload(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      setChange({ kind: "upload", dataUrl: await signatureImageToPng(file) });
    } catch (err) {
      setError(errorMessage(err, "Couldn't read that image."));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    let signaturePng: string | undefined;
    if (change?.kind === "upload") signaturePng = change.dataUrl;
    if (change?.kind === "draw") {
      if (!pad.current || pad.current.isEmpty()) {
        setError("Draw the signature, or cancel drawing");
        return;
      }
      signaturePng = pad.current.toPngDataUrl();
    }

    setSubmitting(true);
    try {
      await api.dashboard.updateProfile({
        firstName,
        lastName,
        signatureName,
        signaturePng,
        removeSignature: change?.kind === "remove",
      });
      setChange(null);
      router.replace(routes.profile({ saved: "1" }));
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Couldn't save your profile."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Box component="form" onSubmit={handleSubmit}>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Stack spacing={2}>
            <SectionCard title="Owner" caption="The landlord, printed on every receipt.">
              <TextField
                label="First name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                fullWidth
                slotProps={{ htmlInput: { maxLength: 60 } }}
              />
              <TextField
                label="Last name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                fullWidth
                slotProps={{ htmlInput: { maxLength: 60 } }}
              />
            </SectionCard>
            <SectionCard title="Signed by" caption="Who signs receipts, if not the owner.">
              <TextField
                label="Signer's name"
                value={signatureName}
                onChange={(e) => setSignatureName(e.target.value)}
                fullWidth
                helperText={
                  signatureName.trim()
                    ? `Receipts read "${signer}, on behalf of ${ownerName}".`
                    : "Leave empty if the owner signs."
                }
                slotProps={{ htmlInput: { maxLength: 120 } }}
              />
            </SectionCard>
          </Stack>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          {change?.kind === "draw" ? (
            <Stack spacing={1}>
              <SignatureField
                title="Saved signature"
                caption={`Draw ${signer}'s signature. It's used on new payments unless you sign by hand.`}
                onReady={(handle) => (pad.current = handle)}
              />
              <Box>
                <Button size="small" onClick={() => setChange(null)}>
                  Cancel drawing
                </Button>
              </Box>
            </Stack>
          ) : (
            <SectionCard
              title="Saved signature"
              caption={`${signer}'s signature, used on new payments and adjustments unless you sign by hand. Receipts already issued keep theirs.`}
            >
              {preview ? (
                <SignaturePreview src={preview} height={96} />
              ) : (
                <Typography variant="body2" color="textSecondary">
                  {change?.kind === "remove"
                    ? "The saved signature will be removed when you save."
                    : "None yet - you'll sign each payment by hand."}
                </Typography>
              )}
              <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }} useFlexGap>
                <Button component="label" variant="outlined" size="small">
                  Upload image
                  <input
                    hidden
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => {
                      void handleUpload(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </Button>
                <Button variant="outlined" size="small" onClick={() => setChange({ kind: "draw" })}>
                  Draw
                </Button>
                {profile.signatureUrl && change?.kind !== "remove" ? (
                  <Button size="small" color="error" onClick={() => setChange({ kind: "remove" })}>
                    Remove
                  </Button>
                ) : null}
                {change ? (
                  <Button size="small" onClick={() => setChange(null)}>
                    Undo
                  </Button>
                ) : null}
              </Stack>
              <Typography variant="caption" color="textSecondary">
                Photo or scan of the signature in dark ink on plain paper; the paper is removed automatically.
              </Typography>
            </SectionCard>
          )}
        </Grid>

        <Grid size={12}>
          <FormActions
            error={error}
            cancelHref={routes.home}
            submitLabel="Save"
            pendingLabel="Saving…"
            pending={submitting}
          />
        </Grid>
      </Grid>
    </Box>
  );
}
