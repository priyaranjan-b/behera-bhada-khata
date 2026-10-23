import Button from "@mui/material/Button";
import SearchOffRoundedIcon from "@mui/icons-material/SearchOffRounded";
import Link from "@/components/ui/Link";
import { EmptyState } from "@/components/ui/DataDisplay";
import { PublicCard, PublicLayout } from "@/components/ui";

export default function NotFound() {
  return (
    <PublicLayout width="sm">
      <PublicCard>
        <EmptyState
          icon={<SearchOffRoundedIcon />}
          title="Page not found"
          description="This page doesn't exist or has moved."
          action={
            <Button component={Link} href="/" variant="contained">
              Go home
            </Button>
          }
        />
      </PublicCard>
    </PublicLayout>
  );
}
