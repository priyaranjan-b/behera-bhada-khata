import Link from "@/components/ui/Link";
import MuiLink from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import TaskAltRoundedIcon from "@mui/icons-material/TaskAltRounded";
import { DetailList, SectionCard } from "@/components/ui";
import { EmptyState, StatusBadge } from "@/components/ui/DataDisplay";
import type { AttentionItem } from "@/lib/domain/overview";
import { routes } from "@/lib/routes";

/** How many tenants each item names before "+N more". */
const NAMES_SHOWN = 4;

/** Overview: housekeeping that needs the owner - drafts, missing documents, unsigned receipts, rent revisions. */
export default function NeedsAttentionCard({ items }: { items: AttentionItem[] }) {
  return (
    <SectionCard title="Needs attention" fill>
      {items.length === 0 ? (
        <EmptyState icon={<TaskAltRoundedIcon />} title="All caught up" description="Nothing needs your attention." />
      ) : (
        <DetailList dividers>
          {items.map((item) => {
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
          })}
        </DetailList>
      )}
    </SectionCard>
  );
}
