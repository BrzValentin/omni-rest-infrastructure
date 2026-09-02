"use client";

import { useCallback, useState } from "react";
import { BrowserApiError, mutate } from "@/lib/browser-api";
import { menuErrorMessages, menuProblemMessages, type AdminMenu, type AdminMenuMutation } from "@/lib/menu-admin-contract";
import { publishingSentence, sessionExpiredNotice } from "./DraftStatusBar";
import { useUnsavedChanges } from "./useUnsavedChanges";

export type MenuMutationMethod = "POST" | "PATCH" | "DELETE";

type MenuRequest = { path: string; method: MenuMutationMethod; body: unknown; label: string };

const savingFailedNotice = "Saving failed. Your entries are still here; try again.";

/**
 * Owns the menu draft, its ETag, and the shared save/notice/error handling that every
 * menu management surface needs.
 */
export function useMenuDraft(initial: AdminMenu) {
  const [menu, setMenu] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [dirty, setDirty] = useState(false);
  // The last save that failed for a reason the owner cannot fix by editing a field. Keeping it is
  // what turns "try again" from an instruction into a button.
  const [failedRequest, setFailedRequest] = useState<MenuRequest | null>(null);

  useUnsavedChanges(dirty);

  const save = useCallback(async (
    path: string,
    method: MenuMutationMethod,
    body: unknown,
    label: string,
  ): Promise<boolean> => {
    setBusy(label);
    setNotice(null);
    setConflict(false);
    setSessionExpired(false);
    setFieldErrors({});
    setFailedRequest(null);
    try {
      const result = await mutate<AdminMenuMutation>(path, method, body, menu.eTag);
      if (result) {
        setMenu(result.menu);
        setNotice(`${label} saved. ${publishingSentence(result.publication.status)}`);
      }
      setDirty(false);
      return true;
    } catch (error) {
      if (!(error instanceof BrowserApiError)) {
        setNotice(savingFailedNotice);
        setFailedRequest({ path, method, body, label });
        return false;
      }
      // A sign-in that lapsed mid-save is not a failed save the owner can retry into: they have to
      // sign in first, and nothing they typed should be lost while they do.
      if (error.status === 401) {
        setSessionExpired(true);
        setNotice(sessionExpiredNotice);
        return false;
      }
      if (error.status === 400 && error.problem.errors) {
        setFieldErrors(error.problem.errors);
        setNotice("Check the highlighted fields. Your entries are preserved.");
        return false;
      }
      const code = error.problem.code ?? "";
      if (code === "concurrency_conflict") setConflict(true);
      else setFailedRequest({ path, method, body, label });
      setNotice(menuProblemMessages[code] ?? savingFailedNotice);
      return false;
    } finally {
      setBusy(null);
    }
  }, [menu.eTag]);

  const retrySave = useCallback(() => {
    if (!failedRequest) return;
    void save(failedRequest.path, failedRequest.method, failedRequest.body, failedRequest.label);
  }, [failedRequest, save]);

  return {
    menu, setMenu, busy, notice, setNotice, conflict, sessionExpired, fieldErrors, setFieldErrors,
    dirty, setDirty, save,
    retrySave: failedRequest ? retrySave : null,
  };
}

export function messageForCodes(codes: string[] | undefined): string | null {
  if (!codes?.length) return null;
  return menuErrorMessages[codes[0]] ?? "Enter a valid value.";
}
