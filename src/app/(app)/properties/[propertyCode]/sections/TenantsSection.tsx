import PeopleOutlineRoundedIcon from "@mui/icons-material/PeopleOutlineRounded";
import type { PropertyTenantRow } from "@/lib/contracts";
import { EmptyState } from "@/components/ui/DataDisplay";
import PropertyTenantsGrid from "../PropertyTenantsGrid";

/** Tower page: the tenants holding its houses today. */
export default async function TenantsSection({
  tenants,
  propertyName,
}: {
  tenants: Promise<PropertyTenantRow[]>;
  propertyName: string;
}) {
  return (
    <PropertyTenantsGrid
      rows={await tenants}
      propertyName={propertyName}
      emptyState={
        <EmptyState
          icon={<PeopleOutlineRoundedIcon />}
          title="No tenants yet"
          description="Add a tenant to one or more vacant houses, or bulk upload several at once."
        />
      }
    />
  );
}
