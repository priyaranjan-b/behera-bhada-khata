"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import InputAdornment from "@mui/material/InputAdornment";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import QuickPicks from "../QuickPicks";
import {
  emptyNumberValue,
  NUMBER_OPERATORS,
  type ColumnFilterValue,
  type FilterColumn,
  type NumberFilterValue,
  type NumberOperator,
} from "./columnFilter";
import { NUMBER_OPERATOR_MIN_WIDTH } from "./styles";
import type { useColumnFilter } from "./useColumnFilter";
import { useDelayedCommit } from "./useDelayedCommit";

/**
 * The filter sheet's column filter (A30): pick a column, then its one
 * control - chips, a "contains" box, or at least / at most / exactly. The
 * free grid keeps a single column filter, so another column replaces it.
 */
export default function ColumnFilterSection({ columns, current, set, clear, label }: ReturnType<typeof useColumnFilter>) {
  const currentField = current.state === "simple" ? current.column.field : undefined;
  const [picked, setPicked] = useState(currentField ?? columns[0]?.field ?? "");
  // The column set can change under the sheet (a column shown only in one view).
  const chosen = columns.find((c) => c.field === picked) ?? columns[0];
  const field = chosen?.field ?? "";
  const value = current.state === "simple" && current.column.field === field ? current.value : undefined;
  const replaces = current.state !== "none" && field !== currentField ? label : null;

  return (
    <Stack spacing={1.25} component="section" aria-label="Filter by column">
      <Box>
        <Typography variant="subtitle2" component="h3" sx={{ fontWeight: 600 }}>
          Filter by column
        </Typography>
        <Typography variant="caption" color="textSecondary" component="p">
          One column at a time{replaces ? `: setting this replaces “${replaces}”` : ""}
        </Typography>
      </Box>

      {current.state === "other" ? (
        <Box>
          <Chip label={label} onDelete={clear} sx={{ maxWidth: "100%" }} />
        </Box>
      ) : null}

      {chosen ? (
        <>
          <TextField select size="small" label="Column" value={field} onChange={(e) => setPicked(e.target.value)} fullWidth>
            {columns.map((c) => (
              <MenuItem key={c.field} value={c.field}>
                {c.label}
              </MenuItem>
            ))}
          </TextField>
          {/* Keyed by column: each control starts from that column's filter. */}
          <ColumnControl key={field} column={chosen} value={value} onChange={(v) => set(field, v)} />
        </>
      ) : null}
    </Stack>
  );
}

function ColumnControl({
  column,
  value,
  onChange,
}: {
  column: FilterColumn;
  value: ColumnFilterValue | undefined;
  onChange: (value: ColumnFilterValue) => void;
}) {
  if (column.kind === "choice") {
    const values = value?.kind === "choice" ? value.values : [];
    return (
      <QuickPicks
        picks={column.options.map((o) => ({
          label: o.label,
          ariaLabel: `${column.label}: ${o.label}`,
          selected: values.includes(o.value),
        }))}
        onPick={(index) => {
          const picked = column.options[index].value;
          const next = values.includes(picked) ? values.filter((v) => v !== picked) : [...values, picked];
          onChange({ kind: "choice", values: next });
        }}
      />
    );
  }
  if (column.kind === "text") {
    return <TextControl column={column} initial={value?.kind === "text" ? value.text : ""} onChange={onChange} />;
  }
  return <NumberControl column={column} initial={value?.kind === "number" ? value : emptyNumberValue()} onChange={onChange} />;
}

function TextControl({
  column,
  initial,
  onChange,
}: {
  column: FilterColumn;
  initial: string;
  onChange: (value: ColumnFilterValue) => void;
}) {
  const [text, setText] = useState(initial);
  const delayed = useDelayedCommit(text, initial, (t) => onChange({ kind: "text", text: t }));
  return (
    <TextField
      size="small"
      fullWidth
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={delayed.flush}
      placeholder={`${column.label} contains…`}
      aria-label={`${column.label} contains`}
      slotProps={{
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <SearchRoundedIcon fontSize="small" />
            </InputAdornment>
          ),
        },
      }}
    />
  );
}

function NumberControl({
  column,
  initial,
  onChange,
}: {
  column: FilterColumn;
  initial: NumberFilterValue;
  onChange: (value: ColumnFilterValue) => void;
}) {
  const [operator, setOperator] = useState<NumberOperator>(initial.operator);
  const [amount, setAmount] = useState(initial.amount);
  const delayed = useDelayedCommit(amount, initial.amount, (a) => onChange({ kind: "number", operator, amount: a }));
  return (
    <Stack direction="row" spacing={1}>
      <TextField
        select
        size="small"
        value={operator}
        aria-label={`${column.label} comparison`}
        onChange={(e) => {
          const next = e.target.value as NumberOperator;
          setOperator(next);
          onChange({ kind: "number", operator: next, amount });
        }}
        sx={{ flex: "0 0 auto", minWidth: NUMBER_OPERATOR_MIN_WIDTH }}
      >
        {NUMBER_OPERATORS.map((op) => (
          <MenuItem key={op.value} value={op.value}>
            {op.label}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        size="small"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        onBlur={delayed.flush}
        placeholder="Amount"
        aria-label={column.label}
        slotProps={{ htmlInput: { inputMode: "decimal" } }}
        sx={{ flex: 1, minWidth: 0 }}
      />
    </Stack>
  );
}
