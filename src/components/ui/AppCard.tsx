// The app's one card surface. Server-safe (no "use client"): the look lives
// in the theme (Card `variant="raised"`, src/theme/customizations/app.ts), so
// Server Component pages can render it directly.
import Card, { type CardProps } from "@mui/material/Card";
import Link from "@/components/ui/Link";

export type AppCardProps = Omit<CardProps, "variant" | "raised" | "component"> & {
  /** `raised` (default): layered 3D shadow. `flat`: border only, for dashed/inset surfaces. */
  depth?: "raised" | "flat";
  /** Lifts on hover / keyboard focus. Implied by `href`. */
  interactive?: boolean;
  /** Makes the whole card one link (keep interactive controls out of it). */
  href?: string;
  /** Semantic element, e.g. "section". Ignored when `href` is set. */
  component?: React.ElementType;
};

export default function AppCard({ depth = "raised", interactive, href, component, ...props }: AppCardProps) {
  const lift = interactive ?? Boolean(href);
  return (
    <Card
      variant={depth === "raised" ? "raised" : "outlined"}
      {...(href ? { component: Link, href } : component ? { component } : {})}
      {...(lift ? { "data-interactive": "" } : {})}
      {...props}
    />
  );
}
