import Link from "@/components/Link";
import { notFound } from "next/navigation";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemAvatar from "@mui/material/ListItemAvatar";
import ListItemText from "@mui/material/ListItemText";
import Avatar from "@mui/material/Avatar";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import AddIcon from "@mui/icons-material/Add";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import PeopleOutlineIcon from "@mui/icons-material/PeopleOutlineOutlined";
import { createClient } from "@/lib/supabase/server";
import { formatUnitLabel, tenantDisplayName } from "@/lib/tenant";

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export default async function PropertyPage({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;
  const supabase = await createClient();

  const { data: property } = await supabase
    .from("properties")
    .select("id, name, address")
    .eq("id", propertyId)
    .single();

  if (!property) notFound();

  const { data: tenants } = await supabase
    .from("tenants")
    .select("id, name, business_name, unit_type, tower, floor, house_number, phone, status")
    .eq("property_id", propertyId)
    .order("created_at", { ascending: true });

  return (
    <Stack spacing={3}>
      <Box>
        <Stack
          direction="row"
          component={Link}
          href="/dashboard/properties"
          spacing={0.5}
          sx={{ alignItems: "center", color: "text.secondary", textDecoration: "none", width: "fit-content" }}
        >
          <ArrowBackIcon fontSize="inherit" />
          <Typography variant="body2">Properties</Typography>
        </Stack>
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mt: 0.5 }}>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 800 }}>
              {property.name}
            </Typography>
            {property.address ? (
              <Typography variant="body2" color="textSecondary">
                {property.address}
              </Typography>
            ) : null}
          </Box>
          <Stack direction="row" spacing={1.5}>
            <Button
              component={Link}
              href={`/dashboard/properties/${property.id}/tenants/bulk`}
              variant="outlined"
              startIcon={<UploadFileIcon />}
            >
              Bulk upload
            </Button>
            <Button
              component={Link}
              href={`/dashboard/properties/${property.id}/tenants/new`}
              variant="contained"
              startIcon={<AddIcon />}
            >
              Add tenant
            </Button>
          </Stack>
        </Stack>
      </Box>

      {!tenants || tenants.length === 0 ? (
        <Paper sx={{ p: 6, textAlign: "center" }}>
          <PeopleOutlineIcon sx={{ fontSize: 40, color: "text.disabled", mb: 1 }} />
          <Typography variant="body1" sx={{ fontWeight: 600 }}>
            No tenants yet
          </Typography>
          <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
            Add a tenant to start tracking their rent, or bulk upload several at once.
          </Typography>
          <Stack direction="row" spacing={1.5} sx={{ justifyContent: "center" }}>
            <Button
              component={Link}
              href={`/dashboard/properties/${property.id}/tenants/bulk`}
              variant="outlined"
              startIcon={<UploadFileIcon />}
            >
              Bulk upload
            </Button>
            <Button
              component={Link}
              href={`/dashboard/properties/${property.id}/tenants/new`}
              variant="contained"
              startIcon={<AddIcon />}
            >
              Add tenant
            </Button>
          </Stack>
        </Paper>
      ) : (
        <Paper>
          <List disablePadding>
            {tenants.map((tenant) => {
              const displayName = tenantDisplayName(tenant);
              const unitLabel = formatUnitLabel(tenant);
              const secondary = [
                tenant.business_name ? tenant.name : null,
                unitLabel || null,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <ListItemButton key={tenant.id} component={Link} href={`/dashboard/tenants/${tenant.id}`} divider>
                  <ListItemAvatar>
                    <Avatar sx={{ bgcolor: "primary.main" }}>{initials(displayName)}</Avatar>
                  </ListItemAvatar>
                  <ListItemText primary={displayName} secondary={secondary || undefined} />
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <Chip size="small" variant="outlined" label={tenant.unit_type} />
                    <Typography variant="body2" color="textSecondary">
                      {tenant.phone}
                    </Typography>
                  </Stack>
                </ListItemButton>
              );
            })}
          </List>
        </Paper>
      )}
    </Stack>
  );
}
