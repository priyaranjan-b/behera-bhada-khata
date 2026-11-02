import "server-only";
import { sql } from "drizzle-orm";
import { index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import type { ProofContentType } from "@/lib/types";
import { timestamptz } from "./columns";
import { tenants } from "./tenants";

// 0011_tenant_documents.sql (D21): unlike the ledger, the owner may delete these.

export const tenantDocuments = pgTable(
  "tenant_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict", onUpdate: "restrict" }),
    document_type: text("document_type").notNull(),
    storage_path: text("storage_path").notNull().unique(),
    file_name: text("file_name").notNull(),
    content_type: text("content_type").$type<ProofContentType>().notNull(),
    size_bytes: integer("size_bytes").notNull(),
    created_at: timestamptz("created_at").notNull().default(sql`now()`),
    recorded_by: uuid("recorded_by"),
  },
  (t) => [index("tenant_documents_tenant_id_idx").on(t.tenant_id, t.created_at)]
);
