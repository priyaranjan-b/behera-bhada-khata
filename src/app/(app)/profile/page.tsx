import Stack from "@mui/material/Stack";
import { serverApi } from "@/lib/api-client/server";
import { FLASH } from "@/lib/routes";
import { PageHeader } from "@/components/ui/DataDisplay";
import FlashAlert from "@/components/ui/FlashAlert";
import ProfileSummary from "@/components/domain/ProfileSummary";
import ChangePasswordCard from "./ChangePasswordCard";
import ProfileForm from "./ProfileForm";

// The owner as a person: name, signature, password. The rent book's shared
// lists (tags, quick notes) are on Settings (A25).
export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; passwordChanged?: string }>;
}) {
  const [profile, { saved, passwordChanged }] = await Promise.all([serverApi.dashboard.profile(), searchParams]);

  return (
    <Stack spacing={2}>
      <PageHeader title="Profile" subtitle="Your name and signature on every receipt, and how you sign in." />
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
      <ProfileSummary profile={profile} />
      {/* Remount on save so the form starts from what was stored. */}
      <ProfileForm key={`${profile.displayName}|${profile.signatureName}|${profile.signatureUrl}`} profile={profile} />
      <ChangePasswordCard />
    </Stack>
  );
}
