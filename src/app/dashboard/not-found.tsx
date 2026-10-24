import SearchOffRoundedIcon from "@mui/icons-material/SearchOffRounded";
import { EmptyState } from "@/components/ui/DataDisplay";
import { SectionCard } from "@/components/ui";
import LinkButton from "@/components/ui/Loading/LinkButton";
import { routes } from "@/lib/routes";

export default function DashboardNotFound() {
  return (
    <SectionCard title="Not found">
      <EmptyState
        icon={<SearchOffRoundedIcon />}
        title="We couldn't find that"
        description="It may have been removed, or the link is wrong."
        action={
          <LinkButton href={routes.home} variant="contained">
            Back to dashboard
          </LinkButton>
        }
      />
    </SectionCard>
  );
}
