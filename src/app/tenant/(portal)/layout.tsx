import type { Metadata } from "next";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { BrandMark } from "@/components/shell/BrandMark";
import { PublicLayout } from "@/components/ui";
import LinkButton from "@/components/ui/Loading/LinkButton";
import { serverApi } from "@/lib/api-client/server";
import { routes } from "@/lib/routes";
import TenantSignOutButton from "./TenantSignOutButton";

export const metadata: Metadata = { title: "My rent", robots: { index: false, follow: false } };

// The tenant portal's frame (A32): no owner shell, menu or search - just who
// is signed in and Sign out. The session check here is for the header only;
// every read on the page checks the tenant session again (serverApi.tenant).
export default async function TenantPortalLayout({ children }: LayoutProps<"/tenant">) {
  const session = await serverApi.tenant.session();
  return (
    <PublicLayout width="lg" align="top">
      <Stack spacing={3}>
        <Stack direction="row" spacing={2} sx={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }} useFlexGap>
          <BrandMark />
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Typography variant="body2" color="textSecondary" noWrap sx={{ display: { xs: "none", sm: "block" } }}>
              {session.displayName}
            </Typography>
            {session.canSwitch ? (
              <LinkButton href={routes.tenantPortal.select} size="small">
                Switch
              </LinkButton>
            ) : null}
            <TenantSignOutButton />
          </Stack>
        </Stack>
        {children}
      </Stack>
    </PublicLayout>
  );
}
