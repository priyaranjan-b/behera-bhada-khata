"use client";

import { useAppRouter } from "@/components/ui/Loading";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import Box from "@mui/material/Box";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";

/**
 * Dialog for an intercepted route (`@modal/(.)…/page.tsx`): the page behind
 * stays mounted and the URL is the form's own, so closing is `router.back()`.
 * Full screen on phones.
 */
export function RouteModal({
  title,
  subtitle,
  maxWidth = "lg",
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  maxWidth?: "sm" | "md" | "lg";
  children: React.ReactNode;
}) {
  const router = useAppRouter();
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));

  return (
    <Dialog open onClose={() => router.back()} fullWidth maxWidth={maxWidth} fullScreen={fullScreen}>
      <DialogTitle component="div">
        <Stack direction="row" spacing={2} sx={{ alignItems: "flex-start", justifyContent: "space-between" }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography component="h2" variant="h5">
              {title}
            </Typography>
            {subtitle ? (
              <Typography variant="body2" color="textSecondary">
                {subtitle}
              </Typography>
            ) : null}
          </Box>
          <IconButton aria-label="Close" onClick={() => router.back()} size="small">
            <CloseRoundedIcon fontSize="small" />
          </IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent>{children}</DialogContent>
    </Dialog>
  );
}
