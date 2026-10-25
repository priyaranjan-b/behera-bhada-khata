import type {
  ActivityQuery,
  AuditPage,
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
  DashboardSummary,
  DefaultersReport,
  EditTenantForm,
  LocationGroup,
  MoveOutInput,
  NewHouseForm,
  NewPropertyForm,
  NewTenantForm,
  OwnerProfileView,
  UpdateOwnerProfileInput,
  UpdateTenantInput,
  MagicLinkResult,
  PasswordSignInResult,
  NewPaymentForm,
  OtpSent,
  PropertyDetail,
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
  TenantDetail,
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
    summary(month?: string): Promise<DashboardSummary>;
    /** Tenants behind on rent, most months behind first. */
    defaulters(): Promise<DefaultersReport>;
    /** Everything that changed, newest first (audit_log, 0015). */
    activity(query?: ActivityQuery): Promise<AuditPage>;
    /** Top-bar search index (tenants and houses). */
    search(): Promise<SearchIndex>;
    /** The owner's name and saved signature (Profile page, app shell). */
    profile(): Promise<OwnerProfileView>;
    properties: {
      list(): Promise<LocationGroup[]>;
      newForm(): Promise<NewPropertyForm>;
      detail(propertyCode: string): Promise<PropertyDetail>;
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
      detail(tenantId: string): Promise<TenantDetail>;
      edit(tenantId: string): Promise<EditTenantForm>;
      /** One tenant's change history; `before` = AuditPage.nextBefore. */
      history(tenantId: string, before?: number): Promise<AuditPage>;
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
