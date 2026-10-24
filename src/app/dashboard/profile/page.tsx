import Stack from "@mui/material/Stack";
import { serverApi } from "@/lib/api-client/server";
import { PageHeader } from "@/components/ui/DataDisplay";
import FlashAlert from "@/components/ui/FlashAlert";
import ProfileForm from "./ProfileForm";

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const [profile, { saved }] = await Promise.all([serverApi.dashboard.profile(), searchParams]);

  return (
    <Stack spacing={2}>
      <PageHeader
        title="Profile"
        subtitle={`The owner's name and the saved signature printed on receipts. Signed in as ${profile.email ?? "the owner"}.`}
      />
      {saved ? (
        <FlashAlert param="saved" severity="success">
          Profile saved.
        </FlashAlert>
      ) : null}
      {/* Remount on save so the form starts from what was stored. */}
      <ProfileForm key={`${profile.displayName}|${profile.signatureName}|${profile.signatureUrl}`} profile={profile} />
    </Stack>
  );
}
