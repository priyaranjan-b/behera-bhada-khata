"use client";

import Autocomplete from "@mui/material/Autocomplete";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { TagPill } from "@/components/ui/DataDisplay";
import QuickPicks from "@/components/ui/QuickPicks";
import { PAYMENT_TAG_LIMITS } from "@/lib/validation";

/** How many suggestions show as one-tap chips. */
const QUICK_TAGS = 5;

/**
 * A record's tags (payments 0030, D34; who paid a maintenance expense, 0031):
 * the shared suggestions (Settings); pick one or type a new one
 * (Enter, or leave the field, adds it). One of each whatever the case, and a
 * typed name that matches a known tag takes its spelling. The first
 * QUICK_TAGS suggestions also show as chips under the field: one tap adds a
 * tag, another removes it, and several can be on at once.
 */
export default function TagsField({
  value,
  onChange,
  suggestions,
  disabled,
  label = "Tags (optional)",
  helperText = "Who received it, or any label - pick one or type a new one",
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  /** The suggested names (Settings), alphabetical. */
  suggestions: string[];
  disabled?: boolean;
  label?: string;
  helperText?: string;
}) {
  const full = value.length >= PAYMENT_TAG_LIMITS.maxPerPayment;
  const quick = suggestions.slice(0, QUICK_TAGS);
  const isOn = (tag: string) => value.some((t) => t.toLowerCase() === tag.toLowerCase());

  function change(next: string[]) {
    const tags: string[] = [];
    for (const raw of next) {
      const typed = raw.trim().slice(0, PAYMENT_TAG_LIMITS.maxLength);
      if (!typed) continue;
      const name = suggestions.find((s) => s.toLowerCase() === typed.toLowerCase()) ?? typed;
      if (!tags.some((t) => t.toLowerCase() === name.toLowerCase())) tags.push(name);
    }
    onChange(tags.slice(0, PAYMENT_TAG_LIMITS.maxPerPayment));
  }

  function toggle(tag: string) {
    change(isOn(tag) ? value.filter((t) => t.toLowerCase() !== tag.toLowerCase()) : [...value, tag]);
  }

  const field = (
    <Autocomplete
      multiple
      freeSolo
      autoSelect
      filterSelectedOptions
      options={suggestions}
      value={value}
      onChange={(_e, next) => change(next)}
      disabled={disabled}
      getOptionDisabled={() => full}
      renderValue={(tags, getItemProps) =>
        tags.map((tag, index) => {
          const { key, ...itemProps } = getItemProps({ index });
          return <TagPill key={key} label={tag} {...itemProps} />;
        })
      }
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          helperText={full ? `At most ${PAYMENT_TAG_LIMITS.maxPerPayment} tags` : helperText}
          // Enter adds the tag; it mustn't also submit the form around it.
          onKeyDown={(e) => {
            if (e.key === "Enter") e.preventDefault();
          }}
          slotProps={{
            ...params.slotProps,
            htmlInput: { ...params.slotProps.htmlInput, maxLength: PAYMENT_TAG_LIMITS.maxLength },
          }}
        />
      )}
      fullWidth
    />
  );
  if (quick.length === 0) return field;
  return (
    <Stack spacing={1}>
      {field}
      <QuickPicks
        disabled={disabled}
        picks={quick.map((tag) => ({ label: tag, ariaLabel: `Tag ${tag}`, selected: isOn(tag), disabled: full }))}
        onPick={(index) => toggle(quick[index])}
      />
    </Stack>
  );
}
