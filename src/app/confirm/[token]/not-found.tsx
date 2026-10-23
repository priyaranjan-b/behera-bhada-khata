import LinkOffRoundedIcon from "@mui/icons-material/LinkOffRounded";
import { EmptyState } from "@/components/ui/DataDisplay";
import { PublicCard, PublicLayout } from "@/components/ui";

export default function ConfirmLinkNotFound() {
  return (
    <PublicLayout width="sm">
      <PublicCard>
        <EmptyState
          icon={<LinkOffRoundedIcon />}
          title="This link isn't valid"
          description="It may have been replaced by a newer link. Ask the owner to send it again."
        />
      </PublicCard>
    </PublicLayout>
  );
}
