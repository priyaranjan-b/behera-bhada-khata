// The browser's only way to reach data: Client Components import `api` from
// here and never talk to a database SDK. Server Components use
// `serverApi` from "@/lib/api-client/server" instead.
import { createHttpApi } from "./http";

export const api = createHttpApi({ baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "" });

export { apiHref, apiPaths } from "./paths";
export { ApiError, errorMessage } from "@/lib/errors";
export type { Api, ApiCommands, ApiQueries } from "./types";
