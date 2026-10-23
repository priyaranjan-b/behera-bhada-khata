"use client";

import Button from "@mui/material/Button";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import { EmptyState } from "@/components/ui/DataDisplay";
import { PublicCard, PublicLayout } from "@/components/ui";

export default function RootError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
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
  );
}
