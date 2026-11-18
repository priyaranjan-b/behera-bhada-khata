"use client";

import { useId } from "react";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormLabel from "@mui/material/FormLabel";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

export interface Option<V extends string> {
  value: V;
  label: React.ReactNode;
  /** A quieter second line under the label. */
  secondary?: React.ReactNode;
  /** For screen readers when the label alone is ambiguous (e.g. just an example). */
  ariaLabel?: string;
}

/**
 * Pick one of a few options, each a radio with a label and an optional
 * second line: the kit's radio group, so every choice list looks the same.
 */
export default function OptionGroup<V extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: V;
  options: readonly Option<V>[];
  onChange: (value: V) => void;
  disabled?: boolean;
}) {
  const labelId = useId();
  return (
    <FormControl disabled={disabled}>
      <FormLabel id={labelId} sx={{ mb: 0.5 }}>
        {label}
      </FormLabel>
      <RadioGroup aria-labelledby={labelId} value={value} onChange={(_e, next) => onChange(next as V)}>
        {options.map((option) => (
          <FormControlLabel
            key={option.value}
            value={option.value}
            control={<Radio slotProps={{ input: option.ariaLabel ? { "aria-label": option.ariaLabel } : undefined }} />}
            label={
              <Stack spacing={0}>
                <span>{option.label}</span>
                {option.secondary ? (
                  <Typography variant="caption" color="textSecondary">
                    {option.secondary}
                  </Typography>
                ) : null}
              </Stack>
            }
          />
        ))}
      </RadioGroup>
    </FormControl>
  );
}
