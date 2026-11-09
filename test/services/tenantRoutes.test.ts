// Every API route file, read as text (A32): the tenant API is read-only, and
// every owner endpoint - every write above all - goes through the owner check.
// A new route that breaks either rule fails here before review.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const API = path.resolve(__dirname, "../../src/app/api");

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return name === "route.ts" ? [full] : [];
  });
}

const rel = (file: string) => path.relative(API, file).split(path.sep).join("/");

/** `export const GET = ownerRoute(...)` -> [["GET", "ownerRoute"]]. */
function exportedMethods(source: string): [string, string][] {
  return [...source.matchAll(/export const (GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*=\s*(\w+)/g)].map((m) => [m[1], m[2]]);
}

/** Signing in and out: the tenant API's only writes. */
const TENANT_AUTH_WRITES = ["tenant/auth/otp/route.ts", "tenant/auth/select/route.ts", "tenant/auth/signout/route.ts", "tenant/auth/verify/route.ts"];

describe("the tenant API (A32)", () => {
  const files = routeFiles(path.join(API, "tenant"));

  it("has files", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it("reads only, through the tenant session check, apart from signing in and out", () => {
    for (const file of files) {
      const methods = exportedMethods(readFileSync(file, "utf8"));
      expect(methods.length, rel(file)).toBeGreaterThan(0);
      if (rel(file).startsWith("tenant/auth/")) {
        expect(TENANT_AUTH_WRITES, rel(file)).toContain(rel(file));
        continue;
      }
      for (const [method, helper] of methods) {
        expect(method, rel(file)).toBe("GET");
        expect(["tenantRoute", "tenantLinkRoute"], rel(file)).toContain(helper);
      }
    }
  });

  it("never reaches the owner's services or data", () => {
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, rel(file)).not.toMatch(/ownerRoute|ownerLinkRoute|services\/(tenants|payments|adjustments|tenantDocuments)"/);
    }
  });
});

describe("the owner API", () => {
  it("checks the owner on every method, so a tenant (or anyone else) can change nothing", () => {
    const files = routeFiles(path.join(API, "dashboard"));
    expect(files.length).toBeGreaterThan(20);
    for (const file of files) {
      const methods = exportedMethods(readFileSync(file, "utf8"));
      expect(methods.length, rel(file)).toBeGreaterThan(0);
      for (const [, helper] of methods) expect(["ownerRoute", "ownerLinkRoute"], rel(file)).toContain(helper);
    }
  });
});
