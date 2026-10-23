// The browser-visible (NEXT_PUBLIC_*) settings, the only place client code
// reads process.env. Each one must be referenced literally like this so Next
// can inline it into the client bundle.

/** "" for same-origin, or the origin of a standalone API backend. */
export const PUBLIC_API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
