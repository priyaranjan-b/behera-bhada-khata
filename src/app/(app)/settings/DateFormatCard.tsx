"use client";

import { useState } from "react";
import { useAppRouter } from "@/components/ui/Loading";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import { FormActions, OptionGroup, SectionCard } from "@/components/ui";
import { api, errorMessage } from "@/lib/api-client";
import { DATE_FORMAT_OPTIONS } from "@/lib/domain/dateFormats";
import { routes } from "@/lib/routes";
import type { DisplayDateFormat } from "@/lib/types";

const OPTIONS = DATE_FORMAT_OPTIONS.map((o) => ({ value: o.value, label: o.example, ariaLabel: `${o.example}: ${o.description}` }));

/**
 * How the app shows and takes dates (A36), saved for the rent book (0040).
 * Receipts and the history's stored text keep dd/mm/yyyy. Saving reloads
 * Settings with a message saying what dates now look like.
 */
export default function DateFormatCard({ current }: { current: DisplayDateFormat }) {
  const router = useAppRouter();
  const [format, setFormat] = useState<DisplayDateFormat>(current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unchanged = format === current;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (unchanged) return;
    setSaving(true);
    setError(null);
    try {
      await api.dashboard.setDisplaySettings({ dateFormat: format });
      router.replace(routes.settings({ dateFormatSaved: format }));
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Couldn't save the date format."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save}>
      <SectionCard
        title="Date format"
        caption="How dates are shown and typed across the app and the tenant portal. Receipts and history text stay dd/mm/yyyy."
        icon={<CalendarMonthRoundedIcon />}
        tone="info"
        fill
      >
        <OptionGroup label="Show dates like" value={format} options={OPTIONS} onChange={setFormat} disabled={saving} />
        <FormActions
          error={error}
          submitLabel="Save"
          disabled={unchanged}
          pendingLabel="Saving…"
          pending={saving}
        />
      </SectionCard>
    </form>
  );
}
