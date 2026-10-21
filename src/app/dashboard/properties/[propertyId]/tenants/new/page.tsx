import { notFound } from "next/navigation";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { createClient } from "@/lib/supabase/server";
import TenantForm from "./TenantForm";

export default async function NewTenantPage({ params }: { params: Promise<{ propertyId: string }> }) {
  const { propertyId } = await params;
  const supabase = await createClient();
  const { data: property } = await supabase.from("properties").select("id").eq("id", propertyId).single();
  if (!property) notFound();

  return (
    <Stack spacing={3}>
      <Typography variant="h5" sx={{ fontWeight: 700 }}>
        Add tenant
      </Typography>
      <TenantForm propertyId={propertyId} />
    </Stack>
  );
}
