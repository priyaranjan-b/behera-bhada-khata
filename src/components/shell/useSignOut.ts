"use client";

import { useState } from "react";
import { useAppRouter } from "@/components/ui/Loading";
import { api } from "@/lib/api-client";
import { routes } from "@/lib/routes";

export function useSignOut() {
  const router = useAppRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    await api.auth.signOut().catch(() => undefined);
    router.push(routes.login());
    router.refresh();
  }

  return { signOut, signingOut };
}
