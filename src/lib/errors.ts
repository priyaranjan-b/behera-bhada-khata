// Shared by the server (services throw it, route handlers turn it into a JSON
// response) and the browser (the API client rethrows non-2xx responses as it),
// so callers on either side handle failures the same way.
export class ApiError extends Error {
  /**
   * `field`: the input the error is about, so a form can show it there - so
   * far only "pin" (a wrong or missing corrections PIN, 0039), which the
   * correction dialog shows under the PIN instead of as a refusal.
   */
  constructor(
    public readonly status: number,
    message: string,
    public readonly field?: "pin"
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function errorMessage(err: unknown, fallback = "Something went wrong"): string {
  return err instanceof Error && err.message ? err.message : fallback;
}
