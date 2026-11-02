import "server-only";
import { index, integer, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { timestamptz } from "./columns";

// 0004_ledger_integrity.sql (D12): fixed-window counters, service role only.

export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    window_start: timestamptz("window_start").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.window_start] }), index("rate_limits_window_start_idx").on(t.window_start)]
);
