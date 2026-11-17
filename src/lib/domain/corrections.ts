import { addMonthsToKey, currentMonthKey } from "@/lib/dates";
import type { CorrectionAction } from "@/lib/types";

/**
 * Corrections confirmed with a PIN (0039, D41, A35). Client-safe: the forms
 * use these to know when to ask for the PIN, the services to know when to
 * check it. The database enforces the same rules (correction_backdate_limit).
 */

/**
 * The earliest date an everyday move-out may have without the PIN: the first
 * of last month (app time zone). An earlier one can drop months that have
 * ended, which only a PIN-confirmed correction may do.
 */
export function moveOutPinFrom(now: Date = new Date()): string {
  return addMonthsToKey(currentMonthKey(now), -1);
}

export function moveOutNeedsPin(moveOutDate: string, now: Date = new Date()): boolean {
  return moveOutDate < moveOutPinFrom(now);
}

/** What each PIN-confirmed action is called on screen and in errors. */
export const CORRECTION_ACTION_LABELS: Record<CorrectionAction, string> = {
  paid_through: 'Correct "rent paid up to"',
  rent: "Correct rent",
  move_out_date: "Correct move-out date",
  adjustment: "Adjust a payment",
  stop_tracking: "Stop tracking rent",
  move_out: "Move out with an earlier date",
};

/**
 * What a failed PIN check tells the owner: the tries left, or - when that
 * one locked corrections - until when (`lockedUntil`, formatted).
 */
export function wrongPinMessage(triesLeft: number | null, lockedUntil: string | null = null): string {
  if (lockedUntil) return `Wrong PIN. Corrections are locked until ${lockedUntil}.`;
  if (!triesLeft) return "Wrong PIN. Corrections are now locked.";
  return `Wrong PIN. ${triesLeft} ${triesLeft === 1 ? "try" : "tries"} left before corrections lock.`;
}
