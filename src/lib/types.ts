// Hand-written to match supabase/migrations/*.sql (tables, the rent_periods ->
// tenants relationship the adapter embeds, and the RPC functions); update it
// in the same change as any migration. To check it against a real project,
// `npm run db:types` (needs the Supabase CLI and SUPABASE_PROJECT_ID) writes
// the generated types to src/lib/database.generated.ts (git-ignored) to diff
// against. test/schema.test.ts checks the migrations themselves.

export type UnitType = "residential" | "commercial";
export type PreferredChannel = "whatsapp" | "sms" | "both";
/** draft = from the paper register, details incomplete, never billed (0007). */
export type TenantStatus = "draft" | "active" | "inactive";
export type PeriodStatus = "pending" | "partially_paid" | "paid";
export type PaymentMode = "cash" | "bank_transfer" | "upi" | "cheque" | "other";
export type LedgerStatus = "pending" | "confirmed";

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
      tenant_rent_rates: {
        Row: {
          id: number;
          tenant_id: string;
          effective_month: string;
          monthly_amount: string;
          created_at: string;
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
          p_phone: string;
          p_preferred_channel: PreferredChannel;
          p_monthly_rent: number;
          p_lease_start: string;
          p_unit_codes: string[];
          p_paid_through?: string | null;
          p_deposit_amount?: number | null;
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
        };
        Returns: undefined;
      };
      move_out_tenant: {
        Args: { p_tenant_id: string; p_move_out_date: string };
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
    };
  };
}

export type Location = Database["public"]["Tables"]["locations"]["Row"];
export type Property = Database["public"]["Tables"]["properties"]["Row"];
export type Unit = Database["public"]["Tables"]["units"]["Row"];
export type Tenant = Database["public"]["Tables"]["tenants"]["Row"];
export type TenantUnit = Database["public"]["Tables"]["tenant_units"]["Row"];
export type TenantRentRate = Database["public"]["Tables"]["tenant_rent_rates"]["Row"];
export type UnitOccupancy = Database["public"]["Views"]["unit_occupancy"]["Row"];
export type RentPeriod = Database["public"]["Tables"]["rent_periods"]["Row"];
export type Payment = Database["public"]["Tables"]["payments"]["Row"];
export type PaymentAllocation = Database["public"]["Tables"]["payment_allocations"]["Row"];
export type PaymentProof = Database["public"]["Tables"]["payment_proofs"]["Row"];
export type Adjustment = Database["public"]["Tables"]["adjustments"]["Row"];
export type AdjustmentAllocation = Database["public"]["Tables"]["adjustment_allocations"]["Row"];
