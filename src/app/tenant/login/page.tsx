import type { Metadata } from "next";
import TenantLoginForm from "./TenantLoginForm";

export const metadata: Metadata = { title: "Tenant sign-in", robots: { index: false, follow: false } };

// The tenant portal's sign-in (A32). Public: anyone may ask for a code, and
// the answer never says whether the number belongs to a tenant.
export default function TenantLoginPage() {
  return <TenantLoginForm />;
}
