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
export const PERIOD_STATUSES = ["pending", "partially_paid", "paid"] as const;
export type PeriodStatus = (typeof PERIOD_STATUSES)[number];
/** set_off (0032, A22): rent the tenant settled by keeping back money the owner owed them - pays rent, never cash. */
export const PAYMENT_MODES = ["cash", "bank_transfer", "upi", "cheque", "other", "set_off"] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];
export type LedgerStatus = "pending" | "confirmed";
/** What a maintenance expense was for (0031, D35). Labels in src/lib/domain/maintenance.ts. */
export const MAINTENANCE_CATEGORIES = [
  "plumbing",
  "electrical",
  "painting",
  "carpentry",
  "civil_repair",
  "appliance",
  "cleaning",
  "utilities",
  "society_charges",
  "property_tax",
  "other",
] as const;
export type MaintenanceCategory = (typeof MAINTENANCE_CATEGORIES)[number];
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
  "maintenance.recorded",
  "maintenance.updated",
  "maintenance.voided",
  "maintenance.house_added",
  "maintenance.house_removed",
  "maintenance.share_changed",
  "maintenance.file_added",
  "maintenance.file_removed",
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

/** create_maintenance_expense / update_maintenance_expense (0031). */
export type MaintenanceExpenseArgs = {
  p_id: string;
  p_expense_date: string;
  p_amount: number;
  p_category: MaintenanceCategory;
  p_description: string;
  p_vendor: string | null;
  p_note: string | null;
  p_unit_codes: string[];
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
      /** Quick-select notes for the Record payment form (0024), edited on the Settings page. */
      payment_note_presets: {
        Row: { id: string; text: string; created_at: string; updated_at: string };
        Insert: { text: string };
        Update: { text?: string };
        Relationships: [];
      };
      /** Suggested payment tags (0030, D34), managed on the Settings page. */
      payment_tags: {
        Row: { id: string; name: string; created_at: string; updated_at: string };
        Insert: { name: string };
        Update: { name?: string };
        Relationships: [];
      };
      /** The tags on a payment, each a copy of the name (0030); inserted and deleted, never updated. */
      payment_record_tags: {
        Row: { payment_id: string; name: string; created_at: string };
        Insert: { payment_id: string; name: string };
        Update: never;
        Relationships: [];
      };
      /** Money spent on the houses (0031, D35); written by the maintenance functions only. */
      maintenance_expenses: {
        Row: {
          id: string;
          expense_date: string;
          amount: number;
          category: MaintenanceCategory;
          description: string;
          vendor: string | null;
          note: string | null;
          voided_at: string | null;
          void_reason: string | null;
          /** The set-off payment that paid for it (0032, A22): no cash went out. */
          settled_by_payment_id: string | null;
          recorded_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      /** The houses an expense covers and each one's share (0031). */
      maintenance_expense_units: {
        Row: { expense_id: string; unit_code: string; share_amount: number };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      /** Who paid an expense, each a copy of the name (0031); inserted and deleted, never updated. */
      maintenance_expense_tags: {
        Row: { expense_id: string; name: string; created_at: string };
        Insert: { expense_id: string; name: string };
        Update: never;
        Relationships: [];
      };
      /** Receipts and photos on an expense (0031); added and deleted, never updated. */
      maintenance_files: {
        Row: {
          id: string;
          expense_id: string;
          storage_path: string;
          file_name: string;
          content_type: ProofContentType;
          size_bytes: number;
          recorded_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          expense_id: string;
          storage_path: string;
          file_name: string;
          content_type: ProofContentType;
          size_bytes: number;
        };
        Update: never;
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
          deposit_amount: number | null;
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
      /** Tenant portal sign-ins (0033, D37, A32): service role only, never read by the browser. */
      tenant_sessions: {
        Row: {
          id: string;
          /** sha256 of the random token in the browser's cookie; the token itself is never stored. */
          token_hash: string;
          phone: string;
          /** The tenancy the session reads; null until chosen (one phone, several tenancies). */
          tenant_id: string | null;
          created_at: string;
          expires_at: string;
          revoked_at: string | null;
          ip_hash: string | null;
        };
        Insert: {
          id?: string;
          token_hash: string;
          phone: string;
          tenant_id?: string | null;
          created_at?: string;
          expires_at: string;
          revoked_at?: string | null;
          ip_hash?: string | null;
        };
        Update: { tenant_id?: string | null; revoked_at?: string | null };
        Relationships: [];
      };
      tenant_rent_rates: {
        Row: {
          id: number;
          tenant_id: string;
          effective_month: string;
          monthly_amount: number;
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
          amount_due: number;
          amount_allocated: number;
          status: PeriodStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          period_month: string;
          amount_due: number;
          amount_allocated?: number;
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
          amount: number;
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
          amount: number;
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
          amount_allocated: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          payment_id: string;
          rent_period_id: string;
          amount_allocated: number;
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
          delta_amount: number;
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
          delta_amount: number;
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
          amount_delta: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          adjustment_id: string;
          rent_period_id: string;
          amount_delta: number;
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
      /** 0025: fixes a wrongly entered rent from a month on, paid months included. */
      correct_rent: {
        Args: { p_tenant_id: string; p_from_month: string; p_monthly_amount: number };
        Returns: undefined;
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
      /** 0031: an expense on one or more houses, split equally. */
      create_maintenance_expense: {
        Args: MaintenanceExpenseArgs & { p_settled_by_payment_id?: string | null };
        Returns: undefined;
      };
      /** 0031: every field and the houses (re-split); refused once voided. */
      update_maintenance_expense: { Args: MaintenanceExpenseArgs; Returns: undefined };
      /** 0031: keeps the expense, leaves it out of every total. */
      void_maintenance_expense: { Args: { p_id: string; p_reason: string }; Returns: undefined };
      acknowledge_payment: { Args: AcknowledgeArgs; Returns: boolean };
      acknowledge_adjustment: { Args: AcknowledgeArgs; Returns: boolean };
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
    };
  };
}

/** A row of the Months table query (tenantMonthsPage; was tenant_months_page, 0019): a rent month as it shows it. */
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

/** The Months query's money over every row that matches its search and filters, whatever the page (A26). */
export interface TenantMonthSumsDb {
  amount_due: number;
  amount_allocated: number;
  /** Of amount_due, this month and later: listed but not owed yet. */
  not_yet_due: number;
}

/** A row of the Billing grid query (billingPage; was billing_page, 0021): one tenant's rent for one month, or a paid-direct month. */
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

/** The Payments page query (paymentsPage; was payments_page, 0026): the columns it sorts and matches by. */
export type PaymentsSortColumn = "payment_date" | "receipt_no" | "tenant_name" | "mode" | "amount";
export type PaymentsFilterColumn = "date" | "receipt" | "tenant" | "mode" | "months" | "note" | "tags";

/** A row of the Payments page query (was payments_page, 0026): one confirmed payment. */
export interface PaymentsDbRow {
  id: string;
  receipt_no: string | null;
  payment_date: string;
  tenant_id: string;
  tenant_name: string;
  property_name: string;
  mode: PaymentMode;
  amount: number;
  /** The rent months it paid, "January 2026, February 2026". */
  months_text: string;
  note: string;
  acknowledged: boolean;
  /** Its tags' names (0030), alphabetical. */
  tags: string[];
}

/** The Payments page totals (was payments_page, 0026): every matching row, whatever the page. */
export interface PaymentsTotalsDb {
  /** Money that came in: every mode but set_off (A22). */
  amount: number;
  count: number;
  by_mode: Record<PaymentMode, number>;
}

/** The Maintenance page query (maintenancePage, 0031): the columns it sorts and matches by. */
export type MaintenanceSortColumn = "expense_date" | "description" | "category" | "amount" | "units_text";
export type MaintenanceFilterColumn = "date" | "description" | "category" | "units" | "vendor" | "note" | "tags" | "status";

/** A row of the Maintenance page query: one expense, voided ones included. */
export interface MaintenanceDbRow {
  id: string;
  expense_date: string;
  amount: number;
  category: MaintenanceCategory;
  description: string;
  vendor: string | null;
  note: string | null;
  voided: boolean;
  /** Its houses' codes, in code order. */
  unit_codes: string[];
  /** Who paid (0031), alphabetical. */
  tags: string[];
  file_count: number;
}

/** The Maintenance page totals: every matching expense that isn't voided, whatever the page. */
export interface MaintenanceTotalsDb {
  amount: number;
  /** Of it, paid in cash: every expense but those a set-off paid for (A22). */
  cash: number;
  count: number;
  by_category: Partial<Record<MaintenanceCategory, number>>;
  /** Per payer; an expense with several payers counts in full for each. */
  by_tag: { name: string; amount: number }[];
  /** Amount with no payer tag. */
  untagged: number;
}

/** The Billing stat cards for the range (billingTotals; was billing_totals, 0021). */
export interface BillingTotalsDb {
  billed: number;
  collected: number;
  balance: number;
  overdue: number;
  collection_rate: number | null;
  tenants: number;
}

/** The Billing grid's money over every row that matches its "Show", search and filters, whatever the page (A26). */
export interface BillingSumsDb {
  amount_due: number;
  amount_allocated: number;
  balance: number;
}

/** The tenant page's account figures (tenantAccountSummary; was tenant_account_summary, 0022). */
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

/** A row of the tenant ledger query (tenantLedgerPage; was tenant_ledger_page, 0020). */
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
  /** A payment's tags (0030), alphabetical; [] for other rows. */
  tags: string[];
}

/** The ledger's debits and credits over every row that matches its dates, search and filters, whatever the page (A26). */
export interface TenantLedgerSumsDb {
  /** Only what the running balance counts: pending and upcoming rows are left out. */
  debit: number;
  credit: number;
  /** Matching rows the sums leave out: rent not due yet, old pending records. */
  not_counted: number;
}

/** The text columns the history query searches and filters (auditHistoryPage; was audit_history_page, 0018); tenant_name is read from tenants. */
export type AuditTextColumn = "actor_name" | "title" | "tenant_name" | "unit_code" | "details";

export type OwnerProfile = Database["public"]["Tables"]["owner_profile"]["Row"];
export type PaymentNotePreset = Database["public"]["Tables"]["payment_note_presets"]["Row"];
export type PaymentTag = Database["public"]["Tables"]["payment_tags"]["Row"];
export type Location = Database["public"]["Tables"]["locations"]["Row"];
export type Property = Database["public"]["Tables"]["properties"]["Row"];
export type Unit = Database["public"]["Tables"]["units"]["Row"];
export type Tenant = Database["public"]["Tables"]["tenants"]["Row"];
export type TenantUnit = Database["public"]["Tables"]["tenant_units"]["Row"];
export type TenantRentRate = Database["public"]["Tables"]["tenant_rent_rates"]["Row"];
export type TenantDocument = Database["public"]["Tables"]["tenant_documents"]["Row"];
export type TenantSession = Database["public"]["Tables"]["tenant_sessions"]["Row"];
export type UnitOccupancy = Database["public"]["Views"]["unit_occupancy"]["Row"];
export type RentPeriod = Database["public"]["Tables"]["rent_periods"]["Row"];
export type Payment = Database["public"]["Tables"]["payments"]["Row"];
export type PaymentAllocation = Database["public"]["Tables"]["payment_allocations"]["Row"];
export type PaymentProof = Database["public"]["Tables"]["payment_proofs"]["Row"];
export type Adjustment = Database["public"]["Tables"]["adjustments"]["Row"];
export type AdjustmentAllocation = Database["public"]["Tables"]["adjustment_allocations"]["Row"];
export type AuditLogEntry = Database["public"]["Tables"]["audit_log"]["Row"];
export type MaintenanceExpense = Database["public"]["Tables"]["maintenance_expenses"]["Row"];
export type MaintenanceExpenseUnit = Database["public"]["Tables"]["maintenance_expense_units"]["Row"];
export type MaintenanceFile = Database["public"]["Tables"]["maintenance_files"]["Row"];
