"use client";

import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import type { Theme } from "@mui/material/styles";
import { embeddedIconButton } from "@/theme/embeddedIconButton";
import { FILTER_CHIP_MAX_WIDTH } from "./styles";

/**
 * One active filter under the phone toolbar (A30): its text, and a real
 * "Remove …" button for ✕. MUI's own delete icon is a hidden SVG about 18px
 * across inside a chip that is itself a button. Here the ✕ is a labelled
 * button whose tap area reaches about 44px past its small icon.
 */
export default function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <Tooltip title={label}>
      <Chip
        color="primary"
        variant="outlined"
        sx={{ flexShrink: 0, maxWidth: FILTER_CHIP_MAX_WIDTH, pr: 0.25, "& .MuiChip-label": { pr: 0 } }}
        label={
          <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", minWidth: 0 }}>
            <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis" }}>
              {label}
            </Box>
            <IconButton
              aria-label={`Remove ${label}`}
              onClick={onRemove}
              sx={(theme: Theme) => ({
                ...embeddedIconButton(theme, 24),
                flexShrink: 0,
                position: "relative",
                // A bigger, invisible target than the 24px icon.
                "&::before": { content: '""', position: "absolute", inset: -10 },
              })}
            >
              <CloseRoundedIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Stack>
        }
      />
    </Tooltip>
  );
}
