"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { mutate } from "@/lib/browser-api";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function logout() {
    if (pending) return;
    setPending(true); setError(null);
    try {
      await mutate("/api/v1/auth/logout", "POST", {});
      router.replace("/admin/login");
      router.refresh();
    } catch {
      setError("Sign out could not be confirmed. Try again.");
      setPending(false);
    }
  }

  return <span><button type="button" disabled={pending} onClick={logout}>{pending ? "Signing out…" : "Sign Out"}</button>{error && <span role="alert">{error}</span>}</span>;
}
