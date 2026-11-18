import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import { serverApi } from "@/lib/api-client/server";
import { FLASH } from "@/lib/routes";
import { PageHeader } from "@/components/ui/DataDisplay";
import FlashAlert from "@/components/ui/FlashAlert";
import ProfileSummary from "@/components/domain/ProfileSummary";
import ChangePasswordCard from "./ChangePasswordCard";
import AsyncSection from "@/components/ui/AsyncSection";
import { DetailCardSkeleton } from "@/components/ui/Skeletons";
import CorrectionPinSection from "./sections/CorrectionPinSection";
import ProfileForm from "./ProfileForm";

// The owner as a person: name, signature, password and corrections PIN
// (A35). The rent book's shared lists (tags, quick notes) are on Settings (A25).
export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; passwordChanged?: string; pinSaved?: string }>;
}) {
  // Started first, streamed on its own: a failed PIN read never takes Profile down.
  const pin = serverApi.dashboard.correctionPin();
  const [profile, { saved, passwordChanged, pinSaved }] = await Promise.all([serverApi.dashboard.profile(), searchParams]);

  return (
    <Stack spacing={2}>
      <PageHeader title="Profile" subtitle="Your name and signature on every receipt, and how you sign in." />
      {saved ? (
        <FlashAlert param={FLASH.saved} severity="success">
          Profile saved.
        </FlashAlert>
      ) : null}
      {pinSaved ? (
        <FlashAlert param={FLASH.pinSaved} severity="success">
          Corrections PIN saved. Use it to confirm every correction.
        </FlashAlert>
      ) : null}
      {passwordChanged ? (
        <FlashAlert param={FLASH.passwordChanged} severity="success">
          Password set. You can now sign in with your email and this password.
        </FlashAlert>
      ) : null}
      <ProfileSummary profile={profile} />
      {/* Remount on save so the form starts from what was stored. */}
      <ProfileForm key={`${profile.displayName}|${profile.signatureName}|${profile.signatureUrl}`} profile={profile} />
      {/* Side by side from lg (half of md squeezes the password fields), stacked below; the cards fill the row. */}
      <Grid container spacing={2} sx={{ alignItems: "stretch" }}>
        <Grid size={{ xs: 12, lg: 6 }} sx={{ minWidth: 0, maxWidth: { md: 760, lg: "none" } }}>
          <ChangePasswordCard />
        </Grid>
        <Grid size={{ xs: 12, lg: 6 }} sx={{ minWidth: 0, maxWidth: { md: 760, lg: "none" } }}>
          <AsyncSection title="Corrections PIN" fallback={<DetailCardSkeleton rows={3} action={false} />}>
            <CorrectionPinSection status={pin} />
          </AsyncSection>
        </Grid>
      </Grid>
    </Stack>
  );
}
