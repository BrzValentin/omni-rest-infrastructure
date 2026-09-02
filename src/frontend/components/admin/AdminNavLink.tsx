"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { hasUnsavedChanges, unsavedChangesPrompt } from "./useUnsavedChanges";

/**
 * A header link that will not walk away from unsaved edits without asking.
 *
 * `beforeunload` only covers leaving the site; a client-side route change never fires it, so the
 * portal's own navigation was the one way to lose an edit in silence.
 */
export function AdminNavLink({ href, className, children }: Readonly<{
  href: string;
  className?: string;
  children: ReactNode;
}>) {
  return (
    <Link
      href={href}
      className={className}
      onClick={(event) => {
        if (hasUnsavedChanges() && !window.confirm(unsavedChangesPrompt)) event.preventDefault();
      }}
    >
      {children}
    </Link>
  );
}
