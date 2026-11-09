"use client";

import Button from "@mui/material/Button";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import { EmptyState } from "@/components/ui/DataDisplay";
import { SectionCard } from "@/components/ui";

export default function TenantPortalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <SectionCard title="Couldn't load your account">
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
    </SectionCard>
  );
}
