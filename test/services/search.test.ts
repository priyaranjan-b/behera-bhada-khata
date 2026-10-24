import { beforeEach, describe, expect, it, vi } from "vitest";
import { OWNER_ID, fakes, resetFakes } from "../fakes";

vi.mock("@/server/infra", async () => (await import("../fakes")).infraMock());

const { getSearchIndex } = await import("@/server/services/search");

const ctx = { ownerId: OWNER_ID };

describe("getSearchIndex", () => {
  beforeEach(() => resetFakes());

  it("lists tenants with their houses and puts the occupant on held houses", async () => {
    const index = await getSearchIndex(ctx);
    expect(index.tenants).toEqual([
      { tenantId: "00000000-0000-4000-8000-000000000101", displayName: "Asha", name: "Asha", businessName: null, status: "active", unitCodes: ["AC-T1-G01", "AC-T1-G02"] },
    ]);
    expect(index.units.map((u) => [u.unitCode, u.occupant?.tenantId ?? null])).toEqual([
      ["AC-T1-G01", "00000000-0000-4000-8000-000000000101"],
      ["AC-T1-G02", "00000000-0000-4000-8000-000000000101"],
    ]);
  });

  it("leaves out retired houses and shows vacant ones with no occupant", async () => {
    const [g01, g02] = await fakes.owner.units.list();
    fakes.owner.units.list.mockResolvedValue([{ ...g01, is_active: false }, g02]);
    fakes.owner.occupancy.list.mockResolvedValue([]);
    const index = await getSearchIndex(ctx);
    expect(index.units).toEqual([
      { unitCode: "AC-T1-G02", label: null, propertyCode: "AC-T1", propertyName: "Tower 1", occupant: null },
    ]);
  });
});
