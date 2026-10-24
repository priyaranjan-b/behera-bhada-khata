import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import { serverApi } from "@/lib/api-client/server";
import { FLASH } from "@/lib/routes";
import { PageHeader } from "@/components/ui/DataDisplay";
import FlashAlert from "@/components/ui/FlashAlert";
import ChangePasswordCard from "./ChangePasswordCard";
import ProfileForm from "./ProfileForm";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; passwordChanged?: string }>;
}) {
  const [profile, { saved, passwordChanged }] = await Promise.all([serverApi.dashboard.profile(), searchParams]);

  return (
    <Stack spacing={2}>
      <PageHeader
        title="Profile"
        subtitle={`The owner's name and the saved signature printed on receipts. Signed in as ${profile.email ?? "the owner"}.`}
      />
      {saved ? (
        <FlashAlert param={FLASH.saved} severity="success">
          Profile saved.
        </FlashAlert>
      ) : null}
      {passwordChanged ? (
        <FlashAlert param={FLASH.passwordChanged} severity="success">
          Password set. You can now sign in with your email and this password.
        </FlashAlert>
      ) : null}
      {/* Remount on save so the form starts from what was stored. */}
      <ProfileForm key={`${profile.displayName}|${profile.signatureName}|${profile.signatureUrl}`} profile={profile} />
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <ChangePasswordCard />
        </Grid>
      </Grid>
    </Stack>
  );
}
