"use client";

import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import { TagPill } from "@/components/ui/DataDisplay";
import { PAYMENT_TAG_LIMITS } from "@/lib/validation";

/**
 * A payment's tags (0030, D34): pick a suggestion or type a new one
 * (Enter, or leave the field, adds it). One of each whatever the case, and a
 * typed name that matches a known tag takes its spelling.
 */
export default function PaymentTagsField({
  value,
  onChange,
  suggestions,
  disabled,
  helperText = "Who received it, or any label - pick one or type a new one",
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  /** The suggested names (Profile page), alphabetical. */
  suggestions: string[];
  disabled?: boolean;
  helperText?: string;
}) {
  const full = value.length >= PAYMENT_TAG_LIMITS.maxPerPayment;

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

  return (
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
          label="Tags (optional)"
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
}
