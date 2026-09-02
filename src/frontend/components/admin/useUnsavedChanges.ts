"use client";

import { useEffect } from "react";

/** Shown before the owner leaves a page that still holds edits they have not saved. */
export const unsavedChangesPrompt =
  "You have changes that are not saved yet. Leave this page and lose them?";

/**
 * How many editors on this page currently hold unsaved edits.
 *
 * The header lives in the protected layout and the editors live in the page below it, so they are
 * different React trees with no shared provider between them. A module-level counter is what lets
 * the header's links ask "is anything unsaved?" without the layout having to become a client
 * component that owns every editor's state.
 */
let unsavedEditors = 0;

export function hasUnsavedChanges(): boolean {
  return unsavedEditors > 0;
}

/**
 * Warns before the owner throws away unsaved edits — on a browser-level navigation via
 * `beforeunload`, and on an in-app navigation via {@link hasUnsavedChanges}, which the header links
 * consult. This used to exist only in the restaurant editor, so the dish, category, and gallery
 * editors dropped a half-finished edit silently.
 */
export function useUnsavedChanges(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;
    unsavedEditors += 1;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => {
      unsavedEditors -= 1;
      window.removeEventListener("beforeunload", warn);
    };
  }, [dirty]);
}
