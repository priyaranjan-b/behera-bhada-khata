import { Fragment } from "react";

/**
 * Text parts (strings or JSX, e.g. a <FormattedDate>) joined with " · ",
 * skipping empty ones; null when nothing is left. Server-safe.
 */
export default function JoinedText({ parts }: { parts: React.ReactNode[] }) {
  const shown = parts.filter((p) => p !== null && p !== undefined && p !== false && p !== "");
  if (shown.length === 0) return null;
  return (
    <>
      {shown.map((part, i) => (
        <Fragment key={i}>
          {i > 0 ? " · " : null}
          {part}
        </Fragment>
      ))}
    </>
  );
}
