"use client";

import { StatusBadge } from "@/components/ui/DataDisplay";
import { useDates } from "@/components/ui/DateFormat";
import { TENANT_STATUS_DISPLAY } from "@/lib/domain/tenant";
import type { TenantStatus } from "@/lib/types";

/** A tenant's status, the same label and tone on every screen. Moved-out tenants show the date when known. */
export default function TenantStatusBadge({
  status,
  movedOutOn,
}: {
  status: TenantStatus;
  movedOutOn?: string | null;
}) {
  const { formatDate } = useDates();
  const { label, tone } = TENANT_STATUS_DISPLAY[status];
  const text = status === "inactive" && movedOutOn ? `${label} ${formatDate(movedOutOn)}` : label;
  return <StatusBadge tone={tone} label={text} />;
}
