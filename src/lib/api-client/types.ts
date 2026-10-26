import type { AttentionItem } from "@/lib/domain/overview";
import type { PaidDirectView } from "@/lib/types";
import type {
  BillingQuery,
  BillingReceived,
  BillingPage,
  BillingPageQuery,
  BillingTotalsView,
  AuditPage,
  AuditTablePage,
  AuditTableQuery,
  AdjustPaymentForm,
  AnyTowerTenantForm,
  BulkCreateResult,
  ChangePasswordInput,
  ConfirmInput,
  ConfirmView,
  Confirmed,
  Created,
  CorrectPaidThroughInput,
  StartRentTrackingInput,
  CreatedAdjustment,
  CreateAdjustmentInput,
  CreatePaymentInput,
  CreatePropertyInput,
  CreateTenantInput,
  CreateUnitInput,
  DefaultersReport,
  EditTenantForm,
  HouseCounts,
  LocationGroup,
  MoveOutInput,
  NewHouseForm,
  NewPropertyForm,
  NewTenantForm,
  OverviewMonth,
  OverviewTrend,
  OwnerProfileView,
  PaidDirectState,
  PortfolioFacts,
  UpdateOwnerProfileInput,
  UpdateTenantInput,
  MagicLinkResult,
  PasswordSignInResult,
  NewPaymentForm,
  OtpSent,
  PropertyTenantRow,
  PropertyHeader,
  LinkResent,
  LoginOptions,
  RecordCreated,
  RecordType,
  SearchIndex,
  TenantDocumentsSaved,
  UploadTenantDocumentsInput,
  Session,
  SessionTokens,
  TenantAccount,
  TenantDetail,
  TenantMonthRow,
  TenantMonthsQuery,
  TablePage,
  TenantLedgerQuery,
  TenantLedgerView,
  TenantSearchRow,
  UnitRow,
} from "@/lib/contracts";

/**
 * Reads. Server Components get these through `serverApi`; the browser
 * client implements them too. Grouped like the page tree.
 */
export interface ApiQueries {
  auth: {
    session(): Promise<Session>;
    loginOptions(): Promise<LoginOptions>;
  };
  dashboard: {
    /** The Overview, one section per call so each card streams in on its own (A12). */
    overview: {
      month(month?: string, options?: { paidDirect?: PaidDirectView }): Promise<OverviewMonth>;
      trend(options?: { paidDirect?: PaidDirectView }): Promise<OverviewTrend>;
      houses(): Promise<HouseCounts>;
      attention(): Promise<AttentionItem[]>;
      portfolio(options?: { paidDirect?: PaidDirectView }): Promise<PortfolioFacts>;
    };
    /** For the "Include Govt paid direct" switch (Overview, Billing): are there any, and is the view showing them. */
    paidDirect(options?: { paidDirect?: PaidDirectView }): Promise<PaidDirectState>;
    /** Tenants behind on rent, most months behind first. */
    defaulters(): Promise<DefaultersReport>;
    /** Rent billed per tenant per month in a range, and the payments for it. */
    /** One page of the Billing grid for the range, paged, sorted and searched in SQL (A15). */
    billing(query?: BillingPageQuery): Promise<BillingPage>;
    /** The Billing stat cards: totals of the whole range. */
    billingTotals(query?: BillingQuery): Promise<BillingTotalsView>;
    /** Cash received in the same range (its own section of the Billing page, A12). */
    billingReceived(query?: BillingQuery): Promise<BillingReceived>;
    /** Everything that changed: one page, paged, sorted and searched in SQL (A14). */
    activity(query?: AuditTableQuery): Promise<AuditTablePage>;
    /** Top-bar search index (tenants and houses). */
    search(): Promise<SearchIndex>;
    /** The owner's name and saved signature (Profile page, app shell). */
    profile(): Promise<OwnerProfileView>;
    properties: {
      list(): Promise<LocationGroup[]>;
      newForm(): Promise<NewPropertyForm>;
      /** The tower page's header; its houses and tenants are their own calls (A12). */
      detail(propertyCode: string): Promise<PropertyHeader>;
      units(propertyCode: string): Promise<UnitRow[]>;
      tenants(propertyCode: string): Promise<PropertyTenantRow[]>;
      newTenant(propertyCode: string): Promise<NewTenantForm>;
      bulkTenants(propertyCode: string): Promise<NewTenantForm>;
      newUnit(propertyCode: string): Promise<PropertyHeader>;
    };
    houses: {
      /** Every house in every tower, with who is in it. */
      list(): Promise<UnitRow[]>;
      /** Every tower, for the "Add house" shortcut. */
      newForm(): Promise<NewHouseForm>;
      /** One house's change history; `before` = AuditPage.nextBefore. */
      history(unitCode: string, before?: number): Promise<AuditPage>;
    };
    tenants: {
      list(): Promise<TenantSearchRow[]>;
      /** Vacant houses in every tower, for the "Add tenant" shortcut. */
      newForm(): Promise<AnyTowerTenantForm>;
      /** The tenant page's profile; its money is in account and ledger (A12). */
      detail(tenantId: string): Promise<TenantDetail>;
      account(tenantId: string): Promise<TenantAccount>;
      /** One page of the tenant's rent months, paged, sorted and searched in SQL (A15). */
      months(tenantId: string, query?: TenantMonthsQuery): Promise<TablePage<TenantMonthRow>>;
      /** One page of the tenant's ledger, with the all-time running balance (A15). */
      ledger(tenantId: string, query?: TenantLedgerQuery): Promise<TenantLedgerView>;
      edit(tenantId: string): Promise<EditTenantForm>;
      /** One page of a tenant's change history, paged, sorted and searched on the server (A14). */
      history(tenantId: string, query?: AuditTableQuery): Promise<AuditTablePage>;
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
    signInWithPassword(input: { email: string; password: string; next: string }): Promise<PasswordSignInResult>;
    setSession(tokens: SessionTokens): Promise<void>;
    signOut(): Promise<void>;
  };
  dashboard: {
    updateProfile(input: UpdateOwnerProfileInput): Promise<void>;
    changePassword(input: ChangePasswordInput): Promise<void>;
    properties: {
      create(input: CreatePropertyInput): Promise<{ code: string }>;
      createUnit(propertyCode: string, input: CreateUnitInput): Promise<{ code: string }>;
      bulkCreateTenants(propertyCode: string, tenants: unknown[]): Promise<BulkCreateResult>;
    };
    tenants: {
      create(input: CreateTenantInput): Promise<Created>;
      update(tenantId: string, input: UpdateTenantInput): Promise<void>;
      moveOut(tenantId: string, input: MoveOutInput): Promise<void>;
      correctPaidThrough(tenantId: string, input: CorrectPaidThroughInput): Promise<void>;
      /** Government tenant (0016): bill from the month after `paidThrough`. */
      startRentTracking(tenantId: string, input: StartRentTrackingInput): Promise<void>;
      /** Undo startRentTracking; 409 once a payment is recorded. */
      stopRentTracking(tenantId: string): Promise<void>;
      /** `proofs`: photos/PDFs of the payment, sent as multipart (see PROOF_LIMITS). */
      createPayment(tenantId: string, input: CreatePaymentInput, proofs?: File[]): Promise<RecordCreated>;
      /** ID proof, photo, agreement... as multipart; `documentTypes[i]` is the type of `files[i]`. */
      uploadDocuments(tenantId: string, input: UploadTenantDocumentsInput, files: File[]): Promise<TenantDocumentsSaved>;
      deleteDocument(tenantId: string, documentId: string): Promise<void>;
    };
    payments: {
      createAdjustment(paymentId: string, input: CreateAdjustmentInput): Promise<CreatedAdjustment>;
      resend(paymentId: string): Promise<LinkResent>;
    };
    adjustments: {
      resend(adjustmentId: string): Promise<LinkResent>;
    };
  };
  confirm: {
    sendOtp(token: string, recordType: RecordType): Promise<OtpSent>;
    submit(token: string, input: ConfirmInput): Promise<Confirmed>;
  };
}

export type Api = ApiQueries & ApiCommands;
