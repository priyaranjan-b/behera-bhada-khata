import { TagPill } from "@/components/ui/DataDisplay";
import { tenantTypeTags } from "@/lib/domain/tenant";
import type { TenantKind } from "@/lib/types";

/** The tenant's type as pills: "Individual", "Business", or "Government" (+ "Rent paid direct", 0016). */
export default function TenantKindTags({ tenantKind, rentTracked }: { tenantKind: TenantKind; rentTracked: boolean }) {
  return (
    <>
      {tenantTypeTags({ tenantKind, rentTracked }).map((tag) => (
        <TagPill key={tag} label={tag} />
      ))}
    </>
  );
}
