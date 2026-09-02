import { classify, type ApiFailureKind } from "./api-error";
import type { ApiProblem } from "./auth-contract";

/**
 * Every browser call is bounded. Without a deadline a stalled connection left the calling component
 * disabled and spinning forever — there was no timeout anywhere in this module.
 */
const REQUEST_TIMEOUT_MS = 15_000;

/** Uploads carry a file, so they get a longer deadline than a JSON round trip. */
const UPLOAD_TIMEOUT_MS = 60_000;

export class BrowserApiError extends Error {
  /**
   * The normalised reason this call failed.
   *
   * Added alongside — never in place of — `status` and `problem`, both of which keep exactly the
   * values they carried before: `status === 0` still means "no response at all", and a transport
   * fault still reports `code: "network_error"`. Existing call sites branch on those and must keep
   * working unchanged; `kind` is the field new code should read.
   */
  readonly kind: ApiFailureKind;

  constructor(
    public readonly status: number,
    public readonly problem: ApiProblem,
    kind?: ApiFailureKind,
  ) {
    super(problem.detail ?? problem.title ?? "Request failed.");
    this.name = "BrowserApiError";
    this.kind = kind ?? classify({ ...problem, status }).kind;
  }
}

/**
 * The single fetch path for the whole module.
 *
 * The transport `catch` and the non-OK problem parse used to be copied verbatim into four functions,
 * so every fix had to be made four times and the timeout that was missing was missing four times.
 */
async function send(path: string, init: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      cache: "no-store",
      credentials: "same-origin",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    // A deadline and an unreachable server are both "nothing came back", so both keep the `status: 0`
    // sentinel and the `network_error` code the existing call sites already understand. Only `kind`
    // tells them apart.
    const failure = classify(error);
    throw new BrowserApiError(
      0,
      { code: "network_error", title: "Network unavailable" },
      failure.kind === "timeout" ? "timeout" : "network",
    );
  }
  if (!response.ok) {
    const problem = await response.json().catch(() => ({ code: "unexpected_error" })) as ApiProblem;
    throw new BrowserApiError(response.status, problem);
  }
  return response;
}

export async function antiforgeryToken(): Promise<string> {
  const response = await send("/api/v1/auth/antiforgery", {});
  return ((await response.json()) as { token: string }).token;
}

export async function browserGet<T>(path: string): Promise<T> {
  return await (await send(path, {})).json() as T;
}

export async function mutate<T>(path: string, method: "POST" | "PUT" | "PATCH" | "DELETE", body?: unknown, etag?: string): Promise<T | null> {
  const token = await antiforgeryToken();
  const headers = new Headers({ "X-CSRF-TOKEN": token });
  if (body !== undefined) headers.set("content-type", "application/json");
  if (etag) headers.set("if-match", etag);
  const response = await send(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return response.status === 204 ? null : await response.json() as T;
}

/**
 * Uploads one gallery photo. Unlike {@link uploadMedia} this is an aggregate mutation, so it
 * carries the current draft ETag as `If-Match`. The content type is left to the browser so the
 * multipart boundary stays intact.
 */
export async function uploadGalleryPhoto<T>(
  file: File,
  altText: string,
  caption: string | null,
  etag?: string,
): Promise<T> {
  const token = await antiforgeryToken();
  const headers = new Headers({ "X-CSRF-TOKEN": token });
  if (etag) headers.set("if-match", etag);
  const body = new FormData();
  body.set("file", file);
  body.set("altText", altText);
  if (caption !== null && caption !== "") body.set("caption", caption);
  const response = await send("/api/v1/admin/gallery", { method: "POST", headers, body }, UPLOAD_TIMEOUT_MS);
  return await response.json() as T;
}

export async function uploadMedia<T>(file: File, altText: string): Promise<T> {
  const token = await antiforgeryToken();
  const body = new FormData();
  body.set("file", file);
  body.set("altText", altText);
  const response = await send(
    "/api/v1/admin/media-assets",
    { method: "POST", headers: { "X-CSRF-TOKEN": token }, body },
    UPLOAD_TIMEOUT_MS,
  );
  return await response.json() as T;
}
