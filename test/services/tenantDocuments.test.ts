import { beforeEach, describe, expect, it, vi } from "vitest";
import { OWNER_ID, fakes, resetFakes, tenant } from "../fakes";
import { DOCUMENT_LIMITS } from "@/lib/validation";

vi.mock("@/server/infra", async () => (await import("../fakes")).infraMock());

const { deleteTenantDocument, tenantDocumentUrl, uploadTenantDocuments } = await import(
  "@/server/services/tenantDocuments"
);

const ctx = { ownerId: OWNER_ID };
const tenantId = "7f1c0d3e-2b1a-4c5d-8e9f-0a1b2c3d4e5f";
const jpeg = (name = "Aadhaar front.JPG") => ({ name, bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2]) });
const pdf = { name: "agreement.pdf", bytes: new TextEncoder().encode("%PDF-1.7 ...") };

beforeEach(() => {
  resetFakes();
  fakes.state.tenants.set(tenantId, tenant({ id: tenantId }));
});

describe("uploadTenantDocuments", () => {
  it("stores each file under the tenant's folder with the chosen (or typed) type", async () => {
    const { documents } = await uploadTenantDocuments(
      ctx,
      tenantId,
      { documentTypes: ["ID proof (Aadhaar)", "  Electricity bill "] },
      [jpeg(), pdf]
    );

    expect(documents.map((d) => [d.documentType, d.fileName, d.contentType])).toEqual([
      ["ID proof (Aadhaar)", "Aadhaar front.JPG", "image/jpeg"],
      ["Electricity bill", "agreement.pdf", "application/pdf"],
    ]);
    const paths = [...fakes.state.files.keys()];
    expect(paths).toHaveLength(2);
    for (const path of paths) expect(path).toMatch(new RegExp(`^tenants/${tenantId}/documents/[0-9a-f]{8}-\\d-`));
  });

  it("needs a type for every file and real photos or PDFs, before storing anything", async () => {
    const up = (documentTypes: string[], files: { name: string; bytes: Uint8Array }[]) =>
      uploadTenantDocuments(ctx, tenantId, { documentTypes }, files);
    await expect(up([""], [jpeg()])).rejects.toMatchObject({ status: 400 });
    await expect(up(["ID"], [])).rejects.toMatchObject({ status: 400 });
    await expect(up(["ID"], [jpeg(), pdf])).rejects.toMatchObject({ status: 400 });
    const html = { name: "id.jpg", bytes: new TextEncoder().encode("<html>") };
    await expect(up(["ID"], [html])).rejects.toMatchObject({ status: 400 });
    expect(fakes.state.files.size).toBe(0);
  });

  it("rejects one file over DOCUMENT_LIMITS with the schema's own message", async () => {
    const n = DOCUMENT_LIMITS.maxFiles + 1;
    await expect(
      uploadTenantDocuments(ctx, tenantId, { documentTypes: Array(n).fill("ID") }, Array.from({ length: n }, () => jpeg()))
    ).rejects.toMatchObject({ status: 400, message: expect.stringContaining(`at most ${DOCUMENT_LIMITS.maxFiles}`) });
    expect(fakes.state.files.size).toBe(0);
  });

  it("removes the uploaded files if saving the rows fails", async () => {
    fakes.owner.tenantDocuments.create.mockRejectedValueOnce(new Error("db down"));
    await expect(uploadTenantDocuments(ctx, tenantId, { documentTypes: ["ID", "ID"] }, [jpeg(), pdf])).rejects.toMatchObject({
      status: 500,
    });
    expect(fakes.state.files.size).toBe(0);
  });

  it("404s for an unknown tenant", async () => {
    await expect(
      uploadTenantDocuments(ctx, "00000000-0000-4000-8000-0000000000ff", { documentTypes: ["ID"] }, [jpeg()])
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("viewing and deleting", () => {
  async function oneDocument(): Promise<string> {
    const { documents } = await uploadTenantDocuments(ctx, tenantId, { documentTypes: ["Passport photo"] }, [jpeg("me.jpg")]);
    return documents[0].id;
  }

  it("signs a short-lived URL, only for that tenant's own document", async () => {
    const id = await oneDocument();
    expect(await tenantDocumentUrl(ctx, tenantId, id)).toMatch(/^https:\/\/storage\.test\/tenants\//);
    await expect(tenantDocumentUrl(ctx, "00000000-0000-4000-8000-000000000101", id)).rejects.toMatchObject({ status: 404 });
    await expect(tenantDocumentUrl(ctx, tenantId, "../x")).rejects.toMatchObject({ status: 404 });
  });

  it("deletes the row and the file", async () => {
    const id = await oneDocument();
    await deleteTenantDocument(ctx, tenantId, id);
    expect(fakes.state.documents.size).toBe(0);
    expect(fakes.state.files.size).toBe(0);
    await expect(deleteTenantDocument(ctx, tenantId, id)).rejects.toMatchObject({ status: 404 });
  });
});
