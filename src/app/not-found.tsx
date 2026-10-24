import SearchOffRoundedIcon from "@mui/icons-material/SearchOffRounded";
import { EmptyState } from "@/components/ui/DataDisplay";
import { PublicCard, PublicLayout } from "@/components/ui";
import LinkButton from "@/components/ui/Loading/LinkButton";

export default function NotFound() {
  return (
    <PublicLayout width="sm">
      <PublicCard>
        <EmptyState
          icon={<SearchOffRoundedIcon />}
          title="Page not found"
          description="This page doesn't exist or has moved."
          action={
            <LinkButton href="/" variant="contained">
              Go home
            </LinkButton>
          }
        />
      </PublicCard>
    </PublicLayout>
  );
}
