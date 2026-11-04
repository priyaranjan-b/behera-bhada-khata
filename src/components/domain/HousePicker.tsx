"use client";

import { useMemo } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import QuickPicks from "@/components/ui/QuickPicks";

/** What the picker needs of a house; callers pass their own richer rows. */
export interface HouseOption {
  unitCode: string;
  propertyCode: string;
  propertyName: string;
}

/**
 * Chooses one or more houses, grouped by tower (in the order given). Each
 * option shows `caption(house)` under its code. `wholeTowers` adds one-tap
 * chips that select (or clear) every house of a tower, for costs shared by a
 * tower (Record maintenance).
 */
export default function HousePicker<H extends HouseOption>({
  options,
  value,
  onChange,
  caption,
  label = "Houses",
  helperText,
  disabled,
  required,
  wholeTowers = false,
}: {
  options: H[];
  value: H[];
  onChange: (houses: H[]) => void;
  caption?: (house: H) => string;
  label?: string;
  helperText?: React.ReactNode;
  disabled?: boolean;
  required?: boolean;
  wholeTowers?: boolean;
}) {
  const towers = useMemo(() => {
    const byCode = new Map<string, { code: string; name: string; houses: H[] }>();
    for (const h of options) {
      const tower = byCode.get(h.propertyCode) ?? { code: h.propertyCode, name: h.propertyName, houses: [] };
      tower.houses.push(h);
      byCode.set(h.propertyCode, tower);
    }
    return [...byCode.values()];
  }, [options]);
  const chosen = new Set(value.map((h) => h.unitCode));
  const allOf = (houses: H[]) => houses.every((h) => chosen.has(h.unitCode));

  function toggleTower(houses: H[]) {
    const codes = new Set(houses.map((h) => h.unitCode));
    onChange(allOf(houses) ? value.filter((h) => !codes.has(h.unitCode)) : [...value, ...houses.filter((h) => !chosen.has(h.unitCode))]);
  }

  const field = (
    <Autocomplete
      multiple
      options={options}
      value={value}
      onChange={(_, next) => onChange(next)}
      disabled={disabled}
      groupBy={(h) => `${h.propertyName} (${h.propertyCode})`}
      getOptionLabel={(h) => h.unitCode}
      isOptionEqualToValue={(a, b) => a.unitCode === b.unitCode}
      filterSelectedOptions
      renderOption={(props, h) => {
        const { key, ...rest } = props;
        const text = caption?.(h);
        return (
          <li key={key} {...rest}>
            <Stack>
              <Typography variant="body2">{h.unitCode}</Typography>
              {text ? (
                <Typography variant="caption" color="textSecondary">
                  {text}
                </Typography>
              ) : null}
            </Stack>
          </li>
        );
      }}
      renderValue={(houses, getItemProps) =>
        houses.map((h, index) => {
          const { key, ...itemProps } = getItemProps({ index });
          return <Chip key={key} label={h.unitCode} size="small" {...itemProps} />;
        })
      }
      renderInput={(params) => (
        <TextField {...params} label={label} helperText={helperText} required={required && value.length === 0} />
      )}
    />
  );
  if (!wholeTowers || towers.length === 0) return field;
  return (
    <Stack spacing={1}>
      {field}
      <QuickPicks
        disabled={disabled}
        picks={towers.map((t) => ({
          label: `All of ${t.name}`,
          ariaLabel: `Every house in ${t.name} (${t.houses.length})`,
          selected: allOf(t.houses),
        }))}
        onPick={(index) => toggleTower(towers[index].houses)}
      />
    </Stack>
  );
}
