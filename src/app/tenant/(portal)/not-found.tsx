import SearchOffRoundedIcon from "@mui/icons-material/SearchOffRounded";
import { EmptyState } from "@/components/ui/DataDisplay";
import { SectionCard } from "@/components/ui";
import LinkButton from "@/components/ui/Loading/LinkButton";
import { routes } from "@/lib/routes";

// A link to someone else's page, receipt or document reads as not found (A32): never "not yours".
export default function TenantPortalNotFound() {
  return (
    <SectionCard title="Not found">
      <EmptyState
        icon={<SearchOffRoundedIcon />}
        title="There's nothing here"
        description="This link doesn't open anything on your account."
        action={
          <LinkButton href={routes.tenantPortal.home()} variant="contained">
            Go to my account
          </LinkButton>
        }
      />
    </SectionCard>
  );
}
