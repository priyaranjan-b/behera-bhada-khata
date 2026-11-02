import "server-only";
import { sql } from "drizzle-orm";
import { boolean, index, pgTable, text } from "drizzle-orm/pg-core";
import { UNIT_TYPES } from "@/lib/types";
import { timestamptz } from "./columns";

// 0006_property_master_data.sql: site -> tower -> house, keyed by permanent codes (D2).

export const locations = pgTable("locations", {
  location_code: text("location_code").primaryKey(),
  name: text("name").notNull(),
  address: text("address"),
  created_at: timestamptz("created_at").notNull().default(sql`now()`),
  updated_at: timestamptz("updated_at").notNull().default(sql`now()`),
});

export const properties = pgTable(
  "properties",
  {
    property_code: text("property_code").primaryKey(),
    location_code: text("location_code")
      .notNull()
      .references(() => locations.location_code, { onDelete: "restrict", onUpdate: "restrict" }),
    /** Generated from the code (split_part), so never null though the catalog says nullable. */
    tower_code: text("tower_code").notNull(),
    name: text("name").notNull(),
    created_at: timestamptz("created_at").notNull().default(sql`now()`),
    updated_at: timestamptz("updated_at").notNull().default(sql`now()`),
  },
  (t) => [index("properties_location_idx").on(t.location_code)]
);

export const units = pgTable(
  "units",
  {
    unit_code: text("unit_code").primaryKey(),
    property_code: text("property_code")
      .notNull()
      .references(() => properties.property_code, { onDelete: "restrict", onUpdate: "restrict" }),
    /** Generated from the code (split_part), so never null though the catalog says nullable. */
    house_number: text("house_number").notNull(),
    floor: text("floor"),
    unit_type: text("unit_type", { enum: UNIT_TYPES }).notNull(),
    label: text("label"),
    is_active: boolean("is_active").notNull().default(true),
    created_at: timestamptz("created_at").notNull().default(sql`now()`),
    updated_at: timestamptz("updated_at").notNull().default(sql`now()`),
  },
  (t) => [index("units_property_idx").on(t.property_code)]
);
