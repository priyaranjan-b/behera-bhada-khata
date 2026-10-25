import { beforeEach, describe, expect, it, vi } from "vitest";
import { OWNER_ID, PNG_DATA_URL, fakes, resetFakes, tenant } from "../fakes";

vi.mock("@/server/infra", async () => (await import("../fakes")).infraMock());
vi.mock("@/server/pdf/receipt", () => ({ generateReceiptPdf: vi.fn(async () => new Uint8Array([37, 80, 68, 70])) }));

const { generateReceiptPdf } = await import("@/server/pdf/receipt");
const {
  correctPaidThrough,
  createTenant,
  getTenantDetail,
  listTenants,
  moveOutTenant,
  startRentTracking,
  stopRentTracking,
  updateTenant,
} = await import(
  "@/server/services/tenants"
);
const { getPropertyDetail } = await import("@/server/services/properties");
const { confirmRecord } = await import("@/server/services/confirm");
const { createPayment } = await import("@/server/services/payments");

const ctx = { ownerId: OWNER_ID };
const contact = { name: "Mohan Das", phone: "+919876543210", preferredChannel: "both" };

beforeEach(() => {
  resetFakes();
  vi.mocked(generateReceiptPdf).mockClear();
});

describe("onboarding and editing", () => {
  it("creates one tenant for several houses at one combined rent (codes normalised)", async () => {
    await createTenant(ctx, {
      ...contact,
      monthlyRentAmount: 12000,
      leaseStart: "2026-02-01",
      unitCodes: ["ac-t1-g03", "AC-T1-G04"],
    });
    expect(fakes.owner.tenants.create).toHaveBeenCalledWith(
      expect.objectContaining({ monthly_rent: 12000, unit_codes: ["AC-T1-G03", "AC-T1-G04"], lease_start: "2026-02-01" })
    );
    // Rent months exist straight away.
    expect(fakes.system.rentPeriods.ensure).toHaveBeenCalledWith(["00000000-0000-4000-8000-000000000199"], expect.any(String));
  });

  it("passes 'rent paid up to' through as the first of that month", async () => {
    await createTenant(ctx, {
      ...contact,
      monthlyRentAmount: 4000,
      leaseStart: "2018-01-01",
      unitCodes: ["AC-T1-G06"],
      paidThrough: "2026-08",
    });
    expect(fakes.owner.tenants.create).toHaveBeenCalledWith(expect.objectContaining({ paid_through: "2026-08-01" }));

    await createTenant(ctx, {
      ...contact,
      monthlyRentAmount: 4000,
      leaseStart: "2026-10-01",
      unitCodes: ["AC-T1-G06"],
      depositAmount: "15000.50",
    });
    expect(fakes.owner.tenants.create).toHaveBeenLastCalledWith(expect.objectContaining({ deposit_amount: 15000.5 }));

    await updateTenant(ctx, "00000000-0000-4000-8000-000000000101", {
      ...contact,
      unitCodes: ["AC-T1-G01"],
      monthlyRentAmount: 12000,
      leaseStart: "2019-04-01",
      paidThrough: "2026-09",
    });
    expect(fakes.owner.tenants.update).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000101",
      expect.objectContaining({ lease_start: "2019-04-01", paid_through: "2026-09-01" })
    );
  });

  it("rejects onboarding without a house before touching the database", async () => {
    await expect(
      createTenant(ctx, { ...contact, monthlyRentAmount: 5000, leaseStart: "2026-02-01", unitCodes: [] })
    ).rejects.toMatchObject({ status: 400 });
    expect(fakes.owner.tenants.create).not.toHaveBeenCalled();
  });

  it("passes the full new state and its effective dates through for the database to diff", async () => {
    await updateTenant(ctx, "00000000-0000-4000-8000-000000000101", {
      ...contact,
      unitCodes: ["AC-T1-G01", "AC-T1-G05"],
      unitsEffective: "2026-03-01",
      monthlyRentAmount: 5500,
      rentEffectiveMonth: "2026-04",
    });
    expect(fakes.owner.tenants.update).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000101", {
      name: "Mohan Das",
      business_name: null,
      phone: "+919876543210",
      preferred_channel: "both",
      unit_codes: ["AC-T1-G01", "AC-T1-G05"],
      units_effective: "2026-03-01",
      monthly_rent: 5500,
      rent_effective_month: "2026-04-01",
      lease_start: null,
      paid_through: null,
      deposit_amount: null,
      tenant_kind: null,
      rent_tracked: null,
    });
  });

  it("moves a tenant out on a date", async () => {
    await moveOutTenant(ctx, "00000000-0000-4000-8000-000000000101", { moveOutDate: "2026-03-20" });
    expect(fakes.owner.tenants.moveOut).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000101", "2026-03-20");
    await expect(moveOutTenant(ctx, "00000000-0000-4000-8000-000000000101", { moveOutDate: "20-03-2026" })).rejects.toMatchObject({ status: 400 });
  });
});

describe("reads", () => {
  it("shows a tenant's houses and combined rent from the history tables", async () => {
    const { tenant } = await getTenantDetail(ctx, "00000000-0000-4000-8000-000000000101");
    expect(tenant.currentUnits.map((u) => u.unitCode)).toEqual(["AC-T1-G01", "AC-T1-G02"]);
    expect(tenant.unitMix).toBe("commercial");
    expect(tenant.monthlyRent).toBe(5000);
    expect(tenant.rentHistory).toEqual([{ effectiveMonth: "2026-01-01", monthlyAmount: 5000 }]);
  });

  it("lists a tower's houses with their occupant; malformed codes are just not found", async () => {
    const detail = await getPropertyDetail(ctx, "AC-T1");
    expect(detail.units.map((u) => [u.unitCode, u.currentTenant?.displayName])).toEqual([
      ["AC-T1-G01", "Asha"],
      ["AC-T1-G02", "Asha"],
    ]);
    expect(detail.tenants).toEqual([expect.objectContaining({ id: "00000000-0000-4000-8000-000000000101", unitCodes: ["AC-T1-G01", "AC-T1-G02"] })]);
    await expect(getPropertyDetail(ctx, "not a code")).rejects.toMatchObject({ status: 404 });
  });
});

describe("receipts and storage", () => {
  it("files signatures per tenant (no property id) and prints the houses on the receipt", async () => {
    const tenantId = "7f1c0d3e-2b1a-4c5d-8e9f-0a1b2c3d4e5f";
    fakes.state.tenants.set(tenantId, tenant({ id: tenantId }));
    await createPayment(ctx, tenantId, {
      amount: 5000,
      paymentDate: "2026-03-05",
      mode: "upi",
      allocations: [{ rentPeriodId: "6f1c0d3e-2b1a-4c5d-8e9f-0a1b2c3d4e5f", amountAllocated: 5000 }],
      ownerSignaturePng: PNG_DATA_URL,
    });
    const [signaturePath] = [...fakes.state.files.keys()];
    expect(signaturePath).toMatch(new RegExp(`^payments/${tenantId}/[0-9a-f-]{36}/owner-signature\\.png$`));

    await confirmRecord("token", { recordType: "payment", otpCode: "123456", tenantSignaturePng: PNG_DATA_URL }, { ip: "x" });
    expect(vi.mocked(generateReceiptPdf).mock.calls[0][0]).toMatchObject({
      propertyName: "Arnapal Chakk Complex, Tower 1",
      unitCodes: ["AC-T1-G01", "AC-T1-G02"],
    });
    const [, patch] = fakes.system.payments.acknowledge.mock.calls[0] as unknown as [string, { pdf_path: string }];
    expect(patch.pdf_path).toMatch(/^payments\/00000000-0000-4000-8000-000000000101\/00000000-0000-4000-8000-000000000201\/[0-9a-f-]{36}\/receipt\.pdf$/);
  });
});

describe("correctPaidThrough", () => {
  it("takes a yyyy-MM month and passes the first of it to the database", async () => {
    await correctPaidThrough(ctx, "00000000-0000-4000-8000-000000000101", { paidThrough: "2026-07" });
    expect(fakes.owner.tenants.correctPaidThrough).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000101", "2026-07-01");
  });

  it("rejects a bad month and an unknown tenant", async () => {
    await expect(correctPaidThrough(ctx, "00000000-0000-4000-8000-000000000101", { paidThrough: "July" })).rejects.toMatchObject({ status: 400 });
    await expect(correctPaidThrough(ctx, "nobody", { paidThrough: "2026-07" })).rejects.toMatchObject({ status: 404 });
    expect(fakes.owner.tenants.correctPaidThrough).not.toHaveBeenCalled();
  });
});

describe("government tenants (0016)", () => {
  const govt = { name: "Block Office", preferredChannel: "both", tenantKind: "government" };
  const GOVT_ID = "00000000-0000-4000-8000-000000000102";

  it("onboards a government tenant with no phone, no rent and its rent untracked", async () => {
    await createTenant(ctx, { ...govt, rentTracked: false, leaseStart: "2020-04-01", unitCodes: ["AC-T1-G03"] });
    expect(fakes.owner.tenants.create).toHaveBeenCalledWith(
      expect.objectContaining({ phone: null, monthly_rent: null, tenant_kind: "government", rent_tracked: false })
    );
  });

  it("refuses a missing phone, an untracked rent or no rent for anyone else", async () => {
    const base = { ...contact, leaseStart: "2026-02-01", unitCodes: ["AC-T1-G03"] };
    await expect(createTenant(ctx, { ...base, phone: undefined, monthlyRentAmount: 5000 })).rejects.toMatchObject({ status: 400 });
    await expect(createTenant(ctx, { ...base, monthlyRentAmount: 5000, rentTracked: false })).rejects.toMatchObject({ status: 400 });
    await expect(createTenant(ctx, base)).rejects.toMatchObject({ status: 400 });
    await expect(createTenant(ctx, { ...govt, leaseStart: "2026-02-01", unitCodes: ["AC-T1-G03"] })).rejects.toMatchObject({
      status: 400,
    });
    expect(fakes.owner.tenants.create).not.toHaveBeenCalled();
  });

  it("an untracked tenant gets no rent months and can start tracking from a month", async () => {
    fakes.state.tenants.set(GOVT_ID, tenant({ id: GOVT_ID, tenant_kind: "government", rent_tracked: false, billing_start: null }));
    const rows = await listTenants(ctx);
    expect(rows.find((r) => r.tenantId === "00000000-0000-4000-8000-000000000101")?.monthlyRent).toBe(5000);
    expect(fakes.system.rentPeriods.ensure).toHaveBeenCalledWith(["00000000-0000-4000-8000-000000000101"], expect.any(String));

    await startRentTracking(ctx, GOVT_ID, { monthlyRentAmount: 20000, paidThrough: "2026-02" });
    expect(fakes.owner.tenants.startRentTracking).toHaveBeenCalledWith(GOVT_ID, 20000, "2026-02-01");
    await startRentTracking(ctx, GOVT_ID, {});
    expect(fakes.owner.tenants.startRentTracking).toHaveBeenLastCalledWith(GOVT_ID, null, null);
    await expect(startRentTracking(ctx, GOVT_ID, { paidThrough: "Feb" })).rejects.toMatchObject({ status: 400 });

    await stopRentTracking(ctx, GOVT_ID);
    expect(fakes.owner.tenants.stopRentTracking).toHaveBeenCalledWith(GOVT_ID);
    await expect(stopRentTracking(ctx, "nobody")).rejects.toMatchObject({ status: 404 });
  });

  it("offers to stop tracking only for a government tenant with nothing recorded", async () => {
    fakes.state.tenants.set(GOVT_ID, tenant({ id: GOVT_ID, tenant_kind: "government" }));
    expect((await getTenantDetail(ctx, GOVT_ID)).canStopRentTracking).toBe(false); // a payment is recorded
    fakes.state.payments.clear();
    expect((await getTenantDetail(ctx, GOVT_ID)).canStopRentTracking).toBe(true);
    expect((await getTenantDetail(ctx, "00000000-0000-4000-8000-000000000101")).canStopRentTracking).toBe(false);
  });
});

describe("path ids", () => {
  it("404s a malformed tenant id before it reaches the database", async () => {
    await expect(getTenantDetail(ctx, "not-a-uuid")).rejects.toMatchObject({ status: 404 });
    await expect(moveOutTenant(ctx, "1; drop", { moveOutDate: "2026-10-01" })).rejects.toMatchObject({ status: 404 });
    expect(fakes.owner.tenants.get).not.toHaveBeenCalled();
  });
});
