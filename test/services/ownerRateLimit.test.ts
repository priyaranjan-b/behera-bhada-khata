import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakes, resetFakes } from "../fakes";

vi.mock("@/server/infra", async () => (await import("../fakes")).infraMock());

const { enforceOwnerRateLimit, RATE_LIMITS } = await import("@/server/services/context");
const { requestMeta } = await import("@/server/http");

const ctx = { ownerId: "00000000-0000-4000-8000-000000000001" };

beforeEach(() => {
  resetFakes();
});

describe("enforceOwnerRateLimit (A17)", () => {
  it("counts each owner API call against the owner's per-minute budget", async () => {
    await enforceOwnerRateLimit(ctx);
    expect(fakes.system.rateLimits.hit).toHaveBeenCalledWith(
      `owner:${ctx.ownerId}`,
      RATE_LIMITS.ownerApiPerMinute.limit,
      RATE_LIMITS.ownerApiPerMinute.windowSeconds
    );
  });

  it("is a 429 once the budget is spent", async () => {
    fakes.state.rateLimitAllows = false;
    await expect(enforceOwnerRateLimit(ctx)).rejects.toMatchObject({ status: 429 });
  });
});

describe("requestMeta (A17)", () => {
  const ipOf = (headers: Record<string, string>) => requestMeta(new Request("https://app.test/", { headers })).ip;

  it("trusts only the last x-forwarded-for hop, the one our proxy added", () => {
    expect(ipOf({ "x-forwarded-for": "203.0.113.7" })).toBe("203.0.113.7");
    // A client can send its own header; a proxy appends the address it saw.
    expect(ipOf({ "x-forwarded-for": "1.2.3.4, 203.0.113.7" })).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip, then unknown", () => {
    expect(ipOf({ "x-real-ip": "198.51.100.2" })).toBe("198.51.100.2");
    expect(ipOf({})).toBe("unknown");
  });
});
