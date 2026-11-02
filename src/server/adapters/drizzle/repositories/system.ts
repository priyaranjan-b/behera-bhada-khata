import "server-only";
import type { SystemRepositories } from "@/server/ports";
import type { Db } from "../client";
import type { RepositoryOverrides } from "./owner";

/**
 * The unscoped repositories that have moved to Drizzle (A19), run as
 * service_role through inScope. Only for flows that authorize another way
 * (confirm token, rent-period upkeep, rate limits, cron).
 */
export function drizzleSystemRepositories(_db: Db): RepositoryOverrides<SystemRepositories> {
  return {};
}
