import "server-only";
import type { CorrectionPinView } from "@/lib/contracts";
import { formatDateTime } from "@/lib/dates";
import { wrongPinMessage } from "@/lib/domain/corrections";
import { ApiError } from "@/lib/errors";
import type { CorrectionAction } from "@/lib/types";
import { setCorrectionPinSchema } from "@/lib/validation";
import { ownerDb } from "@/server/infra";
import type { CorrectionResult, OwnerRepositories } from "@/server/ports";
import { parseInput, type OwnerContext } from "./context";

// Corrections confirmed with a PIN (0039, D41, A35). The database holds the
// PIN, counts wrong ones and locks, and checks the PIN in the same
// transaction as the correction; these only translate its answers. PIN
// errors carry field "pin", so the dialog shows them under the PIN.

const lockedMessage = (until: string) => `Too many wrong PINs. Corrections are locked until ${formatDateTime(until)}.`;

/**
 * Before any work (an upload, the write): no PIN set or corrections locked
 * is a 409 on the PIN, so the owner learns it before typing anything.
 */
export async function assertCorrectionsOpen(
  ctx: OwnerContext,
  db: OwnerRepositories,
  action: CorrectionAction,
  targetId: string
): Promise<void> {
  const status = await db.corrections.status();
  if (!status.pinSet) throw new ApiError(409, "No corrections PIN is set yet. Set one on Profile first.", "pin");
  if (status.lockedUntil) {
    console.warn(`correction refused: locked owner=${ctx.ownerId} action=${action} target=${targetId} until=${status.lockedUntil}`);
    throw new ApiError(409, lockedMessage(status.lockedUntil), "pin");
  }
}

/** The correction's value, or a 400 on the PIN for a wrong one (the count is already committed). */
export function correctionValue<T>(
  ctx: OwnerContext,
  result: CorrectionResult<T>,
  action: CorrectionAction,
  targetId: string
): T {
  if (result.ok) return result.value;
  console.warn(
    `correction refused: wrong PIN owner=${ctx.ownerId} action=${action} target=${targetId} triesLeft=${result.triesLeft}${result.lockedUntil ? ` lockedUntil=${result.lockedUntil}` : ""}`
  );
  throw new ApiError(400, wrongPinMessage(result.triesLeft, result.lockedUntil && formatDateTime(result.lockedUntil)), "pin");
}

/**
 * A PIN-confirmed correction: checks corrections are open, runs `write` (a
 * repository method that checks the PIN in its own transaction) and returns
 * its value, or throws the PIN error.
 */
export async function runCorrection<T>(
  ctx: OwnerContext,
  db: OwnerRepositories,
  action: CorrectionAction,
  targetId: string,
  write: () => Promise<CorrectionResult<T>>
): Promise<T> {
  await assertCorrectionsOpen(ctx, db, action, targetId);
  return correctionValue(ctx, await write(), action, targetId);
}

/** Whether a PIN is set, any lockout, and whether setup is open, for Profile and the correction dialogs. */
export async function getCorrectionPin(_ctx: OwnerContext): Promise<CorrectionPinView> {
  const db = await ownerDb();
  return db.corrections.status();
}

/**
 * Sets the first PIN while setup is open (opened from the SQL editor), or
 * changes it with the current one; a wrong current one counts as a wrong PIN.
 */
export async function setCorrectionPin(ctx: OwnerContext, body: unknown): Promise<CorrectionPinView> {
  const { pin, currentPin } = parseInput(setCorrectionPinSchema, body);
  const db = await ownerDb();
  const result = await db.corrections.setPin(pin, currentPin ?? null);
  if (!result.ok) {
    console.warn(`corrections PIN change refused: wrong current PIN owner=${ctx.ownerId} triesLeft=${result.triesLeft}`);
    throw new ApiError(
      400,
      currentPin
        ? wrongPinMessage(result.triesLeft, result.lockedUntil && formatDateTime(result.lockedUntil))
        : "Enter your current PIN to change it",
      "pin"
    );
  }
  return db.corrections.status();
}
