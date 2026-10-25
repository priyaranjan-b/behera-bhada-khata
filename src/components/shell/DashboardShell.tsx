"use client";

import { usePathname } from "next/navigation";
import AppLayout, { type AppTab } from "@/components/shell/AppLayout";
import { routes } from "@/lib/routes";

// The dashboard layout is a Server Component and can't read the pathname, so
// this thin client wrapper derives the active nav tab from the URL.
// (Breadcrumbs derive themselves — see shell/AppBreadcrumbs.)
function tabForPath(pathname: string): AppTab | undefined {
  if (pathname === routes.home) return "summary";
  // Quick-add pages before their sections, so the shortcut is the one highlighted.
  if (pathname === routes.tenants.new) return "addTenant";
  if (pathname === routes.houses.new) return "addHouse";
  const under = (section: string) => pathname === section || pathname.startsWith(`${section}/`);
  if (under(routes.properties.list)) return "properties";
  if (under(routes.houses.list())) return "houses";
  if (under(routes.tenants.list())) return "tenants";
  if (under(routes.defaulters)) return "defaulters";
  if (under(routes.billing())) return "billing";
  if (under(routes.activity)) return "activity";
  return undefined;
}

export default function DashboardShell({
  children,
  ownerEmail,
  ownerName,
}: {
  children: React.ReactNode;
  ownerEmail?: string;
  /** From the Profile page (owner_profile); falls back to the email. */
  ownerName?: string;
}) {
  const pathname = usePathname();
  return (
    <AppLayout currentTab={tabForPath(pathname)} ownerEmail={ownerEmail} ownerName={ownerName}>
      {children}
    </AppLayout>
  );
}
