"use client";

import { message } from "@/lib/menu-messages";

/**
 * Last-resort boundary, for a throw in the root layout itself.
 *
 * `app/layout.tsx` awaits `readTenantDocument()` to pick the document language, so an upstream fault
 * there fails *before* any `<html>` exists. `app/error.tsx` renders inside the layout and therefore
 * cannot catch it; only this file can. It replaces the whole document, which is why it supplies its
 * own `<html>` and `<body>`.
 *
 * Two constraints follow from where it sits:
 *
 * - Every style is inline. `globals.css` is imported by the layout that just failed, so no class in
 *   it can be relied on here — a card class would have rendered as unstyled text.
 * - No tenant is named, and no brand mark is shown. The thing that failed is precisely the read that
 *   establishes which restaurant this host serves, so any name here would be a guess, and on a
 *   multi-tenant host a guess is one restaurant's brand shown on another's page.
 */
export default function GlobalError({ reset }: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  return (
    <html lang="en-CA">
      <body style={{ margin: 0, background: "#fdfcf9", color: "#1b1b18", font: "1rem/1.6 system-ui, sans-serif" }}>
        <main
          id="main-content"
          style={{ display: "grid", minHeight: "100vh", placeItems: "center", padding: "1.5rem" }}
        >
          <section
            aria-labelledby="global-error-title"
            style={{
              maxWidth: "36rem",
              padding: "2rem",
              border: "1px solid #d9d5cb",
              borderRadius: "1rem",
              background: "#fff",
            }}
          >
            <h1 id="global-error-title" style={{ marginTop: 0, fontSize: "1.6rem" }}>
              {message("pageErrorTitle")}
            </h1>
            <p>{message("errorBody")}</p>
            <button
              type="button"
              onClick={reset}
              style={{
                minWidth: "7rem",
                minHeight: "2.75rem",
                padding: "0.65rem 1rem",
                border: 0,
                borderRadius: "999px",
                background: "#1b1b18",
                color: "#fff",
                font: "inherit",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              {message("retry")}
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
