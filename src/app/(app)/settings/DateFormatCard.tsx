"use client";

import { useState } from "react";
import { useAppRouter } from "@/components/ui/Loading";
import FormControlLabel from "@mui/material/FormControlLabel";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import { FormActions, SectionCard } from "@/components/ui";
import { api, errorMessage } from "@/lib/api-client";
import { todayKey } from "@/lib/dates";
import { DATE_FORMAT_OPTIONS } from "@/lib/domain/dateFormats";
import type { DisplayDateFormat } from "@/lib/types";

/**
 * How the app shows dates (A36), saved for the rent book (0040). The UI only:
 * receipts, the history's stored text and what services write keep
 * dd/MM/yyyy. Saving refreshes the page, so every date on screen follows.
 */
export default function DateFormatCard({ current }: { current: DisplayDateFormat }) {
  const router = useAppRouter();
  const [format, setFormat] = useState<DisplayDateFormat>(current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = todayKey();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.dashboard.setDisplaySettings({ dateFormat: format });
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
        caption="How dates are shown across the app and the tenant portal. Receipts keep dd/mm/yyyy."
        icon={<CalendarMonthRoundedIcon />}
        tone="info"
      >
        <RadioGroup
          aria-label="Date format"
          value={format}
          onChange={(_e, value) => setFormat(value as DisplayDateFormat)}
        >
          {DATE_FORMAT_OPTIONS.map((option) => (
            <FormControlLabel
              key={option.value}
              value={option.value}
              control={<Radio />}
              label={`${option.example(today)} · ${option.label}`}
            />
          ))}
        </RadioGroup>
        <FormActions error={error} submitLabel="Save" pendingLabel="Saving…" pending={saving} />
      </SectionCard>
    </form>
  );
}
