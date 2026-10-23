import type {
  AdjustPaymentForm,
  BulkCreateResult,
  ConfirmInput,
  ConfirmView,
  Confirmed,
  Created,
  CreatedAdjustment,
  CreateAdjustmentInput,
  CreatePaymentInput,
  CreatePropertyInput,
  CreateTenantInput,
  DashboardSummary,
  MagicLinkResult,
  NewPaymentForm,
  OtpSent,
  PropertyCard,
  PropertyDetail,
  PropertyHeader,
  RecordType,
  ResendInput,
  Session,
  SessionTokens,
  TenantDetail,
  TenantSearchRow,
} from "@/lib/contracts";

/**
 * Reads. Server Components get these through `serverApi`; the browser
 * client implements them too. Grouped like the page tree.
 */
export interface ApiQueries {
  auth: {
    session(): Promise<Session>;
  };
  dashboard: {
    summary(month?: string): Promise<DashboardSummary>;
    properties: {
      list(): Promise<PropertyCard[]>;
      detail(propertyId: string): Promise<PropertyDetail>;
      newTenant(propertyId: string): Promise<PropertyHeader>;
      bulkTenants(propertyId: string): Promise<PropertyHeader>;
    };
    tenants: {
      list(): Promise<TenantSearchRow[]>;
      detail(tenantId: string): Promise<TenantDetail>;
      newPayment(tenantId: string): Promise<NewPaymentForm>;
    };
    payments: {
      adjust(paymentId: string): Promise<AdjustPaymentForm>;
    };
  };
  confirm: {
    detail(token: string): Promise<ConfirmView>;
  };
}

/** Writes. Called from Client Components (forms, buttons) over HTTP. */
export interface ApiCommands {
  auth: {
    requestMagicLink(input: { email: string; next: string }): Promise<MagicLinkResult>;
    setSession(tokens: SessionTokens): Promise<void>;
    signOut(): Promise<void>;
  };
  dashboard: {
    properties: {
      create(input: CreatePropertyInput): Promise<Created>;
      createTenant(propertyId: string, input: CreateTenantInput): Promise<Created>;
      bulkCreateTenants(propertyId: string, tenants: unknown[]): Promise<BulkCreateResult>;
    };
    tenants: {
      createPayment(tenantId: string, input: CreatePaymentInput): Promise<Created>;
    };
    payments: {
      createAdjustment(paymentId: string, input: CreateAdjustmentInput): Promise<CreatedAdjustment>;
      resend(paymentId: string, input: ResendInput): Promise<void>;
    };
    adjustments: {
      resend(adjustmentId: string, input: ResendInput): Promise<void>;
    };
  };
  confirm: {
    sendOtp(token: string, recordType: RecordType): Promise<OtpSent>;
    submit(token: string, input: ConfirmInput): Promise<Confirmed>;
  };
}

export type Api = ApiQueries & ApiCommands;
