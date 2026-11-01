import { useState } from "react";
import dayjs, { type Dayjs } from "dayjs";

// The DateField / MonthField value plumbing: callers keep a string key
// (yyyy-MM-dd or yyyy-MM, "" when empty), the picker a Dayjs.

/**
 * The picker's value for `value` (a key in `keyFormat`). Keeps what the owner
 * is still typing: a half-typed date reports "" to the caller, and the
 * picker goes on showing the partial input instead of clearing it.
 */
export function usePickerValue(value: string, onChange: (key: string) => void, keyFormat: string) {
  const [draft, setDraft] = useState<Dayjs | null>(null);
  const keyOf = (d: Dayjs | null) => (d && d.isValid() ? d.format(keyFormat) : "");
  const shown = draft && keyOf(draft) === value ? draft : value ? dayjs(value) : null;
  return {
    value: shown,
    onChange: (next: Dayjs | null) => {
      setDraft(next);
      onChange(keyOf(next));
    },
  };
}

/** A yyyy-MM-dd or yyyy-MM bound as a Dayjs, for minDate / maxDate. */
export const boundOf = (key: string | undefined) => (key ? dayjs(key) : undefined);
