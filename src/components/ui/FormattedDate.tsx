"use client";

import { useDates } from "./DateFormat";

/**
 * A date in the owner's display format (A36), for JSX in a server-safe
 * component that can't call the hook: `date` is a yyyy-MM-dd key, or an ISO
 * instant with `withTime`.
 */
export default function FormattedDate({ date, withTime = false }: { date: string; withTime?: boolean }) {
  const { formatDate, formatDateTime } = useDates();
  return <>{withTime ? formatDateTime(date) : formatDate(date)}</>;
}
