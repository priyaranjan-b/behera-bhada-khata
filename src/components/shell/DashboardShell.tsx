"use client";

import { usePathname } from "next/navigation";
import AppLayout, { type AppTab } from "@/components/shell/AppLayout";

// The dashboard layout is a Server Component and can't read the pathname, so
// this thin client wrapper derives the active nav tab from the URL.
// (Breadcrumbs derive themselves — see shell/AppBreadcrumbs.)
function tabForPath(pathname: string): AppTab | undefined {
  if (pathname === "/dashboard") return "summary";
  if (pathname.startsWith("/dashboard/properties")) return "properties";
  if (pathname.startsWith("/dashboard/tenants")) return "tenants";
  return undefined;
}

export default function DashboardShell({ children, ownerEmail }: { children: React.ReactNode; ownerEmail?: string }) {
  const pathname = usePathname();
  return (
    <AppLayout currentTab={tabForPath(pathname)} ownerEmail={ownerEmail}>
      {children}
    </AppLayout>
  );
}
