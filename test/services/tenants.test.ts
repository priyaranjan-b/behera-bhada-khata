import { beforeEach, describe, expect, it, vi } from "vitest";
import { OWNER_ID, PNG_DATA_URL, fakes, resetFakes, tenant } from "../fakes";

vi.mock("@/server/infra", async () => (await import("../fakes")).infraMock());
vi.mock("@/server/pdf/receipt", () => ({ generateReceiptPdf: vi.fn(async () => new Uint8Array([37, 80, 68, 70])) }));

const { generateReceiptPdf } = await import("@/server/pdf/receipt");
const {
  correctPaidThrough,
  bulkCreateTenants,
  correctRent,
  createTenant,
  getTenantAccount,
  getTenantDetail,
  getTenantLedger,
  getTenantMonths,
  listTenants,
  moveOutTenant,
  startRentTracking,
  stopRentTracking,
  updateTenant,
} = await import(
  "@/server/services/tenants"
);
const { getPropertyHeader, listPropertyHouses, listPropertyTenants, setHouseRent } = await import(
  "@/server/services/properties"
);
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
      houseRents: [
        { unitCode: "ac-t1-g03", share: 7000 },
        { unitCode: "AC-T1-G04", share: 5000 },
      ],
    });
    expect(fakes.owner.tenants.create).toHaveBeenCalledWith(
      expect.objectContaining({ monthly_rent: 12000, unit_codes: ["AC-T1-G03", "AC-T1-G04"], lease_start: "2026-02-01" }),
      // Each house's rent, as the owner split it (D39).
      [
        { unit_code: "AC-T1-G03", base_rent: 7000 },
        { unit_code: "AC-T1-G04", base_rent: 5000 },
      ]
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
    expect(fakes.owner.tenants.create).toHaveBeenCalledWith(expect.objectContaining({ paid_through: "2026-08-01" }), [
      { unit_code: "AC-T1-G06", base_rent: 4000 },
    ]);

    await createTenant(ctx, {
      ...contact,
      monthlyRentAmount: 4000,
      leaseStart: "2026-10-01",
      unitCodes: ["AC-T1-G06"],
      depositAmount: "15000.50",
    });
    expect(fakes.owner.tenants.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ deposit_amount: 15000.5 }),
      expect.anything()
    );

    await updateTenant(ctx, "00000000-0000-4000-8000-000000000101", {
      ...contact,
      unitCodes: ["AC-T1-G01"],
      monthlyRentAmount: 12000,
      leaseStart: "2019-04-01",
      paidThrough: "2026-09",
    });
    expect(fakes.owner.tenants.update).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000101",
      expect.objectContaining({ lease_start: "2019-04-01", paid_through: "2026-09-01" }),
      // One house: it takes the whole rent, nothing to ask.
      [{ unit_code: "AC-T1-G01", base_rent: 12000 }]
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
      houseRents: [
        { unitCode: "AC-T1-G01", share: 3000 },
        { unitCode: "AC-T1-G05", share: 2500 },
      ],
    });
    expect(fakes.owner.tenants.update).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000101",
      {
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
      },
      [
        { unit_code: "AC-T1-G01", base_rent: 3000 },
        { unit_code: "AC-T1-G05", base_rent: 2500 },
      ]
    );
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
    expect(await getPropertyHeader(ctx, "AC-T1")).toMatchObject({ code: "AC-T1" });
    expect((await listPropertyHouses(ctx, "AC-T1")).map((u) => [u.unitCode, u.currentTenant?.displayName])).toEqual([
      ["AC-T1-G01", "Asha"],
      ["AC-T1-G02", "Asha"],
    ]);
    expect(await listPropertyTenants(ctx, "AC-T1")).toEqual([
      expect.objectContaining({ id: "00000000-0000-4000-8000-000000000101", unitCodes: ["AC-T1-G01", "AC-T1-G02"] }),
    ]);
    for (const read of [getPropertyHeader, listPropertyHouses, listPropertyTenants]) {
      await expect(read(ctx, "not a code")).rejects.toMatchObject({ status: 404 });
    }
    // A well-formed code with no tower is a 404 for every section, not an empty list.
    fakes.owner.properties.get.mockResolvedValue(null as never);
    for (const read of [getPropertyHeader, listPropertyHouses, listPropertyTenants]) {
      await expect(read(ctx, "AC-T9")).rejects.toMatchObject({ status: 404 });
    }
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

describe("correctRent", () => {
  const id = "00000000-0000-4000-8000-000000000101";

  it("passes the first of the month and the rent to the database", async () => {
    const houseRents = [
      { unitCode: "AC-T1-G01", share: 600 },
      { unitCode: "AC-T1-G02", share: 400 },
    ];
    await correctRent(ctx, id, { fromMonth: "2026-04", monthlyRent: 1000, houseRents });
    expect(fakes.owner.tenants.correctRent).toHaveBeenCalledWith(id, "2026-04-01", 1000, [
      { unit_code: "AC-T1-G01", base_rent: 600 },
      { unit_code: "AC-T1-G02", base_rent: 400 },
    ]);
  });

  it("rejects a bad month or rent and an unknown tenant", async () => {
    await expect(correctRent(ctx, id, { fromMonth: "April", monthlyRent: 1000 })).rejects.toMatchObject({ status: 400 });
    await expect(correctRent(ctx, id, { fromMonth: "2026-04", monthlyRent: 0 })).rejects.toMatchObject({ status: 400 });
    await expect(correctRent(ctx, "nobody", { fromMonth: "2026-04", monthlyRent: 1000 })).rejects.toMatchObject({ status: 404 });
    expect(fakes.owner.tenants.correctRent).not.toHaveBeenCalled();
  });
});

describe("government tenants (0016)", () => {
  const govt = { name: "Block Office", preferredChannel: "both", tenantKind: "government" };
  const GOVT_ID = "00000000-0000-4000-8000-000000000102";

  it("onboards a government tenant with no phone, no rent and its rent untracked", async () => {
    await createTenant(ctx, { ...govt, rentTracked: false, leaseStart: "2020-04-01", unitCodes: ["AC-T1-G03"] });
    expect(fakes.owner.tenants.create).toHaveBeenCalledWith(
      expect.objectContaining({ phone: null, monthly_rent: null, tenant_kind: "government", rent_tracked: false }),
      []
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
    expect(fakes.owner.tenants.startRentTracking).toHaveBeenCalledWith(GOVT_ID, 20000, "2026-02-01", []);
    await startRentTracking(ctx, GOVT_ID, {});
    expect(fakes.owner.tenants.startRentTracking).toHaveBeenLastCalledWith(GOVT_ID, null, null, []);
    await expect(startRentTracking(ctx, GOVT_ID, { paidThrough: "Feb" })).rejects.toMatchObject({ status: 400 });

    await stopRentTracking(ctx, GOVT_ID);
    expect(fakes.owner.tenants.stopRentTracking).toHaveBeenCalledWith(GOVT_ID);
    await expect(stopRentTracking(ctx, "nobody")).rejects.toMatchObject({ status: 404 });
  });

  it("reads the account as one SQL aggregate, after topping the months up, never the full history (D29)", async () => {
    fakes.owner.tenants.accountSummary.mockResolvedValueOnce({
      total_outstanding: "12500.50" as unknown as number, // numeric arrives as text from PostgREST
      overdue_months: 2,
      not_yet_due: 5000,
      ended_months: 13,
      paid_ended_months: 11,
      can_stop_rent_tracking: true,
    });
    const account = await getTenantAccount(ctx, "00000000-0000-4000-8000-000000000101");
    expect(account).toEqual({
      balance: { totalOutstanding: 12500.5, overdueMonths: 2, notYetDue: 5000 },
      endedMonths: 13,
      paidEndedMonths: 11,
      canStopRentTracking: true,
    });
    expect(fakes.owner.tenants.accountSummary).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000101");
    expect(fakes.system.rentPeriods.ensure).toHaveBeenCalledWith(["00000000-0000-4000-8000-000000000101"], expect.any(String));
    expect(fakes.owner.rentPeriods.listForTenants).not.toHaveBeenCalled();
    expect(fakes.owner.payments.listForTenants).not.toHaveBeenCalled();
    expect(fakes.owner.adjustments.listForTenants).not.toHaveBeenCalled();
  });
});

describe("the Months table (A15)", () => {
  it("asks the database for one page of months, as database columns, after topping the months up", async () => {
    const page = await getTenantMonths(ctx, "00000000-0000-4000-8000-000000000101", {
      show: "unpaid",
      q: " march ",
      sort: "amountAllocated",
      dir: "asc",
      filters: JSON.stringify([{ field: "periodMonth", operator: "contains", value: "2026" }]),
      pageSize: "25",
    });
    expect(fakes.owner.rentPeriods.page).toHaveBeenLastCalledWith({
      tenantId: "00000000-0000-4000-8000-000000000101",
      show: "unpaid",
      search: "march",
      filters: [{ field: "month", operator: "contains", value: "2026" }],
      logic: "and",
      sort: "amount_allocated",
      dir: "asc",
      page: 0,
      pageSize: 25,
    });
    expect(page).toEqual({
      rows: [
        {
          id: "period-mar",
          periodMonth: "2026-03-01",
          amountDue: 5000,
          amountAllocated: 0,
          status: "pending",
          displayStatus: "pending",
          monthLabel: "March 2026",
        },
      ],
      total: 1,
      all: 1,
      page: 0,
      // The database's sums over every matching month, keyed by the grid's fields (A26).
      totals: { amountDue: 5000, amountAllocated: 0 },
      notYetDue: 0,
    });
  });

  it("rejects a bad query and 404s a bad tenant id", async () => {
    const id = "00000000-0000-4000-8000-000000000101";
    await expect(getTenantMonths(ctx, id, { show: "everything" })).rejects.toMatchObject({ status: 400 });
    await expect(getTenantMonths(ctx, id, { sort: "id" })).rejects.toMatchObject({ status: 400 });
    await expect(getTenantMonths(ctx, "not-a-uuid", {})).rejects.toMatchObject({ status: 404 });
    expect(fakes.owner.rentPeriods.page).not.toHaveBeenCalled();
  });
});

describe("the Ledger table (A15)", () => {
  it("asks the database for one page of the ledger and attaches only that page's proofs", async () => {
    const id = "00000000-0000-4000-8000-000000000101";
    const view = await getTenantLedger(ctx, id, {
      from: "2026-03-01",
      to: "2026-03-31",
      q: "neft",
      sort: "balance",
      filters: JSON.stringify([{ field: "status", operator: "equals", value: "Confirmed" }]),
    });
    expect(fakes.owner.ledger.page).toHaveBeenLastCalledWith({
      tenantId: id,
      fromDate: "2026-03-01",
      toDate: "2026-03-31",
      creditsOnly: false,
      search: "neft",
      filters: [{ field: "status", operator: "equals", value: "Confirmed" }],
      logic: "and",
      sort: "balance",
      dir: "desc",
      page: 0,
      pageSize: 10,
    });
    expect(view).toMatchObject({ total: view.rows.length, page: 0, tenantMessaging: true });
    // The footer totals come from the database's sums, as they are (A26).
    expect(view.totals).toEqual({ debit: 0, credit: view.rows.reduce((sum, r) => sum + r.credit, 0) });
    expect(view.uncountedRows).toBe(0);
    const pageIds = view.rows.map((r) => r.refId);
    for (const call of fakes.owner.payments.listProofs.mock.calls) expect(call[0]).toEqual(pageIds);
  });

  it('"credits" asks for money-in rows only; an unknown show is refused', async () => {
    const id = "00000000-0000-4000-8000-000000000101";
    await getTenantLedger(ctx, id, { show: "credits" });
    expect(fakes.owner.ledger.page).toHaveBeenLastCalledWith(expect.objectContaining({ creditsOnly: true }));
    await expect(getTenantLedger(ctx, id, { show: "debits" })).rejects.toMatchObject({ status: 400 });
  });

  it("rejects a reversed range or an unknown sort, and 404s a bad tenant id", async () => {
    const id = "00000000-0000-4000-8000-000000000101";
    await expect(getTenantLedger(ctx, id, { from: "2026-04-01", to: "2026-03-01" })).rejects.toMatchObject({ status: 400 });
    await expect(getTenantLedger(ctx, id, { sort: "refId" })).rejects.toMatchObject({ status: 400 });
    expect(fakes.owner.ledger.page).not.toHaveBeenCalled();
  });
});

describe("path ids", () => {
  it("404s a malformed tenant id before it reaches the database", async () => {
    await expect(getTenantDetail(ctx, "not-a-uuid")).rejects.toMatchObject({ status: 404 });
    await expect(getTenantAccount(ctx, "not-a-uuid")).rejects.toMatchObject({ status: 404 });
    await expect(getTenantLedger(ctx, "not-a-uuid", {})).rejects.toMatchObject({ status: 404 });
    await expect(moveOutTenant(ctx, "1; drop", { moveOutDate: "2026-10-01" })).rejects.toMatchObject({ status: 404 });
    expect(fakes.owner.tenants.get).not.toHaveBeenCalled();
  });
});

describe("house rents (D39)", () => {
  const id = "00000000-0000-4000-8000-000000000101"; // holds AC-T1-G01 and G02 at 5,000
  const both = ["AC-T1-G01", "AC-T1-G02"];

  it("asks for a split when a rent is set on several houses, and refuses one that is off", async () => {
    const onboard = { ...contact, monthlyRentAmount: 9000, leaseStart: "2026-02-01", unitCodes: ["AC-T1-G03", "AC-T1-G04"] };
    await expect(createTenant(ctx, onboard)).rejects.toMatchObject({ status: 400, message: /Split the rent/ });
    await expect(
      createTenant(ctx, {
        ...onboard,
        houseRents: [
          { unitCode: "AC-T1-G03", share: 4000 },
          { unitCode: "AC-T1-G04", share: 4000 },
        ],
      })
    ).rejects.toMatchObject({ status: 400, message: /less than the rent/ });
    await expect(
      createTenant(ctx, {
        ...onboard,
        houseRents: [
          { unitCode: "AC-T1-G03", share: 4500 },
          { unitCode: "AC-T1-G09", share: 4500 },
        ],
      })
    ).rejects.toMatchObject({ status: 400 });
    expect(fakes.owner.tenants.create).not.toHaveBeenCalled();

    await expect(correctRent(ctx, id, { fromMonth: "2026-04", monthlyRent: 6000 })).rejects.toMatchObject({ status: 400 });
    expect(fakes.owner.tenants.correctRent).not.toHaveBeenCalled();
  });

  it("leaves the houses' rents alone when an edit changes neither the rent nor the houses", async () => {
    await updateTenant(ctx, id, { ...contact, name: "Asha R", unitCodes: both, monthlyRentAmount: 5000 });
    expect(fakes.owner.tenants.update).toHaveBeenCalledWith(id, expect.objectContaining({ name: "Asha R" }), []);
  });

  it("sets them when only the houses change, splitting the same rent", async () => {
    await updateTenant(ctx, id, { ...contact, unitCodes: ["AC-T1-G01"], monthlyRentAmount: 5000 });
    expect(fakes.owner.tenants.update).toHaveBeenLastCalledWith(id, expect.anything(), [
      { unit_code: "AC-T1-G01", base_rent: 5000 },
    ]);
  });

  it("leaves a moved-out tenant's old houses alone: they may be let again", async () => {
    fakes.state.tenants.set(id, tenant({ id, status: "inactive" }));
    await correctRent(ctx, id, { fromMonth: "2026-04", monthlyRent: 6000 });
    expect(fakes.owner.tenants.correctRent).toHaveBeenCalledWith(id, "2026-04-01", 6000, []);
  });

  it("splits equally on bulk upload, which asks nothing", async () => {
    await bulkCreateTenants(ctx, [
      { ...contact, monthlyRentAmount: 1000, leaseStart: "2026-02-01", unitCodes: ["AC-T1-G05", "AC-T1-G03", "AC-T1-G04"] },
    ]);
    expect(fakes.owner.tenants.create).toHaveBeenCalledWith(expect.anything(), [
      { unit_code: "AC-T1-G03", base_rent: 333.34 },
      { unit_code: "AC-T1-G04", base_rent: 333.33 },
      { unit_code: "AC-T1-G05", base_rent: 333.33 },
    ]);
  });

  it("lists each house's rent, and what its tenant pays against their houses' rents", async () => {
    const [g01] = await listPropertyHouses(ctx, "AC-T1");
    expect(g01).toMatchObject({ baseRent: null, currentTenant: { monthlyRent: 5000, housesRent: 0 } });

    fakes.owner.units.list.mockImplementation(async (filter?: { unitCodes?: string[] }) =>
      both
        .filter((c) => !filter?.unitCodes || filter.unitCodes.includes(c))
        .map((unit_code) => ({
          unit_code,
          property_code: "AC-T1",
          house_number: unit_code.slice(-3),
          floor: "G",
          unit_type: "commercial" as const,
          label: null,
          is_active: true,
          created_at: "",
          updated_at: "",
          base_rent: unit_code === "AC-T1-G01" ? 3000 : 2500,
        }))
    );
    const rows = await listPropertyHouses(ctx, "AC-T1");
    expect(rows.map((r) => [r.unitCode, r.baseRent, r.currentTenant?.housesRent])).toEqual([
      ["AC-T1-G01", 3000, 5500],
      ["AC-T1-G02", 2500, 5500],
    ]);

    // A rise saved today from a later month: the houses' rents already follow it,
    // so they are compared with the newest rate, not this month's - no false flag.
    fakes.owner.rentRates.listForTenants.mockResolvedValue([
      { id: 1, tenant_id: id, effective_month: "2026-01-01", monthly_amount: 5000, created_at: "", recorded_by: OWNER_ID },
      { id: 2, tenant_id: id, effective_month: "2099-01-01", monthly_amount: 5500, created_at: "", recorded_by: OWNER_ID },
    ]);
    const [risen] = await listPropertyHouses(ctx, "AC-T1");
    expect(risen.currentTenant).toMatchObject({ monthlyRent: 5500, housesRent: 5500 });
  });

  it("sets one house's rent by hand; a bad code is a 404, an empty rent clears it", async () => {
    await setHouseRent(ctx, "ac-t1-g01", { baseRent: 6500 });
    expect(fakes.owner.units.setRents).toHaveBeenCalledWith([{ unit_code: "AC-T1-G01", base_rent: 6500 }]);
    await setHouseRent(ctx, "AC-T1-G02", { baseRent: null });
    expect(fakes.owner.units.setRents).toHaveBeenLastCalledWith([{ unit_code: "AC-T1-G02", base_rent: null }]);
    await expect(setHouseRent(ctx, "not a code", { baseRent: 6500 })).rejects.toMatchObject({ status: 404 });
    await expect(setHouseRent(ctx, "AC-T1-G99", { baseRent: 6500 })).rejects.toMatchObject({ status: 404 });
    await expect(setHouseRent(ctx, "AC-T1-G01", { baseRent: 0 })).rejects.toMatchObject({ status: 400 });
    expect(fakes.owner.units.setRents).toHaveBeenCalledTimes(2);
  });
});
