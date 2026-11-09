import type { Metadata } from "next";
import { BrandMark } from "@/components/shell/BrandMark";
import { PublicCard, PublicHeading, PublicLayout } from "@/components/ui";
import { serverApi } from "@/lib/api-client/server";
import TenancyPicker from "./TenancyPicker";

export const metadata: Metadata = { title: "Choose a tenancy", robots: { index: false, follow: false } };

// After a phone sign-in with several tenancies on that number (A32): only
// those, never anyone else's. No session -> /tenant/login (serverApi).
export default async function TenancySelectPage() {
  const tenancies = await serverApi.tenant.tenancies();
  return (
    <PublicLayout width="sm">
      <PublicCard>
        <BrandMark />
        <PublicHeading title="Which tenancy?" subtitle="Your number is on more than one tenancy. Choose one to open." />
        <TenancyPicker tenancies={tenancies} />
      </PublicCard>
    </PublicLayout>
  );
}
