import Stack from "@mui/material/Stack";
import { serverApi } from "@/lib/api-client/server";
import { PageHeader } from "@/components/ui/DataDisplay";
import TenantForm from "@/components/domain/TenantForm";

export default async function AddTenantPage() {
  const { availableUnits } = await serverApi.dashboard.tenants.newForm();

  return (
    <Stack spacing={2}>
      <PageHeader
        title="Add tenant"
        subtitle="Choose one or more vacant houses from any tower; one rent is billed monthly for all of them."
      />
      <TenantForm mode={{ kind: "create" }} availableUnits={availableUnits} />
    </Stack>
  );
}
