import "server-only";
import { sql } from "drizzle-orm";
import { pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import { timestamptz } from "./columns";
import { payments } from "./ledger";

// 0030_payment_tags.sql (D34): the owner's labels on payments. Unlike the
// ledger these are plain owner writes under RLS.

/** The suggestions. Unique on lower(name): that index lives in the migration. */
export const paymentTags = pgTable("payment_tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  created_at: timestamptz("created_at").notNull().default(sql`now()`),
  updated_at: timestamptz("updated_at").notNull().default(sql`now()`),
});

/** A payment's own copy of each tag name. Unique on (payment_id, lower(name)) in the migration. */
export const paymentRecordTags = pgTable(
  "payment_record_tags",
  {
    payment_id: uuid("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "restrict", onUpdate: "restrict" }),
    name: text("name").notNull(),
    created_at: timestamptz("created_at").notNull().default(sql`now()`),
  },
  (t) => [primaryKey({ columns: [t.payment_id, t.name] })]
);
