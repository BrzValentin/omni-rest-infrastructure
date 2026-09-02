/**
 * Core Web Vitals sink.
 *
 * The browser posts a small batch of measurements here on page hide. This handler exists to turn them
 * into one structured log line and nothing else — there is no store, no fan-out, and no per-visitor
 * state.
 *
 * The privacy line is the same one `instrumentation.ts` draws, and for the same reason: this endpoint
 * is hit on *every* public page view, so anything recorded here would become a browsing trail. It
 * therefore records the metric name and number and nothing that identifies the page, the tenant, or
 * the visitor. In particular the request URL and `Host` are never read — on this platform the host
 * *is* the restaurant identity.
 *
 * See `specifications/phase-8/error-handling.md` §6.
 */

/** Names this endpoint will record. An unknown name is dropped rather than logged back. */
const ALLOWED = new Set(["LCP", "INP", "CLS", "FCP", "TTFB"]);

/** A beacon carries at most five metrics; anything larger is not ours. */
const MAX_BODY_BYTES = 4_096;
const MAX_METRICS = 5;

type Incoming = { name?: unknown; value?: unknown; id?: unknown };

export async function POST(request: Request): Promise<Response> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return new Response(null, { status: 413, headers: { "cache-control": "no-store" } });
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return new Response(null, { status: 400, headers: { "cache-control": "no-store" } });
  }
  // Content-Length is absent on a chunked beacon, so the real size is checked after reading too.
  if (raw.length > MAX_BODY_BYTES) {
    return new Response(null, { status: 413, headers: { "cache-control": "no-store" } });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return new Response(null, { status: 400, headers: { "cache-control": "no-store" } });
  }

  const metrics = readMetrics(parsed);
  if (metrics.length > 0) {
    console.info("[web-vitals]", JSON.stringify({ at: new Date().toISOString(), metrics }));
  }

  // 204 regardless of whether anything survived validation: the browser cannot act on the difference,
  // and a beacon must never turn into a visible failure.
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}

function readMetrics(parsed: unknown): Array<{ name: string; value: number; id: string }> {
  if (typeof parsed !== "object" || parsed === null) return [];
  const list = (parsed as { metrics?: unknown }).metrics;
  if (!Array.isArray(list)) return [];

  const metrics: Array<{ name: string; value: number; id: string }> = [];
  for (const entry of list.slice(0, MAX_METRICS) as Incoming[]) {
    if (typeof entry !== "object" || entry === null) continue;
    const { name, value, id } = entry;
    if (typeof name !== "string" || !ALLOWED.has(name)) continue;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) continue;
    // The id correlates metrics from one page view. It is generated client-side and never stored, but
    // it is still attacker-controlled text, so its shape is constrained before it reaches a log.
    const safeId = typeof id === "string" && /^[A-Za-z0-9]{1,32}$/.test(id) ? id : "unknown";
    metrics.push({ name, value, id: safeId });
  }
  return metrics;
}
