import type { DisplaySettingsView } from "@/lib/contracts";
import DateFormatCard from "../DateFormatCard";

/** Settings: how the app shows dates (A36), streamed on its own call (A12). */
export default async function DatesSection({ settings }: { settings: Promise<DisplaySettingsView> }) {
  return <DateFormatCard current={(await settings).dateFormat} />;
}
