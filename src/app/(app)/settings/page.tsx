import { serverApi } from "@/lib/api-client/server";
import AsyncSection from "@/components/ui/AsyncSection";
import { PageHeader } from "@/components/ui/DataDisplay";
import SettingsLayout from "./SettingsLayout";
import { SETTINGS_SKELETONS as SKELETON } from "./settingsSkeletons";
import NotesSection from "./sections/NotesSection";
import TagsSection from "./sections/TagsSection";

// The rent book's shared lists, offered while you work (A25): not the
// owner's profile. Each list streams in on its own call (A12).
export default function SettingsPage() {
  const tags = serverApi.dashboard.paymentTags();
  const notes = serverApi.dashboard.paymentNotes();

  return (
    <SettingsLayout
      header={
        <PageHeader
          title="Settings"
          subtitle="Lists the rent book offers while you work. Changing them never edits records already saved."
        />
      }
      tags={
        <AsyncSection title="Payment tags" fallback={SKELETON.list}>
          <TagsSection tags={tags} />
        </AsyncSection>
      }
      notes={
        <AsyncSection title="Quick payment notes" fallback={SKELETON.list}>
          <NotesSection notes={notes} />
        </AsyncSection>
      }
    />
  );
}
