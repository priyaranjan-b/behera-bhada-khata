import { notFound } from "next/navigation";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { createClient } from "@/lib/supabase/server";
import BulkTenantUpload from "./BulkTenantUpload";

export default async function BulkTenantUploadPage({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;
  const supabase = await createClient();
  const { data: property } = await supabase.from("properties").select("id, name").eq("id", propertyId).single();
  if (!property) notFound();

  return (
    <Stack spacing={3}>
      <Typography variant="h5" sx={{ fontWeight: 700 }}>
        Bulk upload tenants · {property.name}
      </Typography>
      <BulkTenantUpload propertyId={propertyId} />
    </Stack>
  );
}
