import { SectionCard } from "@/components/ui";
import AuditTimeline from "@/components/domain/AuditTimeline";
import { serverApi } from "@/lib/api-client/server";

/** Every change to this tenant (audit_log), streamed in after the rest of the page. */
export default async function TenantChangeHistory({ tenantId }: { tenantId: string }) {
  const initial = await serverApi.dashboard.tenants.history(tenantId);
  return (
    <SectionCard title="Change history" caption="Who changed what, and when">
      <AuditTimeline source={{ kind: "tenant", tenantId }} initial={initial} />
    </SectionCard>
  );
}
