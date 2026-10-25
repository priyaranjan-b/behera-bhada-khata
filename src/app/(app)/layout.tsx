import { redirect } from "next/navigation";
import { serverApi } from "@/lib/api-client/server";
import { routes } from "@/lib/routes";
import DashboardShell from "@/components/shell/DashboardShell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // The proxy already redirects signed-out visitors; this is the authoritative
  // check (no session -> serverApi redirects to /login, and the owner-only
  // profile read sends a non-owner to /login?error=owner). Both share one
  // session check (getSession is cached per render), so they run together.
  const [session, profile] = await Promise.all([serverApi.auth.session(), serverApi.dashboard.profile()]);
  // Not the owner: send them back to sign in with a clear message.
  if (!session.isOwner) redirect(routes.login({ error: "owner" }));
  return (
    <DashboardShell ownerEmail={session.email} ownerName={profile.displayName ?? undefined}>
      {children}
    </DashboardShell>
  );
}
