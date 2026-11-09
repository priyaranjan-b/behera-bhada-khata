// The tenant portal's reads (A32): only the signed-in tenant's own account,
// and an id of anyone else's record, proof or document is "not found".
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakes, payment, resetFakes, tenant } from "../fakes";

vi.mock("@/server/infra", async () => (await import("../fakes")).infraMock());
vi.mock("@/server/pdf/receipt", () => ({ generateReceiptPdf: vi.fn(async () => new Uint8Array([37, 80, 68, 70])) }));

const { getMyAccount, getMyDocuments, getMyLedger, getMyProfile, myDocumentUrl, myProofUrl, myReceipt } = await import(
  "@/server/services/tenantPortal"
);

const ASHA = "00000000-0000-4000-8000-000000000101";
const BIMAL = "00000000-0000-4000-8000-000000000102";
const ASHA_PAYMENT = "00000000-0000-4000-8000-000000000201";
const BIMAL_PAYMENT = "00000000-0000-4000-8000-000000000202";
const ctx = { sessionId: "00000000-0000-4000-8000-000000000900", tenantId: ASHA };

function proof(id: string, paymentId: string) {
  return {
    id,
    payment_id: paymentId,
    storage_path: `payments/x/${paymentId}/proofs/${id}.png`,
    file_name: "upi.png",
    content_type: "image/png" as const,
    size_bytes: 10,
    created_at: "2026-03-05T00:00:00Z",
  };
}

function document(id: string, tenantId: string) {
  return {
    id,
    tenant_id: tenantId,
    document_type: "Agreement",
    storage_path: `tenants/${tenantId}/documents/${id}.pdf`,
    file_name: "agreement.pdf",
    content_type: "application/pdf" as const,
    size_bytes: 10,
    created_at: "2026-01-01T00:00:00Z",
    recorded_by: null,
  };
}

beforeEach(() => {
  resetFakes();
  fakes.state.tenants.set(BIMAL, tenant({ id: BIMAL, name: "Bimal", phone: "+919876543211" }));
  fakes.state.payments.set(BIMAL_PAYMENT, payment({ id: BIMAL_PAYMENT, tenant_id: BIMAL, receipt_no: "2026/03/002" }));
});

describe("reads", () => {
  it("shows the tenant their own profile, account, ledger and documents", async () => {
    fakes.state.documents.set("00000000-0000-4000-8000-000000000701", document("00000000-0000-4000-8000-000000000701", ASHA));
    fakes.state.documents.set("00000000-0000-4000-8000-000000000702", document("00000000-0000-4000-8000-000000000702", BIMAL));
    expect((await getMyProfile(ctx)).tenant.id).toBe(ASHA);
    expect((await getMyAccount(ctx)).balance).toBeDefined();
    expect((await getMyDocuments(ctx)).map((d) => d.id)).toEqual(["00000000-0000-4000-8000-000000000701"]);
    // The ledger is read for the session's tenant, whatever the query says.
    await getMyLedger(ctx, { tenantId: BIMAL });
    expect(fakes.owner.ledger.page).toHaveBeenCalledWith(expect.objectContaining({ tenantId: ASHA }));
  });

  it("never offers to send a link, says 'not signed', or shows the owner's tags", async () => {
    fakes.owner.ledger.page.mockResolvedValueOnce({
      rows: [
        {
          id: `payment-${ASHA_PAYMENT}`,
          type: "payment",
          date: "2026-03-05",
          description: "Payment received (upi)",
          caption: "#2026/03/001 · not signed by tenant",
          debit: 0,
          credit: 5000,
          balance: 0,
          status: "confirmed",
          ref_id: ASHA_PAYMENT,
          receipt_no: "2026/03/001",
          acknowledged: false,
          tags: ["Padma"],
        },
      ],
      total: 1,
      all: 1,
      page: 0,
      sums: { debit: 0, credit: 5000, not_counted: 0 },
    } as never);
    const view = await getMyLedger(ctx, {});
    expect(view.tenantMessaging).toBe(false);
    expect(view.rows[0]).toMatchObject({ caption: "Receipt 2026/03/001", tags: undefined });
  });

  it("shows a moved-out tenant no documents, and opens none", async () => {
    fakes.state.tenants.set(ASHA, tenant({ status: "inactive", moved_out_on: "2026-05-31" }));
    fakes.state.documents.set("00000000-0000-4000-8000-000000000701", document("00000000-0000-4000-8000-000000000701", ASHA));
    expect(await getMyDocuments(ctx)).toEqual([]);
    await expect(myDocumentUrl(ctx, "00000000-0000-4000-8000-000000000701")).rejects.toMatchObject({ status: 404 });
  });
});

describe("downloads", () => {
  it("serves the tenant's own receipt and logs it as theirs", async () => {
    const file = await myReceipt(ctx, "payment", ASHA_PAYMENT);
    expect(file.fileName).toMatch(/^receipt-/);
    expect(fakes.state.audit.at(-1)).toMatchObject({
      action: "receipt.downloaded",
      actor_kind: "tenant",
      tenant_id: ASHA,
      entity_id: ASHA_PAYMENT,
    });
  });

  it("serves the copy they signed once acknowledged", async () => {
    fakes.state.payments.set(
      ASHA_PAYMENT,
      payment({ acknowledged_at: "2026-03-06T00:00:00Z", pdf_path: "payments/x/receipt-signed.pdf" })
    );
    await myReceipt(ctx, "payment", ASHA_PAYMENT);
    expect(fakes.storage.download).toHaveBeenCalledWith("payments/x/receipt-signed.pdf");
  });

  it("answers another tenant's receipt, a malformed id or a missing one as not found", async () => {
    await expect(myReceipt(ctx, "payment", BIMAL_PAYMENT)).rejects.toMatchObject({ status: 404 });
    await expect(myReceipt(ctx, "payment", "not-a-uuid")).rejects.toMatchObject({ status: 404 });
    await expect(myReceipt(ctx, "adjustment", "00000000-0000-4000-8000-000000000299")).rejects.toMatchObject({ status: 404 });
    expect(fakes.system.payments.get).not.toHaveBeenCalledWith(BIMAL_PAYMENT);
  });

  it("opens only their own proofs and documents", async () => {
    fakes.state.proofs.set("00000000-0000-4000-8000-000000000801", proof("00000000-0000-4000-8000-000000000801", ASHA_PAYMENT));
    fakes.state.proofs.set("00000000-0000-4000-8000-000000000802", proof("00000000-0000-4000-8000-000000000802", BIMAL_PAYMENT));
    fakes.state.documents.set("00000000-0000-4000-8000-000000000702", document("00000000-0000-4000-8000-000000000702", BIMAL));

    expect(await myProofUrl(ctx, ASHA_PAYMENT, "00000000-0000-4000-8000-000000000801")).toContain("https://storage.test/");
    await expect(myProofUrl(ctx, BIMAL_PAYMENT, "00000000-0000-4000-8000-000000000802")).rejects.toMatchObject({ status: 404 });
    // Their own payment id with someone else's proof id.
    await expect(myProofUrl(ctx, ASHA_PAYMENT, "00000000-0000-4000-8000-000000000802")).rejects.toMatchObject({ status: 404 });
    await expect(myDocumentUrl(ctx, "00000000-0000-4000-8000-000000000702")).rejects.toMatchObject({ status: 404 });
  });

  it("is rate limited per session", async () => {
    fakes.state.rateLimitAllows = false;
    await expect(myReceipt(ctx, "payment", ASHA_PAYMENT)).rejects.toMatchObject({ status: 429 });
    expect(fakes.system.rateLimits.hit).toHaveBeenCalledWith(`tenant-download:${ctx.sessionId}`, 30, 3600);
    expect(fakes.storage.download).not.toHaveBeenCalled();
  });
});
