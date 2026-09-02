import type { ApiProblem } from "./auth-contract";

/**
 * The one vocabulary every surface uses to talk about a failed API call.
 *
 * Before this existed each caller re-derived its own meaning from a raw status number, so "the
 * network is down", "this restaurant has nothing here yet" and "the backend is broken" all collapsed
 * into the same dead end. A `kind` is what lets a component choose between *retry*, *sign in again*
 * and *there is genuinely nothing here* without repeating the status arithmetic.
 */
export type ApiFailureKind =
  | "network"
  | "timeout"
  | "notFound"
  | "validation"
  | "denied"
  | "server"
  | "unexpected";

export type ApiFailure = Readonly<{
  kind: ApiFailureKind;
  /** The upstream HTTP status, or `0` when no response was ever received. */
  status: number;
  problem: ApiProblem;
}>;

/** Errno values that mean the request never reached a server. */
const NETWORK_ERRNOS = new Set([
  "ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "EAI_AGAIN", "EPIPE", "ENETUNREACH", "EHOSTUNREACH",
]);

/** Errno and undici values that mean a server was reached but ran out of time. */
const TIMEOUT_ERRNOS = new Set([
  "ETIMEDOUT", "ESOCKETTIMEDOUT", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT",
]);

/**
 * Problem codes this platform mints itself, where the code is more precise than the status. A `502`
 * alone cannot say whether the upstream refused the connection or simply never answered.
 */
const CODE_KINDS: Readonly<Record<string, ApiFailureKind>> = {
  network_error: "network",
  request_timeout: "timeout",
  upstream_timeout: "timeout",
  upstream_unavailable: "server",
  restaurant_not_found: "notFound",
};

/**
 * The kind implied by an HTTP status on its own.
 *
 * `0` is this codebase's long-standing sentinel for "no response at all" and keeps that meaning here.
 * `409` counts as validation because every conflict this app produces is a stale-ETag write that the
 * owner resolves by reloading and re-entering — the same shape as a rejected field.
 */
export function kindForStatus(status: number): ApiFailureKind {
  if (status === 0) return "network";
  if (status === 404) return "notFound";
  if (status === 408 || status === 504) return "timeout";
  if (status === 401 || status === 403) return "denied";
  if (status === 400 || status === 409 || status === 422) return "validation";
  if (status >= 500) return "server";
  return "unexpected";
}

function isResponse(value: unknown): value is Response {
  if (typeof Response === "function" && value instanceof Response) return true;
  return typeof value === "object"
    && value !== null
    && typeof (value as Response).status === "number"
    && typeof (value as Response).ok === "boolean";
}

function isErrorLike(value: unknown): value is Error {
  return value instanceof Error
    || (typeof value === "object" && value !== null
      && typeof (value as Error).name === "string" && typeof (value as Error).message === "string");
}

function isProblemLike(value: unknown): value is ApiProblem {
  if (typeof value !== "object" || value === null) return false;
  const problem = value as ApiProblem;
  return problem.status !== undefined || problem.code !== undefined
    || problem.title !== undefined || problem.detail !== undefined || problem.errors !== undefined;
}

function failure(status: number, problem: ApiProblem, kind?: ApiFailureKind): ApiFailure {
  const fromCode = problem.code === undefined ? undefined : CODE_KINDS[problem.code];
  return { kind: kind ?? fromCode ?? kindForStatus(status), status, problem };
}

function errnoOf(error: Error): string | undefined {
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

/**
 * Normalises anything a failed call can produce — a non-OK `Response`, a parsed {@link ApiProblem},
 * or a thrown error — into one {@link ApiFailure}.
 *
 * `problem` is the already-parsed body when the caller has one; a `Response` cannot be read twice, so
 * `classify` never touches the stream itself.
 */
export function classify(source: unknown, problem?: ApiProblem): ApiFailure {
  if (isResponse(source)) return failure(source.status, { status: source.status, ...problem });

  if (isErrorLike(source)) {
    // `AbortSignal.timeout()` rejects with a `TimeoutError`; the only aborts this app issues are its
    // own deadlines, so a bare `AbortError` means the same thing to a reader of the UI.
    if (source.name === "TimeoutError" || source.name === "AbortError") {
      return failure(0, { code: "request_timeout", ...problem }, "timeout");
    }
    const errno = errnoOf(source);
    if (errno !== undefined && TIMEOUT_ERRNOS.has(errno)) return failure(0, { code: "request_timeout", ...problem }, "timeout");
    if (errno !== undefined && NETWORK_ERRNOS.has(errno)) return failure(0, { code: "network_error", ...problem }, "network");
    // `fetch` reports every transport fault as a bare `TypeError`.
    if (source instanceof TypeError) return failure(0, { code: "network_error", ...problem }, "network");
    return failure(0, { code: "unexpected_error", ...problem }, "unexpected");
  }

  if (isProblemLike(source)) {
    const merged = { ...source, ...problem };
    return failure(merged.status ?? 0, merged);
  }

  return failure(0, { code: "unexpected_error", ...problem }, "unexpected");
}

/**
 * The `application/problem+json` body a proxy returns when the upstream API could not answer.
 *
 * Both proxies used to `reject` the handler promise instead, which surfaced to the caller as an
 * opaque framework `500` with an HTML body — unparseable by a client that expects a problem document,
 * and indistinguishable from a fault in the proxy itself.
 */
export function upstreamProblemResponse(kind: "unavailable" | "timeout"): Response {
  const body = kind === "timeout"
    ? { status: 504, code: "upstream_timeout", title: "The service did not respond in time." }
    : { status: 502, code: "upstream_unavailable", title: "The service is unavailable." };
  return new Response(JSON.stringify(body), {
    status: body.status,
    headers: { "content-type": "application/problem+json", "cache-control": "no-store" },
  });
}
