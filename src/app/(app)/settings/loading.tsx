import { PageSkeleton } from "@/components/ui/Skeletons";
import SettingsLayout from "./SettingsLayout";
import { SETTINGS_SKELETONS as SKELETON } from "./settingsSkeletons";

// Same layout and placeholders as each section's fallback in page.tsx.
export default function SettingsLoading() {
  return (
    <PageSkeleton label="Loading settings…">
      <SettingsLayout header={SKELETON.header} tags={SKELETON.list} notes={SKELETON.list} />
    </PageSkeleton>
  );
}
