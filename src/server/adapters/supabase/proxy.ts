import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Runs in `src/proxy.ts` before every request: refreshes an expiring session
 * and reports whether the caller is signed in. Refreshed cookies are written
 * to the request too, so Server Components and route handlers in this same
 * request see the new session rather than refreshing it a second time.
 */
export async function refreshSupabaseSession(
  request: NextRequest
): Promise<{ response: NextResponse; isAuthed: boolean }> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    }
  );

  const { data } = await supabase.auth.getClaims();
  return { response, isAuthed: Boolean(data?.claims) };
}
