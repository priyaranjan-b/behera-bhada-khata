import { TagPill } from "@/components/ui/DataDisplay";
import { tenantKindTags } from "@/lib/domain/tenant";
import type { TenantKind } from "@/lib/types";

/** "Govt" / "Rent paid direct" pills for a government tenant (0016); nothing for anyone else. */
export default function TenantKindTags({ tenantKind, rentTracked }: { tenantKind: TenantKind; rentTracked: boolean }) {
  return (
    <>
      {tenantKindTags({ tenantKind, rentTracked }).map((tag) => (
        <TagPill key={tag} label={tag} />
      ))}
    </>
  );
}
