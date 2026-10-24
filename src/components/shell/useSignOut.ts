"use client";

import { useState } from "react";
import { useAppRouter } from "@/components/ui/Loading";
import { api } from "@/lib/api-client";

export function useSignOut() {
  const router = useAppRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    await api.auth.signOut().catch(() => undefined);
    router.push("/login");
    router.refresh();
  }

  return { signOut, signingOut };
}
