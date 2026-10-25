import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import Link from "@/components/ui/Link";
import { InsetBox } from "./Surfaces";

/** ‹ Label › : links to the previous and next period (a month on the Overview, a range on Billing). */
export default function PeriodSwitcher({
  label,
  prevHref,
  nextHref,
  unit = "month",
}: {
  label: string;
  prevHref: string;
  nextHref: string;
  /** For the buttons' accessible names: "Previous month" / "Next months"… */
  unit?: string;
}) {
  return (
    <InsetBox>
      <IconButton component={Link} href={prevHref} size="small" aria-label={`Previous ${unit}`}>
        <ChevronLeftRoundedIcon fontSize="small" />
      </IconButton>
      <Typography variant="subtitle2" align="center" noWrap sx={{ minWidth: 128 }} aria-live="polite">
        {label}
      </Typography>
      <IconButton component={Link} href={nextHref} size="small" aria-label={`Next ${unit}`}>
        <ChevronRightRoundedIcon fontSize="small" />
      </IconButton>
    </InsetBox>
  );
}
