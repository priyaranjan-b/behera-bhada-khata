import { formatDateKey, formatDateTime, formatMonth } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import {
  AUDIT_ACTIONS,
  PREFERRED_CHANNELS,
  TENANT_KINDS,
  TENANT_STATUSES,
  UNIT_TYPES,
  type AuditAction,
  type AuditActorKind,
  type PreferredChannel,
  type TenantKind,
  type TenantStatus,
  type UnitType,
} from "@/lib/types";
import { paymentModeLabel } from "./payments";
import {
  PREFERRED_CHANNEL_LABELS,
  TENANT_KIND_LABELS,
  TENANT_STATUS_DISPLAY,
  UNIT_TYPE_LABELS,
  formatFloor,
} from "./tenant";

// How audit_log rows (0015, D25) read on screen and in downloads: one label
// per action, one label and format per column, so no raw value or column
// name ever reaches a user.

export const AUDIT_CATEGORIES = ["tenants", "rent", "houses", "money", "documents", "messages", "access"] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

export const AUDIT_CATEGORY_LABELS: Record<AuditCategory, string> = {
  tenants: "Tenants",
  rent: "Rent",
  houses: "Houses",
  money: "Payments",
  documents: "Documents",
  messages: "Messages",
  access: "Sign-ins & profile",
};

const ACTIONS: Record<AuditAction, { label: string; category: AuditCategory }> = {
  "tenant.created": { label: "Tenant added", category: "tenants" },
  "tenant.updated": { label: "Tenant details changed", category: "tenants" },
  "tenant.activated": { label: "Draft completed, billing started", category: "tenants" },
  "tenant.moved_out": { label: "Moved out", category: "tenants" },
  "billing_start.corrected": { label: "\"Paid up to\" corrected", category: "rent" },
  "rent_tracking.started": { label: "Rent tracking started", category: "rent" },
  "rent_tracking.stopped": { label: "Rent tracking turned off", category: "rent" },
  "tenancy.started": { label: "House added", category: "houses" },
  "tenancy.ended": { label: "House left", category: "houses" },
  "tenancy.changed": { label: "House dates changed", category: "houses" },
  "tenancy.deleted": { label: "House removed", category: "houses" },
  "rent_rate.set": { label: "Rent set", category: "rent" },
  "rent_rate.changed": { label: "Rent changed", category: "rent" },
  "rent_rate.deleted": { label: "Rent removed", category: "rent" },
  "rent_period.repriced": { label: "Month re-priced", category: "rent" },
  "rent_period.deleted": { label: "Month removed", category: "rent" },
  "location.created": { label: "Site added", category: "houses" },
  "location.updated": { label: "Site changed", category: "houses" },
  "property.created": { label: "Tower added", category: "houses" },
  "property.updated": { label: "Tower changed", category: "houses" },
  "unit.created": { label: "House created", category: "houses" },
  "unit.updated": { label: "House details changed", category: "houses" },
  "document.added": { label: "Document added", category: "documents" },
  "document.deleted": { label: "Document deleted", category: "documents" },
  "profile.created": { label: "Profile set up", category: "access" },
  "profile.updated": { label: "Profile changed", category: "access" },
  "payment.recorded": { label: "Payment recorded", category: "money" },
  "payment.acknowledged": { label: "Payment acknowledged by tenant", category: "money" },
  "payment.changed": { label: "Payment changed", category: "money" },
  "adjustment.recorded": { label: "Correction recorded", category: "money" },
  "adjustment.acknowledged": { label: "Correction acknowledged by tenant", category: "money" },
  "adjustment.changed": { label: "Correction changed", category: "money" },
  "owner.created": { label: "Owner account set", category: "access" },
  "owner.updated": { label: "Owner account changed", category: "access" },
  "owner.deleted": { label: "Owner account removed", category: "access" },
  "message.sent": { label: "Link sent to tenant", category: "messages" },
  "receipt.downloaded": { label: "Receipt downloaded", category: "money" },
  "auth.sign_in": { label: "Signed in", category: "access" },
  "auth.sign_in_failed": { label: "Failed sign-in", category: "access" },
  "auth.password_changed": { label: "Password changed", category: "access" },
  "auth.signed_out": { label: "Signed out", category: "access" },
};

export function auditActionLabel(action: AuditAction): string {
  return ACTIONS[action]?.label ?? "Change";
}

export function auditCategoryOf(action: AuditAction): AuditCategory {
  return ACTIONS[action]?.category ?? "tenants";
}

/** The actions an Activity "Show" filter matches. */
export function actionsInCategory(category: AuditCategory): AuditAction[] {
  return AUDIT_ACTIONS.filter((a) => ACTIONS[a].category === category);
}

export const AUDIT_ACTOR_LABELS: Record<AuditActorKind, string> = {
  owner: "Owner",
  tenant: "Tenant",
  system: "System",
  visitor: "Not signed in",
};

type Format =
  | "text"
  | "money"
  | "date"
  | "month"
  | "datetime"
  | "status"
  | "kind"
  | "channel"
  | "unitType"
  | "floor"
  | "mode"
  | "yesNo"
  | "bytes"
  | "presence";

// Shown in this order; columns not listed here are never shown.
const FIELDS: [column: string, label: string, format: Format][] = [
  ["name", "Name", "text"],
  ["business_name", "Business", "text"],
  ["phone", "Phone", "text"],
  ["preferred_channel", "Messages by", "channel"],
  ["status", "Status", "status"],
  ["tenant_kind", "Tenant type", "kind"],
  ["rent_tracked", "Rent tracked here", "yesNo"],
  ["lease_start", "Lease start", "date"],
  ["billing_start", "Billing from", "month"],
  ["moved_out_on", "Moved out on", "date"],
  ["deposit_amount", "Deposit", "money"],
  ["unit_code", "House", "text"],
  ["start_date", "From", "date"],
  ["end_date", "Until", "date"],
  ["effective_month", "From month", "month"],
  ["monthly_amount", "Monthly rent", "money"],
  ["period_month", "Month", "month"],
  ["amount_due", "Rent due", "money"],
  ["receipt_no", "Receipt", "text"],
  ["amount", "Amount", "money"],
  ["delta_amount", "Change", "money"],
  ["payment_date", "Paid on", "date"],
  ["mode", "Mode", "mode"],
  ["reason", "Reason", "text"],
  ["note", "Note", "text"],
  ["acknowledged_at", "Acknowledged", "datetime"],
  ["address", "Address", "text"],
  ["location_code", "Site", "text"],
  ["property_code", "Tower", "text"],
  ["floor", "Floor", "floor"],
  ["unit_type", "Type", "unitType"],
  ["label", "Label", "text"],
  ["is_active", "In use", "yesNo"],
  ["document_type", "Type", "text"],
  ["file_name", "File", "text"],
  ["size_bytes", "Size", "bytes"],
  ["first_name", "First name", "text"],
  ["last_name", "Last name", "text"],
  ["signature_name", "Signs as", "text"],
  ["signature_path", "Saved signature", "presence"],
  ["user_id", "Account", "presence"],
];

const isOneOf = <T extends string>(list: readonly T[], value: unknown): value is T =>
  typeof value === "string" && (list as readonly string[]).includes(value);

function formatValue(value: unknown, format: Format): string {
  if (value === null || value === undefined || value === "") return "—";
  switch (format) {
    case "money":
      return typeof value === "number" || typeof value === "string" ? formatMoney(value) : "—";
    case "date":
      return typeof value === "string" ? formatDateKey(value.slice(0, 10)) : "—";
    case "month":
      return typeof value === "string" ? formatMonth(value.slice(0, 10)) : "—";
    case "datetime":
      return typeof value === "string" ? formatDateTime(value) : "—";
    case "status":
      return isOneOf<TenantStatus>(TENANT_STATUSES, value) ? TENANT_STATUS_DISPLAY[value].label : "—";
    case "kind":
      return isOneOf<TenantKind>(TENANT_KINDS, value) ? TENANT_KIND_LABELS[value] : "—";
    case "channel":
      return isOneOf<PreferredChannel>(PREFERRED_CHANNELS, value) ? PREFERRED_CHANNEL_LABELS[value] : "—";
    case "unitType":
      return isOneOf<UnitType>(UNIT_TYPES, value) ? UNIT_TYPE_LABELS[value] : "—";
    case "floor":
      return typeof value === "string" ? formatFloor(value) : "—";
    case "mode":
      return typeof value === "string" ? paymentModeLabel(value) : "—";
    case "yesNo":
      return value === true ? "Yes" : "No";
    case "bytes":
      return typeof value === "number" ? `${Math.max(1, Math.round(value / 1024))} KB` : "—";
    case "presence":
      return "set";
    default:
      return String(value);
  }
}

function changeLine(label: string, format: Format, [before, after]: [unknown, unknown], snapshot: boolean): string {
  if (format === "presence") {
    if (before === null || before === undefined) return `${label} added`;
    if (after === null || after === undefined) return `${label} removed`;
    return `${label} replaced`;
  }
  if (snapshot) return `${label}: ${formatValue(after ?? before, format)}`;
  return `${label}: ${formatValue(before, format)} → ${formatValue(after, format)}`;
}

const CHANNEL_SENT: Record<string, string> = { whatsapp: "WhatsApp", sms: "SMS", both: "WhatsApp + SMS" };
const SIGN_IN_METHODS: Record<string, string> = { password: "Password", email_link: "Email link" };

function contextLines(action: AuditAction, context: Record<string, unknown>): string[] {
  const lines: string[] = [];
  const receipt = typeof context.receiptNo === "string" ? `Receipt ${context.receiptNo}` : null;
  if (action === "message.sent") {
    const channel = typeof context.channel === "string" ? (CHANNEL_SENT[context.channel] ?? "Message") : "Message";
    lines.push(`${channel} · ${context.delivered ? "delivered" : "not delivered"}`);
    if (receipt) lines.push(receipt);
  } else if (action === "receipt.downloaded") {
    if (receipt) lines.push(receipt);
  } else if (action.startsWith("auth.")) {
    const method = typeof context.method === "string" ? SIGN_IN_METHODS[context.method] : undefined;
    if (method) lines.push(method);
    if (context.reason === "not_owner") lines.push("The account isn't the owner's");
    else if (context.knownEmail === false) lines.push("Not an owner email");
    else if (context.reason === "wrong_password") lines.push("Wrong password");
  }
  return lines;
}

export interface AuditDescription {
  title: string;
  lines: string[];
}

/** Title and readable lines for one entry: "Rent changed" / "Monthly rent: ₹5,000 → ₹6,000". */
export function describeAuditEntry(entry: {
  action: AuditAction;
  changes: Record<string, [unknown, unknown]>;
  context: Record<string, unknown>;
}): AuditDescription {
  const [, verb] = entry.action.split(".");
  // A new or removed row lists its values; an edit shows before → after.
  const snapshot = ["created", "recorded", "added", "set", "started", "deleted"].includes(verb);
  const lines = FIELDS.filter(([column]) => column in entry.changes).map(([column, label, format]) =>
    changeLine(label, format, entry.changes[column], snapshot)
  );
  const notDelivered = entry.action === "message.sent" && !entry.context.delivered;
  return {
    title: notDelivered ? "Link not delivered to tenant" : auditActionLabel(entry.action),
    lines: [...lines, ...contextLines(entry.action, entry.context)],
  };
}
