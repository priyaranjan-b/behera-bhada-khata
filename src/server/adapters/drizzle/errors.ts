import "server-only";
import { ApiError } from "@/lib/errors";

// The Drizzle twin of must/mustWrite/writeError in ../supabase/clients.ts:
// the same SQLSTATE -> status mapping and messages for the user's mistakes.
// Two differences, both on purpose:
//   * an outage (connection refused or timed out, pool full, statement
//     timeout) is a 500, not "Couldn't save that", so the user isn't told
//     their input was wrong and monitoring sees it;
//   * Drizzle's own error text ("Failed query: <sql> params: <values>") is
//     never kept or logged, because the parameters can hold personal data.

/** SQLSTATEs raised on purpose by the SQL functions (D6): their messages are written for the user. */
const APP_ERROR_STATUS: Record<string, number> = { BBK00: 400, BBK04: 404, BBK09: 409 };

type DbError = { code?: string; message: string };

/**
 * The driver's error under Drizzle's wrapper (DrizzleQueryError): the first
 * error in the cause chain with a code (a SQLSTATE, or a postgres.js code
 * such as CONNECT_TIMEOUT). Its message is Postgres' own text, without the
 * query's parameters.
 */
function dbErrorOf(err: unknown): DbError {
  let current: unknown = err;
  while (current && typeof current === "object") {
    const e = current as { code?: unknown; message?: unknown; cause?: unknown };
    if (typeof e.code === "string") return { code: e.code, message: String(e.message ?? "") };
    current = e.cause;
  }
  // No code anywhere: don't repeat the wrapper's text, which lists the parameters.
  return { message: "query failed" };
}

/** The user's input was the problem: a constraint, a bad value, or a policy (SQLSTATE classes 22, 23, 42501). */
function inputErrorOf(error: DbError): ApiError | null {
  if (error.code === "23505") return new ApiError(409, "That already exists");
  if (error.code === "23503") return new ApiError(400, "Refers to something that doesn't exist");
  if (error.code === "42501") return new ApiError(403, "Not allowed");
  if (error.code?.startsWith("22") || error.code?.startsWith("23")) return new ApiError(400, "Couldn't save that");
  return null;
}

/**
 * The error for a rejected write: an ApiError for the user's mistakes, a
 * plain Error (a generic 500 from src/server/http.ts) for anything else.
 * Database internals never reach the client.
 */
export function writeError(err: unknown, what: string): Error {
  if (err instanceof ApiError) return err;
  const error = dbErrorOf(err);
  const appStatus = error.code ? APP_ERROR_STATUS[error.code] : undefined;
  if (appStatus) return new ApiError(appStatus, error.message);
  const detail = `${what}: [${error.code ?? "?"}] ${error.message}`;
  const inputError = inputErrorOf(error);
  // Logged once: the user's mistake here (the route doesn't log an ApiError),
  // anything else by the route that turns it into a 500 (toErrorResponse).
  if (inputError) console.error(detail);
  return inputError ?? new Error(detail);
}

/** Runs a write; a constraint or policy violation becomes the caller's input problem. */
export async function mustWrite<T>(run: Promise<T>, what: string): Promise<T> {
  try {
    return await run;
  } catch (err) {
    throw writeError(err, what);
  }
}

/** Runs a read; a failure surfaces as a 500 naming what was being read (like `must`). */
export async function must<T>(run: Promise<T>, what: string): Promise<T> {
  try {
    return await run;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    const error = dbErrorOf(err);
    throw new Error(`${what}: [${error.code ?? "?"}] ${error.message}`);
  }
}
