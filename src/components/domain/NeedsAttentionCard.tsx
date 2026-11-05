import Link from "@/components/ui/Link";
import MuiLink from "@mui/material/Link";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import TaskAltRoundedIcon from "@mui/icons-material/TaskAltRounded";
import { DetailList, SectionCard } from "@/components/ui";
import { EmptyState, StatusBadge } from "@/components/ui/DataDisplay";
import MoreOnPhone from "@/components/ui/MoreOnPhone";
import type { AttentionItem } from "@/lib/domain/overview";
import { routes } from "@/lib/routes";

/** How many tenants each item names before "+N more". */
const NAMES_SHOWN = 4;

/** How many items a phone shows before "Show N more" (a long card pushes the rest of the Overview down). */
const PHONE_ITEMS = 3;

/** Overview: housekeeping that needs the owner - drafts, missing documents, unsigned receipts, rent revisions. */
export default function NeedsAttentionCard({ items }: { items: AttentionItem[] }) {
  return (
    <SectionCard title="Needs attention" fill>
      {items.length === 0 ? (
        <EmptyState icon={<TaskAltRoundedIcon />} title="All caught up" description="Nothing needs your attention." />
      ) : (
        <Stack spacing={1}>
          <DetailList dividers>
            {items.slice(0, PHONE_ITEMS).map(attentionRow)}
          </DetailList>
          <MoreOnPhone count={items.length - PHONE_ITEMS}>
            <Stack spacing={1}>
              <Divider flexItem />
              <DetailList dividers>
                {items.slice(PHONE_ITEMS).map(attentionRow)}
              </DetailList>
            </Stack>
          </MoreOnPhone>
        </Stack>
      )}
    </SectionCard>
  );
}

/** One item: its title and count, what to do, and the first tenants it names. */
function attentionRow(item: AttentionItem) {
  const more = item.tenants.length - NAMES_SHOWN;
  return (
    <Stack key={item.kind} spacing={0.5}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {item.title}
        </Typography>
        <StatusBadge tone="warning" label={String(item.tenants.length)} />
      </Stack>
      <Typography variant="caption" color="textSecondary">
        {item.hint}
      </Typography>
      <Typography variant="body2">
        {item.tenants.slice(0, NAMES_SHOWN).map((t, i) => (
          <span key={t.tenantId}>
            {i > 0 ? ", " : null}
            <MuiLink component={Link} href={routes.tenants.detail(t.tenantId)}>
              {t.displayName}
            </MuiLink>
          </span>
        ))}
        {more > 0 ? (
          item.kind === "drafts" ? (
            <>
              {" "}
              <MuiLink component={Link} href={routes.tenants.list({ show: "drafts" })}>
                +{more} more
              </MuiLink>
            </>
          ) : (
            ` +${more} more`
          )
        ) : null}
      </Typography>
    </Stack>
  );
}
