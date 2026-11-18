import type { Metadata } from "next";
import { connection } from "next/server";
import { BrandMark } from "@/components/shell/BrandMark";
import { PublicCard, PublicHeading, PublicLayout } from "@/components/ui";
import { serverApi } from "@/lib/api-client/server";
import TenancyPicker from "./TenancyPicker";
import { DateFormatProvider } from "@/components/ui/DateFormatProvider";

export const metadata: Metadata = { title: "Choose a tenancy", robots: { index: false, follow: false } };

// After a phone sign-in with several tenancies on that number (A32): only
// those, never anyone else's. No session -> /tenant/login (serverApi).
export default async function TenancySelectPage() {
  // Per request, never at build time (the read of the date format would otherwise run while prerendering).
  await connection();
  const [tenancies, display] = await Promise.all([serverApi.tenant.tenancies(), serverApi.public.displaySettings()]);
  return (
    <DateFormatProvider format={display.dateFormat}>
      <PublicLayout width="sm">
        <PublicCard>
          <BrandMark />
          <PublicHeading title="Which tenancy?" subtitle="Your number is on more than one tenancy. Choose one to open." />
          <TenancyPicker tenancies={tenancies} />
        </PublicCard>
      </PublicLayout>
    </DateFormatProvider>
  );
}
