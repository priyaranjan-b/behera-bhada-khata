"use client";

import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import { LoadingButton } from "@/components/ui/Loading";
import { api } from "@/lib/api-client";
import { routes } from "@/lib/routes";

/** Ends the tenant session (A32) and goes back to the tenant sign-in, as a full load so no page stays cached. */
export default function TenantSignOutButton() {
  return (
    <LoadingButton
      size="small"
      variant="outlined"
      startIcon={<LogoutRoundedIcon />}
      onClick={async () => {
        await api.tenant.signOut().catch(() => undefined);
        window.location.assign(routes.tenantPortal.login);
      }}
    >
      Sign out
    </LoadingButton>
  );
}
