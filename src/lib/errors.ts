// Shared by the server (services throw it, route handlers turn it into a JSON
// response) and the browser (the API client rethrows non-2xx responses as it),
// so callers on either side handle failures the same way.
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function errorMessage(err: unknown, fallback = "Something went wrong"): string {
  return err instanceof Error && err.message ? err.message : fallback;
}
