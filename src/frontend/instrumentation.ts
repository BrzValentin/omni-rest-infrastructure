/**
 * Server-side error reporting for server renders and route handlers.
 *
 * Next.js calls {@link onRequestError} for every uncaught server error. Before this existed the only
 * trace of a failed render was whatever the runtime happened to print, with no digest in it — which
 * meant a user report ("it said it could not load the page") could not be matched to anything. The
 * client boundaries log the same digest, so the two ends of one incident line up.
 *
 * What is deliberately left out matters as much as what is in:
 *
 * - **Cookies.** They carry the owner's session; a log line is not a place to put one.
 * - **The tenant identity.** It is derived from `Host`, so recording it would write which restaurant
 *   was being viewed into every error line — an access trail this platform has no reason to keep.
 *   `routePath` is the matched route *pattern*, not a resolved URL, so it names no tenant.
 * - **The request body.** It is the owner's unsaved content and can be arbitrarily large.
 * - **The error message and stack.** The digest identifies the fault without reproducing it here.
 */

type RequestSummary = Readonly<{ method?: string }>;

type ErrorContext = Readonly<{
  routePath?: string;
  routeType?: string;
  renderSource?: string;
}>;

export function onRequestError(
  error: unknown,
  request: RequestSummary,
  context: ErrorContext,
): void {
  const digest = typeof error === "object" && error !== null && "digest" in error
    ? String((error as { digest?: unknown }).digest ?? "")
    : "";
  console.error("[request-error]", JSON.stringify({
    at: new Date().toISOString(),
    route: context.routePath ?? null,
    routeType: context.routeType ?? null,
    renderSource: context.renderSource ?? null,
    method: request.method ?? null,
    digest: digest === "" ? null : digest,
    type: error instanceof Error ? error.name : typeof error,
  }));
}
