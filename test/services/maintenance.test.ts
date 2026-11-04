import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OWNER_ID, fakes, resetFakes } from "../fakes";
import { MAINTENANCE_FILE_LIMITS } from "@/lib/validation";

vi.mock("@/server/infra", async () => (await import("../fakes")).infraMock());

const {
  addMaintenanceFiles,
  createMaintenanceExpense,
  deleteMaintenanceFile,
  getMaintenanceExpense,
  getMaintenanceForm,
  getMaintenancePage,
  maintenanceFileUrl,
  setMaintenanceTags,
  updateMaintenanceExpense,
  voidMaintenanceExpense,
} = await import("@/server/services/maintenance");
const { maintenanceHistory } = await import("@/server/services/audit");

const ctx = { ownerId: OWNER_ID };
const jpeg = (name = "bill.jpg") => ({ name, bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2]) });
const pdf = { name: "invoice.pdf", bytes: new TextEncoder().encode("%PDF-1.7 ...") };
const input = (over: Record<string, unknown> = {}) => ({
  expenseDate: "2026-10-20",
  amount: 1000,
  category: "plumbing",
  description: "  Tap repair ",
  vendor: "",
  unitCodes: ["ac-t1-g02", "AC-T1-G01"],
  tags: ["padma", "Gopal"],
  ...over,
});

beforeEach(() => {
  resetFakes();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-25T06:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createMaintenanceExpense", () => {
  it("records the expense on its houses with who paid, and stores receipts under its folder", async () => {
    const { id } = await createMaintenanceExpense(ctx, input(), [jpeg(), pdf]);
    const [, fields, unitCodes, tags, files] = fakes.owner.maintenance.create.mock.calls[0];
    expect(fields).toEqual({
      expense_date: "2026-10-20",
      amount: 1000,
      category: "plumbing",
      description: "Tap repair",
      vendor: null,
      note: null,
    });
    expect(unitCodes).toEqual(["AC-T1-G02", "AC-T1-G01"]);
    expect(tags).toEqual(["padma", "Gopal"]);
    expect(files.map((f) => [f.expense_id, f.content_type])).toEqual([
      [id, "image/jpeg"],
      [id, "application/pdf"],
    ]);
    for (const path of fakes.state.files.keys()) expect(path).toMatch(new RegExp(`^maintenance/${id}/files/[0-9a-f]{8}-\\d-`));

    const detail = await getMaintenanceExpense(ctx, id);
    expect(detail.houses.map((h) => [h.unitCode, h.share])).toEqual([
      ["AC-T1-G01", 500],
      ["AC-T1-G02", 500],
    ]);
    expect(detail.files).toHaveLength(2);
  });

  it("refuses a future date, no house, a bad file or too many, before storing anything", async () => {
    await expect(createMaintenanceExpense(ctx, input({ expenseDate: "2026-10-26" }))).rejects.toMatchObject({
      status: 400,
      message: "The date can't be in the future",
    });
    await expect(createMaintenanceExpense(ctx, input({ unitCodes: [] }))).rejects.toMatchObject({ status: 400 });
    await expect(createMaintenanceExpense(ctx, input({ category: "garden" }))).rejects.toMatchObject({ status: 400 });
    await expect(createMaintenanceExpense(ctx, input(), [{ name: "x.txt", bytes: new Uint8Array([1, 2]) }])).rejects.toMatchObject({
      status: 400,
    });
    const many = Array.from({ length: MAINTENANCE_FILE_LIMITS.maxFiles + 1 }, (_, i) => jpeg(`${i}.jpg`));
    await expect(createMaintenanceExpense(ctx, input(), many)).rejects.toMatchObject({ status: 400 });
    expect(fakes.state.files.size).toBe(0);
    expect(fakes.owner.maintenance.create).not.toHaveBeenCalled();
  });

  it("removes the stored receipts when the database refuses the expense", async () => {
    fakes.owner.maintenance.create.mockRejectedValueOnce(Object.assign(new Error("House not found"), { status: 400 }));
    await expect(createMaintenanceExpense(ctx, input(), [jpeg()])).rejects.toThrow("House not found");
    expect(fakes.state.files.size).toBe(0);
  });
});

describe("editing, voiding and tagging", () => {
  let id: string;
  beforeEach(async () => {
    ({ id } = await createMaintenanceExpense(ctx, input({ tags: [] })));
  });

  it("updates every field and the houses", async () => {
    await updateMaintenanceExpense(ctx, id, input({ amount: 600, unitCodes: ["AC-T1-G03"], note: "Second visit" }));
    expect(fakes.owner.maintenance.update).toHaveBeenLastCalledWith(
      id,
      expect.objectContaining({ amount: 600, note: "Second visit" }),
      ["AC-T1-G03"]
    );
    await expect(updateMaintenanceExpense(ctx, "nope", input())).rejects.toMatchObject({ status: 404 });
  });

  it("voids with a reason, once, and then refuses edits", async () => {
    await expect(voidMaintenanceExpense(ctx, id, { reason: "x" })).rejects.toMatchObject({ status: 400 });
    await voidMaintenanceExpense(ctx, id, { reason: "Entered twice" });
    expect((await getMaintenanceExpense(ctx, id)).voidReason).toBe("Entered twice");
    await expect(voidMaintenanceExpense(ctx, id, { reason: "Again" })).rejects.toMatchObject({ status: 409 });
    await expect(updateMaintenanceExpense(ctx, id, input())).rejects.toMatchObject({ status: 409 });
  });

  it("sets who paid, one of each whatever the case", async () => {
    expect(await setMaintenanceTags(ctx, id, { tags: ["Padma", "PADMA", "Malati"] })).toEqual({ tags: ["Malati", "Padma"] });
    await expect(setMaintenanceTags(ctx, "00000000-0000-4000-8000-000000000999", { tags: [] })).rejects.toMatchObject({
      status: 404,
    });
  });

  it("adds, links and deletes files, each only through its own expense", async () => {
    const { files } = await addMaintenanceFiles(ctx, id, [pdf]);
    expect(files.map((f) => f.fileName)).toEqual(["invoice.pdf"]);
    expect(await maintenanceFileUrl(ctx, id, files[0].id)).toMatch(/^https:\/\/storage\.test\/maintenance\//);
    await expect(maintenanceFileUrl(ctx, "00000000-0000-4000-8000-000000000999", files[0].id)).rejects.toMatchObject({ status: 404 });
    await expect(addMaintenanceFiles(ctx, id, [])).rejects.toMatchObject({ status: 400 });
    await deleteMaintenanceFile(ctx, id, files[0].id);
    expect(fakes.state.files.size).toBe(0);
    expect((await getMaintenanceExpense(ctx, id)).files).toEqual([]);
  });

  it("reads the expense's own history", async () => {
    await maintenanceHistory(ctx, id, {});
    expect(fakes.owner.audit.list).toHaveBeenLastCalledWith(expect.objectContaining({ entity: { type: "maintenance", id } }));
    await expect(maintenanceHistory(ctx, "00000000-0000-4000-8000-000000000999", {})).rejects.toMatchObject({ status: 404 });
  });
});

describe("getMaintenancePage", () => {
  it("defaults to this month and maps the grid's fields to the query's columns", async () => {
    const page = await getMaintenancePage(ctx, {
      sort: "unitsText",
      dir: "asc",
      filters: JSON.stringify([{ field: "tags", operator: "is", value: "Padma" }]),
    });
    expect(page).toMatchObject({ from: "2026-10-01", to: "2026-10-31" });
    expect(fakes.owner.maintenance.page).toHaveBeenLastCalledWith(
      expect.objectContaining({
        from: "2026-10-01",
        to: "2026-10-31",
        sort: "units_text",
        dir: "asc",
        filters: [{ field: "tags", operator: "is", value: "Padma" }],
      })
    );
    await getMaintenancePage(ctx, { from: "2026-01-01", to: "2026-03-31" });
    expect(fakes.owner.maintenance.page).toHaveBeenLastCalledWith(expect.objectContaining({ from: "2026-01-01", to: "2026-03-31" }));
  });
});

describe("getMaintenanceForm", () => {
  it("offers every house in use, by tower, and the who-paid suggestions", async () => {
    const form = await getMaintenanceForm(ctx);
    expect(form.tagSuggestions).toEqual(["Padma"]);
    expect(form.houses.length).toBeGreaterThan(0);
    for (const h of form.houses) expect(h).toMatchObject({ propertyCode: expect.any(String), propertyName: expect.any(String) });
  });
});
