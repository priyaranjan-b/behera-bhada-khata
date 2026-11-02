import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/errors";
import { must, mustWrite, writeError } from "./errors";

/** What Drizzle throws: its own text lists the query's parameters, the driver error is the cause. */
function drizzleError(cause: object) {
  return Object.assign(new Error(`Failed query: select 1\nparams: +919876543210,owner@example.com`), { cause });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("writeError", () => {
  it("passes a BBK error through with the SQL function's own message", () => {
    const err = writeError(drizzleError({ code: "BBK09", message: "That month already has a payment" }), "save");
    expect(err).toEqual(new ApiError(409, "That month already has a payment"));
  });

  it("maps constraint and policy violations to the user's input problem", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(writeError(drizzleError({ code: "23505", message: "dup" }), "save")).toEqual(new ApiError(409, "That already exists"));
    expect(writeError(drizzleError({ code: "42501", message: "denied" }), "save")).toEqual(new ApiError(403, "Not allowed"));
    expect(writeError(drizzleError({ code: "22P02", message: "bad uuid" }), "save")).toEqual(new ApiError(400, "Couldn't save that"));
  });

  it("turns an outage into a 500, not a 400 blaming the input", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const code of ["CONNECT_TIMEOUT", "ECONNREFUSED", "57014", "53300"]) {
      const err = writeError(drizzleError({ code, message: "down" }), "save payment");
      expect(err).not.toBeInstanceOf(ApiError);
      expect(err.message).toBe(`save payment: [${code}] down`);
    }
    // Not logged here: the route that turns it into a 500 logs it (once).
    expect(log).not.toHaveBeenCalled();
  });

  it("logs the user's mistakes here, since the route doesn't log an ApiError", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = writeError(drizzleError({ code: "23505", message: "duplicate key" }), "add note");
    expect(err).toBeInstanceOf(ApiError);
    expect(log).toHaveBeenCalledWith("add note: [23505] duplicate key");
  });

  it("never logs or returns Drizzle's text, which carries the parameters", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = writeError(new Error("Failed query: select 1\nparams: +919876543210"), "save");
    expect(err.message).not.toContain("+91");
    expect(JSON.stringify(log.mock.calls)).not.toContain("+91");
  });
});

describe("must / mustWrite", () => {
  it("must names the read and keeps no cause that could echo the parameters", async () => {
    const err = (await must(Promise.reject(drizzleError({ code: "08006", message: "connection lost" })), "read tenant account x").catch(
      (e: unknown) => e
    )) as Error;
    expect(err.message).toBe("read tenant account x: [08006] connection lost");
    expect(err.cause).toBeUndefined();
    expect(JSON.stringify(err)).not.toContain("owner@example.com");
  });

  it("mustWrite rethrows the mapped error", async () => {
    await expect(mustWrite(Promise.reject(drizzleError({ code: "BBK04", message: "No such tenant" })), "save")).rejects.toEqual(
      new ApiError(404, "No such tenant")
    );
  });
});
