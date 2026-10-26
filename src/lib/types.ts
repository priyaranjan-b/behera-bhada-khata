// Hand-written to match supabase/migrations/*.sql (tables, the rent_periods ->
// tenants relationship the adapter embeds, and the RPC functions); update it
// in the same change as any migration. To check it against a real project,
// `npm run db:types` (needs the Supabase CLI and SUPABASE_PROJECT_ID) writes
// the generated types to src/lib/database.generated.ts (git-ignored) to diff
// against. test/schema.test.ts checks the migrations themselves.

// Each enum is one `as const` array: zod schemas, <select> options and labels
// (src/lib/domain/*) are built from it, so a new value is a one-line change.
export const UNIT_TYPES = ["residential", "commercial"] as const;
export type UnitType = (typeof UNIT_TYPES)[number];
export const PREFERRED_CHANNELS = ["both", "whatsapp", "sms"] as const;
export type PreferredChannel = (typeof PREFERRED_CHANNELS)[number];
/** draft = from the paper register, details incomplete, never billed (0007). */
export const TENANT_STATUSES = ["draft", "active", "inactive"] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];
/** Who the tenant is (0016); only a government tenant may skip the phone or rent tracking. */
export const TENANT_KINDS = ["individual", "business", "government"] as const;
export type TenantKind = (typeof TENANT_KINDS)[number];
/** Whether reports include government rent paid to the owner directly (A11). */
export const PAID_DIRECT_VIEWS = ["show", "hide"] as const;
export type PaidDirectView = (typeof PAID_DIRECT_VIEWS)[number];
/** The two kinds of ledger record; each has its own receipt and confirm link. */
export const RECORD_TYPES = ["payment", "adjustment"] as const;
export type RecordType = (typeof RECORD_TYPES)[number];
export type PeriodStatus = "pending" | "partially_paid" | "paid";
export const PAYMENT_MODES = ["cash", "bank_transfer", "upi", "cheque", "other"] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];
export type LedgerStatus = "pending" | "confirmed";
/** Who made an audited change (0015). */
export const AUDIT_ACTOR_KINDS = ["owner", "tenant", "system", "visitor"] as const;
export type AuditActorKind = (typeof AUDIT_ACTOR_KINDS)[number];
/**
 * Every action audit_log records (0015): table changes from audit_row_change()
 * and the app events log_event() accepts (APP_AUDIT_ACTIONS).
 */
export const APP_AUDIT_ACTIONS = [
  "message.sent",
  "receipt.downloaded",
  "auth.sign_in",
  "auth.sign_in_failed",
  "auth.password_changed",
  "auth.signed_out",
] as const;
export type AppAuditAction = (typeof APP_AUDIT_ACTIONS)[number];
export const AUDIT_ACTIONS = [
  "tenant.created",
  "tenant.updated",
  "tenant.activated",
  "tenant.moved_out",
  "billing_start.corrected",
  "rent_tracking.started",
  "rent_tracking.stopped",
  "tenancy.started",
  "tenancy.ended",
  "tenancy.changed",
  "tenancy.deleted",
  "rent_rate.set",
  "rent_rate.changed",
  "rent_rate.deleted",
  "rent_period.repriced",
  "rent_period.deleted",
  "location.created",
  "location.updated",
  "property.created",
  "property.updated",
  "unit.created",
  "unit.updated",
  "document.added",
  "document.deleted",
  "profile.created",
  "profile.updated",
  "payment.recorded",
  "payment.acknowledged",
  "payment.changed",
  "adjustment.recorded",
  "adjustment.acknowledged",
  "adjustment.changed",
  "owner.created",
  "owner.updated",
  "owner.deleted",
  ...APP_AUDIT_ACTIONS,
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** One row of a create_payment / create_adjustment allocation list (amount is signed for adjustments). */
export type AllocationArg = {
  rent_period_id: string;
  amount: number;
};

/** File types accepted as payment proof (payment_proofs.content_type, 0009). */
export type ProofContentType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/heic"
  | "image/heif"
  | "application/pdf";

/** One row of create_payment's p_proofs list. */
export type ProofArg = {
  storage_path: string;
  file_name: string;
  content_type: ProofContentType;
  size_bytes: number;
};

/** acknowledge_payment / acknowledge_adjustment (0010): the tenant's optional signature + OTP. */
type AcknowledgeArgs = {
  p_id: string;
  p_tenant_signature_path: string;
  p_pdf_path: string;
  p_otp_verified_at: string;
};

export interface Database {
  public: {
    Tables: {
      /** The one account that owns the rent book (0003_single_owner.sql). Not readable by the owner role. */
      app_owner: {
        Row: { singleton: boolean; user_id: string; created_at: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      /** The owner's name (0013): one row, edited on the Profile page. */
      owner_profile: {
        Row: {
          singleton: boolean;
          first_name: string;
          last_name: string | null;
          /** Under the landlord signature on receipts; null = the owner's name. */
          signature_name: string | null;
          /** Saved signature PNG (owner/....png in the bucket); copied onto each new record. */
          signature_path: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          singleton?: true;
          first_name: string;
          last_name: string | null;
          signature_name: string | null;
          signature_path: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["owner_profile"]["Insert"]>;
        Relationships: [];
      };
      locations: {
        Row: {
          location_code: string;
          name: string;
          address: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          location_code: string;
          name: string;
          address?: string | null;
        };
        Update: { name?: string; address?: string | null };
        Relationships: [];
      };
      properties: {
        Row: {
          property_code: string;
          location_code: string;
          /** Generated from property_code ("T1"). */
          tower_code: string;
          name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          property_code: string;
          location_code: string;
          name: string;
        };
        Update: { name?: string };
        Relationships: [
          {
            foreignKeyName: "properties_location_code_fkey";
            columns: ["location_code"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["location_code"];
          },
        ];
      };
      units: {
        Row: {
          unit_code: string;
          property_code: string;
          /** Generated from unit_code ("G01"). */
          house_number: string;
          floor: string | null;
          unit_type: UnitType;
          label: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          unit_code: string;
          property_code: string;
          floor?: string | null;
          unit_type: UnitType;
          label?: string | null;
          is_active?: boolean;
        };
        Update: {
          floor?: string | null;
          unit_type?: UnitType;
          label?: string | null;
          is_active?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "units_property_code_fkey";
            columns: ["property_code"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["property_code"];
          },
        ];
      };
      tenants: {
        Row: {
          id: string;
          name: string;
          business_name: string | null;
          /** Required once active; may be missing on a draft. */
          phone: string | null;
          preferred_channel: PreferredChannel;
          /** Required once active; may be missing on a draft. */
          lease_start: string | null;
          status: TenantStatus;
          moved_out_on: string | null;
          /** First month the app bills (0008); earlier rent was settled on paper. Null on drafts. */
          billing_start: string | null;
          /** Security deposit (optional); frozen once active (0008 trigger). */
          deposit_amount: string | null;
          tenant_kind: TenantKind;
          /** false: rent is paid to the owner directly and not tracked - no rent months (0016). Government only. */
          rent_tracked: boolean;
          created_at: string;
          updated_at: string;
        };
        // Written only through create_tenant / update_tenant / move_out_tenant.
        Insert: never;
        Update: never;
        Relationships: [];
      };
      tenant_units: {
        Row: {
          id: number;
          tenant_id: string;
          unit_code: string;
          start_date: string;
          /** Last day (inclusive); null = still there. */
          end_date: string | null;
          created_at: string;
          /** The account that wrote the row (0015); fixed once written. */
          recorded_by: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "tenant_units_unit_code_fkey";
            columns: ["unit_code"];
            isOneToOne: false;
            referencedRelation: "units";
            referencedColumns: ["unit_code"];
          },
        ];
      };
      tenant_documents: {
        Row: {
          id: string;
          tenant_id: string;
          document_type: string;
          storage_path: string;
          file_name: string;
          content_type: ProofContentType;
          size_bytes: number;
          created_at: string;
          /** The account that wrote the row (0015); fixed once written. */
          recorded_by: string | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          document_type: string;
          storage_path: string;
          file_name: string;
          content_type: ProofContentType;
          size_bytes: number;
          created_at?: string;
        };
        // Never edited (UPDATE revoked, 0011); delete and re-upload instead.
        Update: never;
        Relationships: [];
      };
      tenant_rent_rates: {
        Row: {
          id: number;
          tenant_id: string;
          effective_month: string;
          monthly_amount: string;
          created_at: string;
          /** The account that wrote the row (0015); fixed once written. */
          recorded_by: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      rent_periods: {
        Row: {
          id: string;
          tenant_id: string;
          period_month: string;
          amount_due: string;
          amount_allocated: string;
          status: PeriodStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          period_month: string;
          amount_due: number | string;
          amount_allocated?: number | string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["rent_periods"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "rent_periods_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      payments: {
        Row: {
          id: string;
          tenant_id: string;
          amount: string;
          payment_date: string;
          mode: PaymentMode;
          note: string | null;
          status: LedgerStatus;
          owner_signature_path: string | null;
          tenant_signature_path: string | null;
          otp_verified_at: string | null;
          pdf_path: string | null;
          token_hash: string;
          token_expires_at: string;
          created_at: string;
          confirmed_at: string | null;
          /** Tenant signed + verified an OTP (0010); optional, never moves money. */
          acknowledged_at: string | null;
          /** 2026/10/001: recorded month + sequence across tenants (0012). Never changes. */
          receipt_no: string;
          /** The account that wrote the row (0015); fixed once written. */
          recorded_by: string | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          amount: number | string;
          payment_date: string;
          mode: PaymentMode;
          note?: string | null;
          status?: LedgerStatus;
          owner_signature_path?: string | null;
          token_hash: string;
          token_expires_at: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["payments"]["Insert"]> & {
          tenant_signature_path?: string | null;
          otp_verified_at?: string | null;
          pdf_path?: string | null;
          confirmed_at?: string | null;
        };
        Relationships: [];
      };
      payment_allocations: {
        Row: {
          id: string;
          payment_id: string;
          rent_period_id: string;
          amount_allocated: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          payment_id: string;
          rent_period_id: string;
          amount_allocated: number | string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["payment_allocations"]["Insert"]>;
        Relationships: [];
      };
      payment_proofs: {
        Row: {
          id: string;
          payment_id: string;
          storage_path: string;
          file_name: string;
          content_type: ProofContentType;
          size_bytes: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          payment_id: string;
          storage_path: string;
          file_name: string;
          content_type: ProofContentType;
          size_bytes: number;
          created_at?: string;
        };
        // Append-only: the owner role has UPDATE/DELETE revoked.
        Update: never;
        Relationships: [];
      };
      adjustments: {
        Row: {
          id: string;
          tenant_id: string;
          original_payment_id: string;
          delta_amount: string;
          reason: string;
          status: LedgerStatus;
          owner_signature_path: string | null;
          tenant_signature_path: string | null;
          otp_verified_at: string | null;
          pdf_path: string | null;
          token_hash: string;
          token_expires_at: string;
          created_at: string;
          confirmed_at: string | null;
          /** Tenant signed + verified an OTP (0010); optional, never moves money. */
          acknowledged_at: string | null;
          /** ADJ/2026/10/001: the adjustments series (0012). Never changes. */
          receipt_no: string;
          /** The account that wrote the row (0015); fixed once written. */
          recorded_by: string | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          original_payment_id: string;
          delta_amount: number | string;
          reason: string;
          status?: LedgerStatus;
          owner_signature_path?: string | null;
          token_hash: string;
          token_expires_at: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["adjustments"]["Insert"]> & {
          tenant_signature_path?: string | null;
          otp_verified_at?: string | null;
          pdf_path?: string | null;
          confirmed_at?: string | null;
        };
        Relationships: [];
      };
      adjustment_allocations: {
        Row: {
          id: string;
          adjustment_id: string;
          rent_period_id: string;
          amount_delta: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          adjustment_id: string;
          rent_period_id: string;
          amount_delta: number | string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["adjustment_allocations"]["Insert"]>;
        Relationships: [];
      };
      /** Append-only history (0015): written by triggers and log_event(), never edited. */
      audit_log: {
        Row: {
          id: number;
          at: string;
          /** Rows written in one transaction are one change. */
          tx_id: number;
          actor_id: string | null;
          actor_kind: AuditActorKind;
          action: AuditAction;
          entity_type: string;
          entity_id: string | null;
          tenant_id: string | null;
          unit_code: string | null;
          property_code: string | null;
          /** {column: [old, new]} - only what changed. */
          changes: Record<string, [unknown, unknown]>;
          context: Record<string, unknown>;
          /** 0017: the text the history shows, written once on insert (D27). */
          title: string;
          /** The changed values as shown, lines joined with " · ". */
          details: string;
          /** The owner's name at the time, or Tenant / System / Not signed in. */
          actor_name: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: {
      unit_occupancy: {
        Row: {
          unit_code: string;
          property_code: string;
          tenant_id: string;
          tenant_name: string;
          tenant_business_name: string | null;
          start_date: string;
          end_date: string | null;
          is_current: boolean;
        };
        Relationships: [];
      };
    };
    Functions: {
      is_app_owner: { Args: Record<string, never>; Returns: boolean };
      create_tenant: {
        Args: {
          p_name: string;
          p_business_name: string | null;
          p_phone: string | null;
          p_preferred_channel: PreferredChannel;
          /** Optional only when p_rent_tracked is false. */
          p_monthly_rent: number | null;
          p_lease_start: string;
          p_unit_codes: string[];
          p_paid_through?: string | null;
          p_deposit_amount?: number | null;
          p_tenant_kind?: TenantKind;
          p_rent_tracked?: boolean;
        };
        Returns: string;
      };
      update_tenant: {
        Args: {
          p_tenant_id: string;
          p_name: string;
          p_business_name: string | null;
          p_phone: string | null;
          p_preferred_channel: PreferredChannel;
          p_unit_codes: string[] | null;
          p_units_effective: string | null;
          p_monthly_rent: number | null;
          p_rent_effective_month: string | null;
          p_lease_start: string | null;
          p_paid_through?: string | null;
          p_deposit_amount?: number | null;
          /** null = keep. */
          p_tenant_kind?: TenantKind | null;
          /** Only when completing a draft; null = tracked. */
          p_rent_tracked?: boolean | null;
        };
        Returns: undefined;
      };
      move_out_tenant: {
        Args: { p_tenant_id: string; p_move_out_date: string };
        Returns: undefined;
      };
      /** 0014: returns the new billing_start. */
      correct_paid_through: {
        Args: { p_tenant_id: string; p_paid_through: string };
        Returns: string;
      };
      /** 0016: starts billing an untracked government tenant; returns the new billing_start. */
      start_rent_tracking: {
        Args: { p_tenant_id: string; p_monthly_rent: number | null; p_paid_through: string | null };
        Returns: string;
      };
      /** 0016: undoes start_rent_tracking while nothing is recorded. */
      stop_rent_tracking: {
        Args: { p_tenant_id: string };
        Returns: undefined;
      };
      ensure_rent_periods: {
        Args: { p_tenant_ids: string[] | null; p_through: string };
        Returns: number;
      };
      create_payment: {
        Args: {
          p_id: string;
          p_tenant_id: string;
          p_amount: number;
          p_payment_date: string;
          p_mode: PaymentMode;
          p_note: string | null;
          p_owner_signature_path: string;
          p_token_hash: string;
          p_token_expires_at: string;
          p_allocations: AllocationArg[];
          p_proofs?: ProofArg[];
        };
        Returns: undefined;
      };
      create_adjustment: {
        Args: {
          p_id: string;
          p_original_payment_id: string;
          p_delta_amount: number;
          p_reason: string;
          p_owner_signature_path: string;
          p_token_hash: string;
          p_token_expires_at: string;
          p_allocations: AllocationArg[];
        };
        Returns: undefined;
      };
      acknowledge_payment: { Args: AcknowledgeArgs; Returns: boolean };
      acknowledge_adjustment: { Args: AcknowledgeArgs; Returns: boolean };
      hit_rate_limit: {
        Args: { p_key: string; p_limit: number; p_window_seconds: number };
        Returns: boolean;
      };
      prune_rate_limits: { Args: Record<string, never>; Returns: number };
      /** 0015: app events; the service role may name the actor, the owner logs as themselves. */
      log_event: {
        Args: {
          p_action: AppAuditAction;
          p_tenant_id?: string | null;
          p_entity_type?: string | null;
          p_entity_id?: string | null;
          p_context?: Record<string, unknown>;
          p_actor_kind?: AuditActorKind | null;
          p_actor_id?: string | null;
        };
        Returns: undefined;
      };
      /** 0018: one page of history (a tenant's, or all of it), searched, filtered and sorted in SQL (A14). */
      audit_history_page: {
        Args: {
          p_tenant_id?: string | null;
          p_actions?: AuditAction[] | null;
          p_from?: string | null;
          p_to?: string | null;
          p_search?: string | null;
          p_filters?: { field: AuditTextColumn; operator: string; value?: string }[];
          p_logic?: "and" | "or";
          p_sort?: "at" | Exclude<AuditTextColumn, "details">;
          p_dir?: "asc" | "desc";
          p_page?: number;
          p_page_size?: number;
        };
        Returns: { rows: AuditLogEntry[]; total: number; all: number; page: number };
      };
      /** 0021: one page of the Billing grid: tenants × months in the range, plus paid-direct months (A15). */
      billing_page: {
        Args: {
          p_from: string;
          p_to: string;
          p_paid_direct?: boolean;
          p_show?: string;
          p_search?: string | null;
          p_filters?: { field: "month" | "tenant" | "status" | "payments"; operator: string; value?: string }[];
          p_logic?: "and" | "or";
          p_sort?: "period_month" | "tenant_name" | "amount_due" | "amount_allocated" | "balance" | "status";
          p_dir?: "asc" | "desc";
          p_page?: number;
          p_page_size?: number;
        };
        Returns: { rows: BillingDbRow[]; total: number; all: number; page: number };
      };
      /** 0021: the Billing stat cards for the whole range. */
      billing_totals: {
        Args: { p_from: string; p_to: string; p_paid_direct?: boolean };
        Returns: BillingTotalsDb;
      };
      /** 0022: the tenant page's account figures (D29). */
      tenant_account_summary: {
        Args: { p_tenant_id: string };
        Returns: TenantAccountSummaryDb;
      };
      /** 0020: one page of a tenant's ledger, with the all-time running balance (A15). */
      tenant_ledger_page: {
        Args: {
          p_tenant_id: string;
          p_from?: string | null;
          p_to?: string | null;
          p_search?: string | null;
          p_filters?: { field: "date" | "description" | "status"; operator: string; value?: string }[];
          p_logic?: "and" | "or";
          p_sort?: "date" | "description" | "status" | "debit" | "credit" | "balance";
          p_dir?: "asc" | "desc";
          p_page?: number;
          p_page_size?: number;
        };
        Returns: { rows: TenantLedgerDbRow[]; total: number; all: number; page: number };
      };
      /** 0019: one page of a tenant's rent months (A15). */
      tenant_months_page: {
        Args: {
          p_tenant_id: string;
          p_show?: string;
          p_search?: string | null;
          p_filters?: { field: "month" | "status"; operator: string; value?: string }[];
          p_logic?: "and" | "or";
          p_sort?: "period_month" | "amount_due" | "amount_allocated" | "status";
          p_dir?: "asc" | "desc";
          p_page?: number;
          p_page_size?: number;
        };
        Returns: { rows: TenantMonthDbRow[]; total: number; all: number; page: number };
      };
    };
  };
}

/** A row of tenant_months_page (0019): a rent month as the Months table shows it. */
export interface TenantMonthDbRow {
  id: string;
  period_month: string;
  amount_due: number;
  amount_allocated: number;
  status: PeriodStatus;
  display_status: PeriodStatus | "not_due_yet";
  /** "October 2026". */
  month_label: string;
}

/** A row of billing_page (0021): one tenant's rent for one month, or a paid-direct month. */
export interface BillingDbRow {
  id: string;
  tenant_id: string;
  tenant_name: string;
  property_name: string;
  unit_codes: string[];
  period_month: string;
  month_label: string;
  amount_due: number;
  amount_allocated: number;
  balance: number;
  status: PeriodStatus;
  not_yet_due: boolean;
  paid_direct: boolean;
  payments: { payment_id: string; receipt_no: string | null; payment_date: string; mode: PaymentMode; amount: number }[];
}

/** billing_totals (0021): the range's stat cards. */
export interface BillingTotalsDb {
  billed: number;
  collected: number;
  balance: number;
  overdue: number;
  collection_rate: number | null;
  tenants: number;
}

/** tenant_account_summary (0022): the tenant page's account figures. */
export interface TenantAccountSummaryDb {
  /** Unpaid on months that have ended. */
  total_outstanding: number;
  overdue_months: number;
  /** Unpaid on this month and later. */
  not_yet_due: number;
  ended_months: number;
  paid_ended_months: number;
  can_stop_rent_tracking: boolean;
}

/** A row of tenant_ledger_page (0020). */
export interface TenantLedgerDbRow {
  id: string;
  type: "charge" | "payment" | "adjustment";
  date: string;
  description: string;
  caption: string;
  debit: number;
  credit: number;
  balance: number;
  status: "billed" | "upcoming" | "confirmed" | "pending";
  ref_id: string | null;
  receipt_no: string | null;
  acknowledged: boolean | null;
}

/** The text columns audit_history_page searches and filters (0018); tenant_name is read from tenants. */
export type AuditTextColumn = "actor_name" | "title" | "tenant_name" | "unit_code" | "details";

export type OwnerProfile = Database["public"]["Tables"]["owner_profile"]["Row"];
export type Location = Database["public"]["Tables"]["locations"]["Row"];
export type Property = Database["public"]["Tables"]["properties"]["Row"];
export type Unit = Database["public"]["Tables"]["units"]["Row"];
export type Tenant = Database["public"]["Tables"]["tenants"]["Row"];
export type TenantUnit = Database["public"]["Tables"]["tenant_units"]["Row"];
export type TenantRentRate = Database["public"]["Tables"]["tenant_rent_rates"]["Row"];
export type TenantDocument = Database["public"]["Tables"]["tenant_documents"]["Row"];
export type UnitOccupancy = Database["public"]["Views"]["unit_occupancy"]["Row"];
export type RentPeriod = Database["public"]["Tables"]["rent_periods"]["Row"];
export type Payment = Database["public"]["Tables"]["payments"]["Row"];
export type PaymentAllocation = Database["public"]["Tables"]["payment_allocations"]["Row"];
export type PaymentProof = Database["public"]["Tables"]["payment_proofs"]["Row"];
export type Adjustment = Database["public"]["Tables"]["adjustments"]["Row"];
export type AdjustmentAllocation = Database["public"]["Tables"]["adjustment_allocations"]["Row"];
export type AuditLogEntry = Database["public"]["Tables"]["audit_log"]["Row"];
