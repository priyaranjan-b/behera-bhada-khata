import "server-only";
import { randomUUID } from "node:crypto";
import type { TenantDocumentsSaved, TenantDocumentView } from "@/lib/contracts";
import { ApiError } from "@/lib/errors";
import type { TenantDocument } from "@/lib/types";
import { uploadTenantDocumentsSchema } from "@/lib/validation";
import { ownerDb, storage } from "@/server/infra";
import type { OwnerRepositories } from "@/server/ports";
import { notFound, parseInput, type OwnerContext, type UploadedFile } from "./context";
import { checkProofFiles, storageName } from "./proofs";

// Files kept on a tenant (0011_tenant_documents.sql): ID proof, passport
// photo, rent agreement... Stored in the private bucket under
// tenants/<tenant>/documents/; not money facts, so they can be deleted.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toView(row: TenantDocument): TenantDocumentView {
  return {
    id: row.id,
    documentType: row.document_type,
    fileName: row.file_name,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    uploadedAt: row.created_at,
  };
}

export async function listTenantDocuments(db: OwnerRepositories, tenantId: string): Promise<TenantDocumentView[]> {
  return (await db.tenantDocuments.list(tenantId)).map(toView);
}

/** Uploads one or more files, each with its own document type (`documentTypes[i]` for `files[i]`). */
export async function uploadTenantDocuments(
  ctx: OwnerContext,
  tenantId: string,
  body: unknown,
  files: UploadedFile[]
): Promise<TenantDocumentsSaved> {
  if (!UUID.test(tenantId)) notFound("Tenant");
  const { documentTypes } = parseInput(uploadTenantDocumentsSchema, body);
  if (files.length === 0) throw new ApiError(400, "Choose at least one file");
  if (documentTypes.length !== files.length) throw new ApiError(400, "Give each file a document type");
  const checked = checkProofFiles(files, "documents");
  const db = await ownerDb();
  if (!(await db.tenants.get(tenantId))) notFound("Tenant");

  // A fresh batch prefix keeps names unique across uploads.
  const batch = randomUUID().slice(0, 8);
  const uploaded: string[] = [];
  try {
    const rows = [];
    for (const [i, f] of checked.entries()) {
      const path = `tenants/${tenantId}/documents/${batch}-${storageName(i, f.name, f.type)}`;
      await storage.upload(path, f.bytes, f.type);
      uploaded.push(path);
      rows.push({
        tenant_id: tenantId,
        document_type: documentTypes[i],
        storage_path: path,
        file_name: f.name.trim().slice(0, 255) || `document-${i + 1}`,
        content_type: f.type,
        size_bytes: f.bytes.length,
      });
    }
    await db.tenantDocuments.create(rows);
  } catch (err) {
    await storage.remove(uploaded);
    if (err instanceof ApiError) throw err;
    console.error(err);
    throw new ApiError(500, "Could not save the documents");
  }
  return { documents: await listTenantDocuments(db, tenantId) };
}

async function documentOf(db: OwnerRepositories, tenantId: string, documentId: string): Promise<TenantDocument> {
  if (!UUID.test(documentId)) notFound("Document");
  const doc = await db.tenantDocuments.get(documentId);
  if (!doc || doc.tenant_id !== tenantId) notFound("Document");
  return doc;
}

/** Short-lived URL to view or download one document. */
export async function tenantDocumentUrl(ctx: OwnerContext, tenantId: string, documentId: string): Promise<string> {
  const db = await ownerDb();
  const doc = await documentOf(db, tenantId, documentId);
  return storage.signedUrl(doc.storage_path, 300);
}

/** Deletes the row, then (best effort) the file. */
export async function deleteTenantDocument(ctx: OwnerContext, tenantId: string, documentId: string): Promise<void> {
  const db = await ownerDb();
  const doc = await documentOf(db, tenantId, documentId);
  if (!(await db.tenantDocuments.remove(doc.id))) notFound("Document");
  await storage.remove([doc.storage_path]);
}
