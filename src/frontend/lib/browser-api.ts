import type { ApiProblem } from "./auth-contract";

export class BrowserApiError extends Error {
  constructor(public readonly status: number, public readonly problem: ApiProblem) {
    super(problem.detail ?? problem.title ?? "Request failed.");
  }
}

export async function antiforgeryToken(): Promise<string> {
  const response = await fetch("/api/v1/auth/antiforgery", { cache: "no-store", credentials: "same-origin" });
  if (!response.ok) throw new BrowserApiError(response.status, { code: "network_error" });
  return ((await response.json()) as { token: string }).token;
}

export async function browserGet<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { cache: "no-store", credentials: "same-origin" });
  } catch {
    throw new BrowserApiError(0, { code: "network_error", title: "Network unavailable" });
  }
  if (!response.ok) {
    const problem = await response.json().catch(() => ({ code: "unexpected_error" })) as ApiProblem;
    throw new BrowserApiError(response.status, problem);
  }
  return await response.json() as T;
}

export async function mutate<T>(path: string, method: "POST" | "PUT" | "DELETE", body?: unknown, etag?: string): Promise<T | null> {
  const token = await antiforgeryToken();
  const headers = new Headers({ "X-CSRF-TOKEN": token });
  if (body !== undefined) headers.set("content-type", "application/json");
  if (etag) headers.set("if-match", etag);
  let response: Response;
  try {
    response = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store", credentials: "same-origin" });
  } catch {
    throw new BrowserApiError(0, { code: "network_error", title: "Network unavailable" });
  }
  if (!response.ok) {
    const problem = await response.json().catch(() => ({ code: "unexpected_error" })) as ApiProblem;
    throw new BrowserApiError(response.status, problem);
  }
  return response.status === 204 ? null : await response.json() as T;
}

export async function uploadMedia<T>(file: File, altText: string): Promise<T> {
  const token = await antiforgeryToken();
  const body = new FormData();
  body.set("file", file);
  body.set("altText", altText);
  let response: Response;
  try {
    response = await fetch("/api/v1/admin/media-assets", {
      method: "POST", headers: { "X-CSRF-TOKEN": token }, body, cache: "no-store", credentials: "same-origin",
    });
  } catch {
    throw new BrowserApiError(0, { code: "network_error", title: "Network unavailable" });
  }
  if (!response.ok) {
    const problem = await response.json().catch(() => ({ code: "unexpected_error" })) as ApiProblem;
    throw new BrowserApiError(response.status, problem);
  }
  return await response.json() as T;
}
