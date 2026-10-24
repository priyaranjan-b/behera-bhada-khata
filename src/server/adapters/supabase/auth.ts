import "server-only";
import { ownerFullName } from "@/lib/domain/owner";
import { ApiError } from "@/lib/errors";
import type { AuthGateway } from "@/server/ports";
import { createAdminClient, createSessionClient } from "./clients";

/** Owner login via Supabase Auth (email magic link or password); the session lives in cookies. */
export const supabaseAuth: AuthGateway = {
  async getSession() {
    const supabase = await createSessionClient();
    const { data } = await supabase.auth.getClaims();
    if (!data?.claims) return null;
    const { sub, email } = data.claims;
    const { data: isOwner, error } = await supabase.rpc("is_app_owner");
    if (error) throw new Error(`is_app_owner: ${error.message}`);
    return { userId: sub, email: typeof email === "string" ? email : undefined, isOwner: isOwner === true };
  },

  async sendMagicLink(email, redirectTo, { allowSignUp }) {
    const supabase = await createSessionClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo, shouldCreateUser: allowSignUp },
    });
    if (!error) return;
    // With sign-ups off, an unknown email is rejected - answer the same way
    // as for a known one so the form can't be used to discover accounts.
    if (!allowSignUp && ["otp_disabled", "signup_disabled", "user_not_found"].includes(error.code ?? "")) return;
    console.error(`sendMagicLink: [${error.code ?? "?"}] ${error.message}`);
    if (error.status === 429) throw new ApiError(429, "Too many sign-in emails. Try again in a few minutes.");
    throw new ApiError(500, "Could not send the link");
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

  async signInWithPassword(email, password) {
    const supabase = await createSessionClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) return true;
    if (error.code === "invalid_credentials") return false;
    console.error(`signInWithPassword: [${error.code ?? "?"}] ${error.message}`);
    if (error.status === 429) throw new ApiError(429, "Too many sign-in attempts. Try again in a few minutes.");
    throw new ApiError(500, "Could not sign in");
  },

  async updatePassword(password) {
    const supabase = await createSessionClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (!error) return;
    if (error.code === "same_password") throw new ApiError(400, "That's already your password");
    if (error.code === "weak_password") throw new ApiError(400, "That password is too weak. Try a longer one.");
    console.error(`updatePassword: [${error.code ?? "?"}] ${error.message}`);
    throw new ApiError(500, "Could not change the password");
  },

  async ownerNames() {
    const admin = createAdminClient();
    const [{ data: owner }, { data: profile }] = await Promise.all([
      admin.from("app_owner").select("user_id").maybeSingle(),
      admin.from("owner_profile").select("*").maybeSingle(),
    ]);
    if (!owner) return null;
    let name = ownerFullName(profile?.first_name, profile?.last_name);
    if (!name) {
      // No profile yet: the account's own name, else its email.
      const { data, error } = await admin.auth.admin.getUserById(owner.user_id);
      if (error || !data.user) return null;
      const meta = data.user.user_metadata ?? {};
      const metaName = [meta.full_name, meta.name, meta.display_name].find(
        (v): v is string => typeof v === "string" && v.trim() !== ""
      );
      name = metaName?.trim() ?? data.user.email ?? null;
    }
    if (!name) return null;
    return { owner: name, signature: profile?.signature_name ?? name };
  },

  async exchangeCode(code) {
    const supabase = await createSessionClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw new ApiError(400, "That sign-in link didn't work");
  },

  async setSession(accessToken, refreshToken) {
    const supabase = await createSessionClient();
    const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    if (error) throw new ApiError(400, "That sign-in link didn't work");
  },

  async signOut() {
    const supabase = await createSessionClient();
    await supabase.auth.signOut();
  },
};
