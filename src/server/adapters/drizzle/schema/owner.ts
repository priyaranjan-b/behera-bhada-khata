import "server-only";
import { sql } from "drizzle-orm";
import { boolean, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { timestamptz } from "./columns";

// 0003_single_owner.sql, 0013_owner_profile.sql, 0024_payment_note_presets.sql.

/** The one account that owns the rent book. Not readable by the owner role. */
export const appOwner = pgTable("app_owner", {
  singleton: boolean("singleton").primaryKey().default(true),
  user_id: uuid("user_id").notNull().unique(),
  created_at: timestamptz("created_at").notNull().default(sql`now()`),
});

export const ownerProfile = pgTable("owner_profile", {
  singleton: boolean("singleton")
    .primaryKey()
    .default(true)
    .references(() => appOwner.singleton, { onDelete: "cascade", onUpdate: "restrict" }),
  first_name: text("first_name").notNull(),
  last_name: text("last_name"),
  signature_name: text("signature_name"),
  signature_path: text("signature_path"),
  created_at: timestamptz("created_at").notNull().default(sql`now()`),
  updated_at: timestamptz("updated_at").notNull().default(sql`now()`),
});

/** Unique on lower(text): that index lives in the migration. */
export const paymentNotePresets = pgTable("payment_note_presets", {
  id: uuid("id").primaryKey().defaultRandom(),
  text: text("text").notNull(),
  created_at: timestamptz("created_at").notNull().default(sql`now()`),
  updated_at: timestamptz("updated_at").notNull().default(sql`now()`),
});
