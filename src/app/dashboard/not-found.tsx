import Button from "@mui/material/Button";
import SearchOffRoundedIcon from "@mui/icons-material/SearchOffRounded";
import Link from "@/components/ui/Link";
import { EmptyState } from "@/components/ui/DataDisplay";
import { SectionCard } from "@/components/ui";

export default function DashboardNotFound() {
  return (
    <SectionCard title="Not found">
      <EmptyState
        icon={<SearchOffRoundedIcon />}
        title="We couldn't find that"
        description="It may have been removed, or the link is wrong."
        action={
          <Button component={Link} href="/dashboard" variant="contained">
            Back to dashboard
          </Button>
        }
      />
    </SectionCard>
  );
}
