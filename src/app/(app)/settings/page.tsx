import { serverApi } from "@/lib/api-client/server";
import AsyncSection from "@/components/ui/AsyncSection";
import Stack from "@mui/material/Stack";
import { PageHeader } from "@/components/ui/DataDisplay";
import FlashAlert from "@/components/ui/FlashAlert";
import { dateFormatExample } from "@/lib/domain/dateFormats";
import { FLASH, type Flash } from "@/lib/routes";
import { DISPLAY_DATE_FORMATS } from "@/lib/types";
import SettingsLayout from "./SettingsLayout";
import { SETTINGS_SKELETONS as SKELETON } from "./settingsSkeletons";
import NotesSection from "./sections/NotesSection";
import TagsSection from "./sections/TagsSection";
import DatesSection from "./sections/DatesSection";

// The rent book's shared lists, offered while you work (A25), and how it
// shows dates (A36): not the owner's profile. Each streams in on its own
// call (A12).
export default async function SettingsPage({ searchParams }: { searchParams: Promise<Flash> }) {
  const tags = serverApi.dashboard.paymentTags();
  const notes = serverApi.dashboard.paymentNotes();
  const display = serverApi.dashboard.displaySettings();
  const flash = await searchParams;
  const saved = DISPLAY_DATE_FORMATS.find((f) => f === flash.dateFormatSaved);

  return (
    <SettingsLayout
      header={
        <Stack spacing={2}>
          <PageHeader
            title="Settings"
            subtitle="Lists the rent book offers while you work, and how it shows dates. Changing them never edits records already saved."
          />
          {saved ? (
            <FlashAlert param={FLASH.dateFormatSaved} severity="success">
              Saved. Dates now show like {dateFormatExample(saved)} (18 November 2026).
            </FlashAlert>
          ) : null}
        </Stack>
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
      dates={
        <AsyncSection title="Date format" fallback={SKELETON.dates}>
          <DatesSection settings={display} />
        </AsyncSection>
      }
    />
  );
}
