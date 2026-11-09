import { ApiError } from "@/lib/errors";
import { routes } from "@/lib/routes";

/**
 * For a tenant portal table's load (A32): a 401 means the tenant session
 * ended (a week passed, signed out elsewhere, the number changed), so go to
 * the tenant sign-in rather than leave a "Please sign in" alert with no way
 * on. Anything else is rethrown for the table to show.
 */
export async function orTenantSignIn<T>(load: Promise<T>): Promise<T> {
  try {
    return await load;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) window.location.assign(routes.tenantPortal.login);
    throw err;
  }
}
