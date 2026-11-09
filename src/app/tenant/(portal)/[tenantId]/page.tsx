import { notFound, redirect } from "next/navigation";
import { serverApi } from "@/lib/api-client/server";
import { routes } from "@/lib/routes";

// /tenant/<id>, e.g. from an old shared link (A32): the session decides whose
// page it is, so the id only has to match it - then /tenant; anyone else's
// id is "not found", never a hint that it exists.
export default async function TenantIdRedirect({ params }: PageProps<"/tenant/[tenantId]">) {
  const { tenantId } = await params;
  const { tenant } = await serverApi.tenant.profile();
  if (tenant.id !== tenantId) notFound();
  redirect(routes.tenantPortal.home());
}
