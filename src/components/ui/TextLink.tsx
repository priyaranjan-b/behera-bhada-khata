import MuiLink, { type LinkProps } from "@mui/material/Link";
import Link from "@/components/ui/Link";

/**
 * An inline text link to a page in the app: MUI's Link look over the app's
 * `Link` (next/link with the navigation progress bar). Use it instead of
 * spelling `<MuiLink component={Link}>` in a component.
 */
export default function TextLink({ href, ...props }: Omit<LinkProps, "component" | "href"> & { href: string }) {
  return <MuiLink component={Link} href={href} {...props} />;
}
