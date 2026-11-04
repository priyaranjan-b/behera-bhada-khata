import SearchOffRoundedIcon from "@mui/icons-material/SearchOffRounded";
import { EmptyState } from "@/components/ui/DataDisplay";
import { SectionCard } from "@/components/ui";
import LinkButton from "@/components/ui/Loading/LinkButton";
import { routes } from "@/lib/routes";

export default function MaintenanceExpenseNotFound() {
  return (
    <SectionCard title="Expense not found">
      <EmptyState
        icon={<SearchOffRoundedIcon />}
        title="We couldn't find that expense"
        description="The link may be wrong."
        action={
          <LinkButton href={routes.maintenance.list()} variant="contained">
            Back to maintenance
          </LinkButton>
        }
      />
    </SectionCard>
  );
}
