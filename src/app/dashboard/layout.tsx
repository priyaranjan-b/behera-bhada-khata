import { redirect } from "next/navigation";
import { serverApi } from "@/lib/api-client/server";
import DashboardShell from "@/components/shell/DashboardShell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // The proxy already redirects signed-out visitors; this is the authoritative
  // check (no session -> serverApi redirects to /login).
  const session = await serverApi.auth.session();
  // Not the owner: send them back to sign in with a clear message.
  if (!session.isOwner) redirect("/login?error=owner");
  return <DashboardShell ownerEmail={session.email}>{children}</DashboardShell>;
}
