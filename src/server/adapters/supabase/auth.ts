import "server-only";
import { ApiError } from "@/lib/errors";
import type { AuthGateway } from "@/server/ports";
import { createAdminClient, createSessionClient } from "./clients";

/** Owner login via Supabase Auth email magic links; the session lives in cookies. */
export const supabaseAuth: AuthGateway = {
  async getSession() {
    const supabase = await createSessionClient();
    const { data } = await supabase.auth.getClaims();
    if (!data?.claims) return null;
    const { sub, email } = data.claims;
    return { userId: sub, email: typeof email === "string" ? email : undefined };
  },

  async sendMagicLink(email, redirectTo) {
    const supabase = await createSessionClient();
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
    if (error) throw new ApiError(500, "Could not send the link");
  },

  async generateMagicLink(email, redirectTo) {
    const { data, error } = await createAdminClient().auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo },
    });
    if (error) throw new ApiError(500, "Could not create a sign-in link");
    return data.properties.action_link;
  },

  async exchangeCode(code) {
    const supabase = await createSessionClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw new ApiError(400, error.message);
  },

  async setSession(accessToken, refreshToken) {
    const supabase = await createSessionClient();
    const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    if (error) throw new ApiError(400, error.message);
  },

  async signOut() {
    const supabase = await createSessionClient();
    await supabase.auth.signOut();
  },
};
