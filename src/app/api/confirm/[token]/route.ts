import { NextResponse } from "next/server";
import { confirmSchema } from "@/lib/validation";
import { loadPendingRecordByToken, confirmRecordAndApplyAllocations } from "@/lib/ledger";
import { checkOtp } from "@/lib/messaging/twilio";
import { dataUrlToBytes, uploadPrivateFile, getSignedUrl } from "@/lib/storage";
import { generateReceiptPdf } from "@/lib/pdf/receipt";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await request.json().catch(() => null);
  const parsed = confirmSchema.safeParse({ token, ...body });
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const context = await loadPendingRecordByToken(token, parsed.data.recordType);
  if (!context) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (context.record.status !== "pending") {
    return NextResponse.json({ error: "Already confirmed" }, { status: 409 });
  }
  if (new Date(context.record.token_expires_at) < new Date()) {
    return NextResponse.json({ error: "Link expired" }, { status: 410 });
  }
  if (!context.record.owner_signature_path) {
    return NextResponse.json({ error: "Owner signature missing on this record" }, { status: 500 });
  }

  const otpOk = await checkOtp(context.tenant.phone, parsed.data.otpCode);
  if (!otpOk) return NextResponse.json({ error: "Incorrect or expired code" }, { status: 400 });

  const admin = createAdminClient();
  const basePath = `${context.recordType}s/${context.tenant.property_id}/${context.tenant.id}/${context.record.id}`;

  const tenantSignatureBytes = dataUrlToBytes(parsed.data.tenantSignaturePng);
  const tenantSignaturePath = `${basePath}/tenant-signature.png`;

  const { data: ownerSigFile, error: ownerSigError } = await admin.storage
    .from("rent-register")
    .download(context.record.owner_signature_path);
  if (ownerSigError || !ownerSigFile) {
    return NextResponse.json({ error: "Owner signature missing on this record" }, { status: 500 });
  }
  const ownerSignatureBytes = new Uint8Array(await ownerSigFile.arrayBuffer());

  try {
    await uploadPrivateFile(tenantSignaturePath, tenantSignatureBytes, "image/png");
  } catch {
    return NextResponse.json({ error: "Already confirmed" }, { status: 409 });
  }

  const otpVerifiedAt = new Date().toISOString();

  const pdfBytes = await generateReceiptPdf({
    title: context.recordType === "payment" ? "Rent Payment Receipt" : "Rent Payment Adjustment",
    recordId: context.record.id,
    ownerName: context.ownerName,
    tenantName: context.tenant.name,
    propertyName: context.property.name,
    totalAmount: context.record.amount,
    date: context.record.date,
    mode: context.record.mode,
    note: context.recordType === "adjustment" ? (context.record.reason ?? null) : context.record.note,
    lineItems: context.lineItems,
    ownerSignaturePng: ownerSignatureBytes,
    tenantSignaturePng: tenantSignatureBytes,
    otpVerifiedAt,
    confirmedAt: otpVerifiedAt,
  });

  const pdfPath = `${basePath}/receipt.pdf`;
  await uploadPrivateFile(pdfPath, pdfBytes, "application/pdf");

  const { updated } = await confirmRecordAndApplyAllocations({
    recordType: context.recordType,
    recordId: context.record.id,
    tenantSignaturePath,
    pdfPath,
    otpVerifiedAt,
  });

  if (!updated) return NextResponse.json({ error: "Already confirmed" }, { status: 409 });

  const receiptUrl = await getSignedUrl(pdfPath, 3600);
  return NextResponse.json({ ok: true, receiptUrl });
}
