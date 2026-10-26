import { AUDIT_ACTIONS, type AuditAction } from "@/lib/types";

// The audit_log (0015, D25) actions: their labels and the "Show" categories.
// The text a row shows (title, details, who) is written by the database when
// the row is inserted (0017, D27); audit_action_label() there must give the
// same labels as ACTIONS here (test/schema.test.ts checks it).

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

// The history tables (Activity, a tenant's Change history; A14): what they
// sort and filter, done by audit_history_page() in SQL on the stored text.
export const AUDIT_TABLE_SORT_FIELDS = ["at", "actorName", "title", "tenantName", "unitCode"] as const;
export const AUDIT_TABLE_FILTER_FIELDS = ["actorName", "title", "tenantName", "unitCode", "details"] as const;
