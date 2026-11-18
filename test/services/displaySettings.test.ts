import { beforeEach, describe, expect, it, vi } from "vitest";
import { OWNER_ID, fakes, resetFakes } from "../fakes";

vi.mock("@/server/infra", async () => (await import("../fakes")).infraMock());

const { getDisplaySettings, getMyDisplaySettings, getPublicDisplaySettings, setDisplaySettings } = await import(
  "@/server/services/displaySettings"
);
const { ApiError } = await import("@/lib/errors");

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

  it("shows the default when the read fails, so a cosmetic setting never takes a page down (#17)", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    fakes.owner.appSettings.getDateFormat.mockRejectedValueOnce(new Error("statement timeout"));
    expect(await getDisplaySettings(ctx)).toEqual({ dateFormat: "DD/MMM/YYYY" });
    expect(quiet).toHaveBeenCalledWith(`display settings read failed, using default (owner ${OWNER_ID}): statement timeout`);
    quiet.mockRestore();
  });

  it("still passes on a refusal: a signed-out or non-owner request is not a read failure", async () => {
    fakes.owner.appSettings.getDateFormat.mockRejectedValueOnce(new ApiError(401, "Sign in"));
    await expect(getDisplaySettings(ctx)).rejects.toMatchObject({ status: 401 });
  });

  it("gives the pages without a session (tenant select, confirm links) the same format", async () => {
    await setDisplaySettings(ctx, { dateFormat: "YYYY-MM-DD" });
    expect(await getPublicDisplaySettings()).toEqual({ dateFormat: "YYYY-MM-DD" });
  });

  it("falls back on any refusal but a sign-in one, e.g. a grant gone missing (403 is still a sign-in refusal)", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    fakes.owner.appSettings.getDateFormat.mockRejectedValueOnce(new ApiError(409, "something odd"));
    expect(await getDisplaySettings(ctx)).toEqual({ dateFormat: "DD/MMM/YYYY" });
    fakes.owner.appSettings.getDateFormat.mockRejectedValueOnce(new ApiError(403, "Not the owner"));
    await expect(getDisplaySettings(ctx)).rejects.toMatchObject({ status: 403 });
    quiet.mockRestore();
  });

  it("rate limits the public read per client over HTTP, but not in-process", async () => {
    fakes.state.rateLimitAllows = false;
    await expect(getPublicDisplaySettings({ ip: "203.0.113.9" })).rejects.toMatchObject({ status: 429 });
    expect(await getPublicDisplaySettings()).toEqual({ dateFormat: "DD/MMM/YYYY" });
  });
});
