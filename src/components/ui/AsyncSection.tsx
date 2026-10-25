import { Suspense } from "react";
import CardErrorBoundary from "./CardErrorBoundary";

/**
 * A part of a page that loads on its own (A12): shows `fallback` (its
 * skeleton) until its async children resolve, and its own error card if they
 * fail, while the rest of the page carries on. Key it by the params its data
 * depends on, so changing one reloads only the sections that need it.
 */
export default function AsyncSection({
  title,
  fallback,
  silent,
  children,
}: {
  /** Heading of the error card. */
  title: string;
  fallback: React.ReactNode;
  /** On error render nothing (header widgets) instead of an error card. */
  silent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <CardErrorBoundary title={title} silent={silent}>
      <Suspense fallback={fallback}>{children}</Suspense>
    </CardErrorBoundary>
  );
}
