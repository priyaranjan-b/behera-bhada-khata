import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakes, resetFakes } from "../fakes";

vi.mock("@/server/infra", async () => (await import("../fakes")).infraMock());

const { requestMagicLink, signInWithPassword } = await import("@/server/services/auth");

const meta = { ip: "203.0.113.7" };

beforeEach(() => {
  resetFakes();
});

describe("requestMagicLink", () => {
  it("hands back the link only with ALLOW_DEV_LOGIN=1 outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ALLOW_DEV_LOGIN", "1");
    expect(await requestMagicLink({ email: "a@example.com" }, meta)).toEqual({ dev: true, link: "https://auth.test/link" });
  });

  it("never hands back a link without the flag, or in production even with it", async () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(await requestMagicLink({ email: "a@example.com" }, meta)).toEqual({ dev: false });

    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_DEV_LOGIN", "1");
    const { resetEnvCacheForTests } = await import("@/server/env");
    resetEnvCacheForTests();
    expect(await requestMagicLink({ email: "a@example.com" }, meta)).toEqual({ dev: false });
    expect(fakes.auth.generateMagicLink).not.toHaveBeenCalled();
  });

  it("without OWNER_EMAILS, only existing accounts can sign in", async () => {
    await requestMagicLink({ email: "new@example.com" }, meta);
    expect(fakes.auth.sendMagicLink).toHaveBeenCalledWith("new@example.com", expect.any(String), { allowSignUp: false });
  });

  it("with OWNER_EMAILS, listed owners may sign up and others get the same answer but no email", async () => {
    vi.stubEnv("OWNER_EMAILS", "Owner@Example.com, other@example.com");
    expect(await requestMagicLink({ email: "owner@example.com" }, meta)).toEqual({ dev: false });
    expect(fakes.auth.sendMagicLink).toHaveBeenCalledWith("owner@example.com", expect.any(String), { allowSignUp: true });

    fakes.auth.sendMagicLink.mockClear();
    expect(await requestMagicLink({ email: "stranger@example.com" }, meta)).toEqual({ dev: false });
    expect(fakes.auth.sendMagicLink).not.toHaveBeenCalled();
  });

  it("is rate limited", async () => {
    fakes.state.rateLimitAllows = false;
    await expect(requestMagicLink({ email: "a@example.com" }, meta)).rejects.toMatchObject({ status: 429 });
    expect(fakes.auth.sendMagicLink).not.toHaveBeenCalled();
  });
});

describe("signInWithPassword", () => {
  const owner = { email: "Owner@Example.com", password: "correct-horse", next: "/dashboard/tenants" };

  it("signs the owner in and returns where to go", async () => {
    expect(await signInWithPassword(owner, meta)).toEqual({ next: "/dashboard/tenants" });
    expect(fakes.auth.signInWithPassword).toHaveBeenCalledWith("owner@example.com", "correct-horse");
  });

  it("never sends the owner to another site", async () => {
    expect(await signInWithPassword({ ...owner, next: "https://evil.test" }, meta)).toEqual({ next: "/dashboard" });
  });

  it("answers a wrong password and an email outside OWNER_EMAILS the same way", async () => {
    await expect(signInWithPassword({ ...owner, password: "nope" }, meta)).rejects.toMatchObject({
      status: 400,
      message: "Wrong email or password",
    });

    vi.stubEnv("OWNER_EMAILS", "owner@example.com");
    const { resetEnvCacheForTests } = await import("@/server/env");
    resetEnvCacheForTests();
    fakes.auth.signInWithPassword.mockClear();
    await expect(signInWithPassword({ ...owner, email: "stranger@example.com" }, meta)).rejects.toMatchObject({
      status: 400,
      message: "Wrong email or password",
    });
    expect(fakes.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("signs a non-owner account straight back out", async () => {
    fakes.auth.getSession.mockResolvedValueOnce({ userId: "someone-else", isOwner: false } as never);
    await expect(signInWithPassword(owner, meta)).rejects.toMatchObject({ status: 403 });
    expect(fakes.auth.signOut).toHaveBeenCalled();
  });

  it("is rate limited", async () => {
    fakes.state.rateLimitAllows = false;
    await expect(signInWithPassword(owner, meta)).rejects.toMatchObject({ status: 429 });
    expect(fakes.auth.signInWithPassword).not.toHaveBeenCalled();
  });
});

describe("single-owner gate", () => {
  it("lets only the app owner through owner routes: 401 signed out, 403 for anyone else", async () => {
    const { ownerRoute } = await import("@/server/http");
    const route = ownerRoute(async (ctx) => ({ ownerId: ctx.ownerId }));
    const call = async () => {
      const res = await route(new Request("https://rent.test/api/dashboard"), { params: Promise.resolve({}) });
      return { status: res.status, body: await res.json() };
    };

    expect(await call()).toEqual({ status: 200, body: { ownerId: "00000000-0000-4000-8000-00000000000a" } });

    fakes.auth.getSession.mockResolvedValueOnce({ userId: "someone-else", isOwner: false } as never);
    expect(await call()).toEqual({ status: 403, body: { error: "This account isn't the owner of this rent book" } });

    fakes.auth.getSession.mockResolvedValueOnce(null as never);
    expect((await call()).status).toBe(401);
  });
});
