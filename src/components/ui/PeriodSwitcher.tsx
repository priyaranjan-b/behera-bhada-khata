import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import Link from "@/components/ui/Link";
import { InsetBox } from "./Surfaces";

/**
 * ‹ Label › : links to the previous and next period (a month on the Overview,
 * a range on Billing). It fills its container, arrows at the ends and the
 * label centred between them: the phone's ContextBar gives it the row.
 */
export default function PeriodSwitcher({
  label,
  prevHref,
  nextHref,
  unit = "month",
  onStep,
}: {
  label: string;
  prevHref: string;
  nextHref: string;
  /** For the buttons' accessible names: "Previous month" / "Next months"… */
  unit?: string;
  /**
   * Changes the period in place instead of navigating (-1 / +1; the Overview, A31).
   * The arrows stay links, so a new tab or a copied link still opens that period.
   */
  onStep?: (step: -1 | 1) => void;
}) {
  const clickFor = (step: -1 | 1) =>
    onStep &&
    ((event: React.MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      onStep(step);
    });
  return (
    <InsetBox fill>
      <IconButton component={Link} href={prevHref} onClick={clickFor(-1)} size="small" aria-label={`Previous ${unit}`}>
        <ChevronLeftRoundedIcon fontSize="small" />
      </IconButton>
      <Typography variant="subtitle2" align="center" noWrap sx={{ minWidth: 128, flex: 1 }} aria-live="polite">
        {label}
      </Typography>
      <IconButton component={Link} href={nextHref} onClick={clickFor(1)} size="small" aria-label={`Next ${unit}`}>
        <ChevronRightRoundedIcon fontSize="small" />
      </IconButton>
    </InsetBox>
  );
}
