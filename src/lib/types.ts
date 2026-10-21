// Hand-written to match supabase/migrations/0001_init.sql. If you change the
// schema, either update this file or regenerate it with:
//   npx supabase gen types typescript --project-id <id> > src/lib/types.ts

export type UnitType = "residential" | "commercial";
export type PreferredChannel = "whatsapp" | "sms" | "both";
export type TenantStatus = "active" | "inactive";
export type PeriodStatus = "pending" | "partially_paid" | "paid";
export type PaymentMode = "cash" | "bank_transfer" | "upi" | "cheque" | "other";
export type LedgerStatus = "pending" | "confirmed";

export interface Database {
  public: {
    Tables: {
      properties: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          address: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id?: string;
          name: string;
          address?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["properties"]["Insert"]>;
        Relationships: [];
      };
      tenants: {
        Row: {
          id: string;
          owner_id: string;
          property_id: string;
          name: string;
          business_name: string | null;
          unit_type: UnitType;
          tower: string | null;
          floor: string | null;
          house_number: string | null;
          phone: string;
          preferred_channel: PreferredChannel;
          monthly_rent_amount: string;
          lease_start: string;
          status: TenantStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id?: string;
          property_id: string;
          name: string;
          business_name?: string | null;
          unit_type?: UnitType;
          tower?: string | null;
          floor?: string | null;
          house_number?: string | null;
          phone: string;
          preferred_channel?: PreferredChannel;
          monthly_rent_amount: number | string;
          lease_start: string;
          status?: TenantStatus;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["tenants"]["Insert"]>;
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
        Relationships: [];
      };
      payments: {
        Row: {
          id: string;
          owner_id: string;
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
        };
        Insert: {
          id?: string;
          owner_id?: string;
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
      adjustments: {
        Row: {
          id: string;
          owner_id: string;
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
        };
        Insert: {
          id?: string;
          owner_id?: string;
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
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}

export type Property = Database["public"]["Tables"]["properties"]["Row"];
export type Tenant = Database["public"]["Tables"]["tenants"]["Row"];
export type RentPeriod = Database["public"]["Tables"]["rent_periods"]["Row"];
export type Payment = Database["public"]["Tables"]["payments"]["Row"];
export type PaymentAllocation = Database["public"]["Tables"]["payment_allocations"]["Row"];
export type Adjustment = Database["public"]["Tables"]["adjustments"]["Row"];
export type AdjustmentAllocation = Database["public"]["Tables"]["adjustment_allocations"]["Row"];
