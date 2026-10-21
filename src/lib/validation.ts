import * as z from "zod";

export const phoneE164Schema = z
  .string()
  .regex(/^\+[1-9]\d{7,14}$/, "Phone must be in E.164 format, e.g. +919876543210");

export const createPropertySchema = z.object({
  name: z.string().min(1, "Required"),
  address: z.string().optional(),
});

export const createTenantSchema = z.object({
  propertyId: z.string().uuid(),
  name: z.string().min(1, "Required"),
  businessName: z.string().optional(),
  unitType: z.enum(["residential", "commercial"]),
  tower: z.string().optional(),
  floor: z.string().optional(),
  houseNumber: z.string().optional(),
  phone: phoneE164Schema,
  preferredChannel: z.enum(["whatsapp", "sms", "both"]),
  monthlyRentAmount: z.coerce.number().positive(),
  leaseStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const paymentAllocationInputSchema = z.object({
  rentPeriodId: z.string().uuid(),
  amountAllocated: z.coerce.number().positive(),
});

export const createPaymentSchema = z.object({
  tenantId: z.string().uuid(),
  amount: z.coerce.number().positive(),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mode: z.enum(["cash", "bank_transfer", "upi", "cheque", "other"]),
  note: z.string().optional(),
  allocations: z.array(paymentAllocationInputSchema).min(1, "Select at least one period"),
  ownerSignaturePng: z.string().startsWith("data:image/png;base64,"),
});

export const adjustmentAllocationInputSchema = z.object({
  rentPeriodId: z.string().uuid(),
  amountDelta: z.coerce.number().refine((n) => n !== 0, "Must not be zero"),
});

export const createAdjustmentSchema = z.object({
  originalPaymentId: z.string().uuid(),
  deltaAmount: z.coerce.number().refine((n) => n !== 0, "Must not be zero"),
  reason: z.string().min(3, "Explain what's being corrected"),
  allocations: z.array(adjustmentAllocationInputSchema).min(1, "Select at least one period"),
  ownerSignaturePng: z.string().startsWith("data:image/png;base64,"),
});

export const otpSendSchema = z.object({
  token: z.string().min(1),
  recordType: z.enum(["payment", "adjustment"]),
});

export const confirmSchema = z.object({
  token: z.string().min(1),
  recordType: z.enum(["payment", "adjustment"]),
  otpCode: z.string().min(4).max(10),
  tenantSignaturePng: z.string().startsWith("data:image/png;base64,"),
});
