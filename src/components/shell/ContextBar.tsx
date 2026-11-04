"use client";

import { useId, useState } from "react";
import { useSearchParams } from "next/navigation";
import Badge from "@mui/material/Badge";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import useScrollTrigger from "@mui/material/useScrollTrigger";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import Typography from "@mui/material/Typography";
import BottomSheet from "@/components/ui/BottomSheet";
import { InSheetContext } from "@/components/ui/inSheet";
import { LinkButton } from "@/components/ui/Loading";
import { MOBILE_NAVBAR_HEIGHT, TOPBAR_HEIGHT } from "./nav";
import { topBarGlassSx } from "./surface";

const SHEET_TITLE = "View options";

/**
 * The report pages' period and view controls (A24), pinned under the top bar
 * so they stay in reach while the figures scroll. Only the pages it applies
 * to render it, so other pages lose no space and show nothing disabled.
 *
 * - `period`: the ‹ month › switcher, always in the bar.
 * - `options`: the rest (range form, "Include Govt paid direct"). Inline from
 *   `md`; on phones behind a "View options" button with a badge counting
 *   `activeCount` changes, in a bottom sheet that closes once the URL changes.
 */
export default function ContextBar({
  period,
  options,
  activeCount = 0,
  resetHref,
}: {
  period: React.ReactNode;
  options?: React.ReactNode;
  /** Options switched on that the bar doesn't show on phones (paid direct). */
  activeCount?: number;
  /** The page with no params: "Reset to defaults" in the sheet, while the URL has any. */
  resetHref?: string;
}) {
  const scrolled = useScrollTrigger({ disableHysteresis: true, threshold: 4 });
  const sheetId = useId();
  // The sheet belongs to the URL it was opened on: applying an option
  // navigates, which closes it without an effect.
  const search = useSearchParams().toString();
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === search;

  return (
    <Box
      role="toolbar"
      aria-label="Period and view"
      sx={[
        {
          position: "sticky",
          top: { xs: MOBILE_NAVBAR_HEIGHT, md: TOPBAR_HEIGHT },
          zIndex: (theme) => theme.zIndex.appBar - 1,
          mx: { xs: -2, sm: -3 },
          px: { xs: 2, sm: 3 },
          py: 1,
          borderTop: "1px solid",
          borderBottom: "1px solid",
          borderColor: "divider",
        },
        (theme) => topBarGlassSx(theme, scrolled),
      ]}
    >
      <Stack
        direction="row"
        useFlexGap
        sx={{
          alignItems: "center",
          justifyContent: "space-between",
          columnGap: 2,
          rowGap: 1,
          flexWrap: { xs: "nowrap", md: "wrap" },
          minHeight: 44,
        }}
      >
        {period}
        {options ? (
          <>
            <Stack
              direction="row"
              useFlexGap
              sx={{
                display: { xs: "none", md: "flex" },
                alignItems: "center",
                flexWrap: "wrap",
                columnGap: 2,
                rowGap: 1,
                ml: "auto",
              }}
            >
              {options}
            </Stack>
            <IconButton
              sx={{ display: { xs: "inline-flex", md: "none" } }}
              aria-label={activeCount ? `${SHEET_TITLE}, ${activeCount} set` : SHEET_TITLE}
              aria-haspopup="dialog"
              aria-expanded={open}
              aria-controls={open ? sheetId : undefined}
              onClick={() => setOpenOn(search)}
            >
              <Badge color="primary" badgeContent={activeCount} invisible={!activeCount}>
                <TuneRoundedIcon />
              </Badge>
            </IconButton>
          </>
        ) : null}
      </Stack>
      {options ? (
        <BottomSheet id={sheetId} title={SHEET_TITLE} open={open} onClose={() => setOpenOn(null)}>
          <InSheetContext.Provider value>
            {/* A section that turned out empty (no government tenants) shows the note after it. */}
            <Stack spacing={2} sx={{ "&:empty + *": { display: "block" } }}>
              {options}
            </Stack>
            <Typography variant="body2" color="textSecondary" sx={{ display: "none" }}>
              Nothing to change on this page.
            </Typography>
          </InSheetContext.Provider>
          {resetHref && search ? (
            <LinkButton href={resetHref} variant="text" fullWidth sx={{ mt: 1 }}>
              Reset to defaults
            </LinkButton>
          ) : null}
        </BottomSheet>
      ) : null}
    </Box>
  );
}
