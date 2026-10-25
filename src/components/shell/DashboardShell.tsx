"use client";

import { usePathname } from "next/navigation";
import AppLayout, { type AppTab } from "@/components/shell/AppLayout";

// The dashboard layout is a Server Component and can't read the pathname, so
// this thin client wrapper derives the active nav tab from the URL.
// (Breadcrumbs derive themselves — see shell/AppBreadcrumbs.)
function tabForPath(pathname: string): AppTab | undefined {
  if (pathname === "/dashboard") return "summary";
  // Quick-add pages before their sections, so the shortcut is the one highlighted.
  if (pathname === "/dashboard/tenants/new") return "addTenant";
  if (pathname === "/dashboard/houses/new") return "addHouse";
  if (pathname.startsWith("/dashboard/properties")) return "properties";
  if (pathname.startsWith("/dashboard/houses")) return "houses";
  if (pathname.startsWith("/dashboard/tenants")) return "tenants";
  if (pathname.startsWith("/dashboard/defaulters")) return "defaulters";
  if (pathname.startsWith("/dashboard/activity")) return "activity";
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
