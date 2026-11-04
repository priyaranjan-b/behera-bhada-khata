"use client";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import AppCard from "@/components/ui/AppCard";
import { StatusBadge } from "@/components/ui/DataDisplay";
import { toneMain } from "@/components/ui/tone";
import { OwnerAvatar } from "@/components/shell/OwnerMenu";
import type { OwnerProfileView } from "@/lib/contracts";

/**
 * Top of the Profile page: who the owner is at a glance - avatar, name,
 * sign-in email, whether a signature is saved and who signs receipts - on a
 * faint brand wash.
 */
export default function ProfileSummary({ profile }: { profile: OwnerProfileView }) {
  const name = profile.displayName ?? "Your name isn't set yet";
  const signer = profile.signatureName?.trim() || profile.displayName;
  return (
    <AppCard
      sx={(theme) => {
        const wash = (strength: number) =>
          `linear-gradient(120deg, color-mix(in srgb, ${toneMain(theme, "primary")} ${strength}%, transparent) 0%, transparent 65%)`;
        return {
          p: { xs: 2, sm: 3 },
          backgroundImage: wash(16),
          // The raised card's light-scheme background is set per scheme, so the wash must be too.
          ...theme.applyStyles("light", { backgroundImage: wash(18) }),
        };
      }}
    >
      <Stack direction="row" spacing={{ xs: 2, sm: 2.5 }} sx={{ alignItems: "center", minWidth: 0 }}>
        <OwnerAvatar email={profile.email ?? undefined} name={profile.displayName ?? undefined} size={64} />
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h5" component="p" noWrap sx={{ fontWeight: 700 }}>
            {name}
          </Typography>
          {profile.email ? (
            <Typography variant="body2" color="textSecondary" noWrap>
              Signed in as {profile.email}
            </Typography>
          ) : null}
          <Stack direction="row" spacing={1} useFlexGap sx={{ mt: 1, flexWrap: "wrap", alignItems: "center" }}>
            {profile.signatureUrl ? (
              <StatusBadge tone="success" label="Signature saved" />
            ) : (
              <StatusBadge tone="warning" label="No saved signature" />
            )}
            {signer ? <StatusBadge tone="info" label={`Receipts signed by ${signer}`} /> : null}
          </Stack>
        </Box>
      </Stack>
    </AppCard>
  );
}
