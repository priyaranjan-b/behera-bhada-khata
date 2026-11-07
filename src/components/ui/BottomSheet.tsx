"use client";

import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";

/**
 * A panel that slides up from the bottom of a phone screen (the context
 * bar's view options, a table's filters): grab handle, title, close button,
 * then `children`, which scroll, and an optional `footer` that stays put
 * (e.g. "Clear all" / "Show N rows"), kept clear of the home indicator.
 */
export default function BottomSheet({
  open,
  onClose,
  title,
  id,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** For the opener's `aria-controls`. */
  id?: string;
  children: React.ReactNode;
  /** Actions pinned under the scrolling content. */
  footer?: React.ReactNode;
}) {
  const titleId = id ? `${id}-title` : undefined;
  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          id,
          role: "dialog",
          "aria-labelledby": titleId,
          sx: {
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            maxHeight: "85dvh",
            px: 2,
            pb: "calc(16px + env(safe-area-inset-bottom))",
          },
        },
      }}
    >
      <Box aria-hidden sx={{ width: 36, height: 4, borderRadius: 2, bgcolor: "divider", mx: "auto", mt: 1 }} />
      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", py: 1 }}>
        <Typography id={titleId} variant="subtitle1" component="h2" sx={{ fontWeight: 600 }}>
          {title}
        </Typography>
        <IconButton aria-label={`Close ${title.toLowerCase()}`} onClick={onClose}>
          <CloseRoundedIcon />
        </IconButton>
      </Stack>
      <Box sx={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", mx: -2, px: 2 }}>{children}</Box>
      {footer ? (
        <Stack direction="row" spacing={1} sx={{ borderTop: 1, borderColor: "divider", pt: 1.5, mx: -2, px: 2 }}>
          {footer}
        </Stack>
      ) : null}
    </Drawer>
  );
}
