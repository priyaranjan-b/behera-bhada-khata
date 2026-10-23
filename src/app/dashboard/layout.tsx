import { serverApi } from "@/lib/api-client/server";
import DashboardShell from "@/components/DashboardShell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // The proxy already redirects signed-out visitors; this is the authoritative
  // check (no session -> serverApi redirects to /login).
  const session = await serverApi.auth.session();
  return <DashboardShell ownerEmail={session.email}>{children}</DashboardShell>;
}
