import { serverApi } from "@/lib/api-client/server";
import LoginForm from "./LoginForm";

const ERRORS: Record<string, string> = {
  owner: "That account isn't the owner of this rent book. Sign in with the owner's email.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const [{ next, error }, { devLogin }] = await Promise.all([searchParams, serverApi.auth.loginOptions()]);
  const initialError = error ? (ERRORS[error] ?? "That sign-in link didn't work. Try again.") : null;
  return <LoginForm next={next ?? "/dashboard"} initialError={initialError} devLogin={devLogin} />;
}
