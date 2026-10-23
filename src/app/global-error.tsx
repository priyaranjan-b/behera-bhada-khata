"use client";

import Button from "@mui/material/Button";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import ThemeRegistry from "@/components/ThemeRegistry";
import { EmptyState } from "@/components/ui/DataDisplay";
import { PublicCard, PublicLayout } from "@/components/ui";

// Replaces the root layout when it fails, so it brings its own document and theme.
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body>
        <title>Something went wrong · Behera Bhada Khata</title>
        <ThemeRegistry>
          <PublicLayout width="sm">
            <PublicCard>
              <EmptyState
                icon={<ErrorOutlineRoundedIcon />}
                title="Something went wrong"
                description={error.digest ? `Error reference: ${error.digest}` : "Please try again."}
                action={
                  <Button variant="contained" onClick={() => retry()}>
                    Try again
                  </Button>
                }
              />
            </PublicCard>
          </PublicLayout>
        </ThemeRegistry>
      </body>
    </html>
  );
}
