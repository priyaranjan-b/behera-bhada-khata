import "server-only";
import type { OwnerRepositories } from "@/server/ports";
import { inScope, type Db, type JwtClaims, type Tx } from "../client";
import { must } from "../errors";
import { tenantAccountSummary } from "../queries/tenantAccountSummary";

/** Some methods of some namespaces: what the Drizzle adapter implements so far. */
export type RepositoryOverrides<R> = { [K in keyof R]?: Partial<R[K]> };

/**
 * The owner's repositories that have moved to Drizzle (A19). Every query
 * runs through inScope(db, { role: "authenticated", claims }), so RLS still
 * refuses anyone but the single app owner. Namespaces not listed here stay
 * on the Supabase adapter (see src/server/infra/index.ts).
 */
export function drizzleOwnerRepositories(db: Db, claims: JwtClaims): RepositoryOverrides<OwnerRepositories> {
  /** A read as the owner; a failure is a 500 naming `what`, like the Supabase adapter's `must`. */
  const read = <T>(what: string, fn: (tx: Tx) => Promise<T>) =>
    must(inScope(db, { role: "authenticated", claims }, fn), what);

  return {
    tenants: {
      accountSummary: (id) => read(`read tenant account ${id}`, (tx) => tenantAccountSummary(tx, id)),
    },
  };
}
