"use client";

import { catchError, type ErrorInfo } from "next/error";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import { EmptyState } from "@/components/ui/DataDisplay";
import { SectionCard } from "@/components/ui/Surfaces";

/**
 * One card's error state, so a failing section doesn't take the page down
 * (A12). `catchError` lets redirect() / notFound() through, and `retry()`
 * re-fetches just this part. `silent` renders nothing, for header widgets.
 * `wide`: the section is several cards of a `StatCardRow`, so its one error
 * card takes the whole row instead of one card's slot (A26).
 */
function CardError(
  { title, silent, wide }: { title: string; silent?: boolean; wide?: boolean },
  { error, retry }: ErrorInfo
) {
  if (silent) return null;
  const digest = (error as Error & { digest?: string }).digest;
  const card = (
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
  return wide ? <Box data-span="row">{card}</Box> : card;
}

export default catchError(CardError);
