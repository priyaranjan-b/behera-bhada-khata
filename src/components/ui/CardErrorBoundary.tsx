"use client";

import { catchError, type ErrorInfo } from "next/error";
import Button from "@mui/material/Button";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import { EmptyState } from "@/components/ui/DataDisplay";
import { SectionCard } from "@/components/ui/Surfaces";

/**
 * One card's error state, so a failing section doesn't take the page down
 * (A12). `catchError` lets redirect() / notFound() through, and `retry()`
 * re-fetches just this part. `silent` renders nothing, for header widgets.
 */
function CardError({ title, silent }: { title: string; silent?: boolean }, { error, retry }: ErrorInfo) {
  if (silent) return null;
  const digest = (error as Error & { digest?: string }).digest;
  return (
    <SectionCard title={title} fill>
      <EmptyState
        icon={<ErrorOutlineRoundedIcon />}
        title="Couldn't load this"
        description={digest ? `Error reference: ${digest}` : "Please try again."}
        action={
          <Button variant="outlined" size="small" onClick={() => retry()}>
            Try again
          </Button>
        }
      />
    </SectionCard>
  );
}

export default catchError(CardError);
