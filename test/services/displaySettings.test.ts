import { beforeEach, describe, expect, it, vi } from "vitest";
import { OWNER_ID, fakes, resetFakes } from "../fakes";

vi.mock("@/server/infra", async () => (await import("../fakes")).infraMock());

const { getDisplaySettings, getMyDisplaySettings, setDisplaySettings } = await import("@/server/services/displaySettings");

const ctx = { ownerId: OWNER_ID };

beforeEach(() => {
  resetFakes();
});

describe("display settings (0040, A36)", () => {
  it("reads the date format, dd/MMM/yyyy by default", async () => {
    expect(await getDisplaySettings(ctx)).toEqual({ dateFormat: "DD/MMM/YYYY" });
  });

  it("saves one of the offered formats and refuses anything else", async () => {
    expect(await setDisplaySettings(ctx, { dateFormat: "YYYY-MM-DD" })).toEqual({ dateFormat: "YYYY-MM-DD" });
    expect(fakes.owner.appSettings.setDateFormat).toHaveBeenCalledWith("YYYY-MM-DD");
    for (const dateFormat of ["MM/DD/YYYY", "", null, 42]) {
      await expect(setDisplaySettings(ctx, { dateFormat })).rejects.toMatchObject({ status: 400 });
    }
    expect(fakes.owner.appSettings.setDateFormat).toHaveBeenCalledTimes(1);
  });

  it("gives the tenant portal the owner's choice", async () => {
    await setDisplaySettings(ctx, { dateFormat: "DD MMM YYYY" });
    expect(await getMyDisplaySettings({ tenantId: "00000000-0000-4000-8000-000000000101" } as never)).toEqual({
      dateFormat: "DD MMM YYYY",
    });
  });
});
