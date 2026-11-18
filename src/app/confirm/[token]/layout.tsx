import { connection } from "next/server";
import { serverApi } from "@/lib/api-client/server";
import { DateFormatProvider } from "@/components/ui/DateFormatProvider";

// A confirm link has no session: dates follow the owner's display format (A36) through the public read.
export default async function ConfirmLayout({ children }: LayoutProps<"/confirm/[token]">) {
  // Per request, never at build time (a token page is always dynamic; this makes the read say so).
  await connection();
  const { dateFormat } = await serverApi.public.displaySettings();
  return <DateFormatProvider format={dateFormat}>{children}</DateFormatProvider>;
}
