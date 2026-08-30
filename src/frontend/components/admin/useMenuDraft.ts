"use client";

import { useCallback, useState } from "react";
import { BrowserApiError, mutate } from "@/lib/browser-api";
import { menuErrorMessages, menuProblemMessages, type AdminMenu, type AdminMenuMutation } from "@/lib/menu-admin-contract";

export type MenuMutationMethod = "POST" | "PATCH" | "DELETE";

/**
 * Owns the menu draft, its ETag, and the shared save/notice/error handling that every
 * menu management surface needs.
 */
export function useMenuDraft(initial: AdminMenu) {
  const [menu, setMenu] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const save = useCallback(async (
    path: string,
    method: MenuMutationMethod,
    body: unknown,
    label: string,
  ): Promise<boolean> => {
    setBusy(label);
    setNotice(null);
    setConflict(false);
    setFieldErrors({});
    try {
      const result = await mutate<AdminMenuMutation>(path, method, body, menu.eTag);
      if (result) {
        setMenu(result.menu);
        setNotice(`${label} saved. Publishing ${result.publication.status}.`);
      }
      return true;
    } catch (error) {
      if (!(error instanceof BrowserApiError)) {
        setNotice("Saving failed. Your entries are still here; try again.");
        return false;
      }
      if (error.status === 400 && error.problem.errors) {
        setFieldErrors(error.problem.errors);
        setNotice("Check the highlighted fields. Your entries are preserved.");
        return false;
      }
      const code = error.problem.code ?? "";
      if (code === "concurrency_conflict") setConflict(true);
      setNotice(menuProblemMessages[code] ?? "Saving failed. Your entries are still here; try again.");
      return false;
    } finally {
      setBusy(null);
    }
  }, [menu.eTag]);

  return { menu, setMenu, busy, notice, setNotice, conflict, fieldErrors, setFieldErrors, save };
}

export function messageForCodes(codes: string[] | undefined): string | null {
  if (!codes?.length) return null;
  return menuErrorMessages[codes[0]] ?? "Enter a valid value.";
}
