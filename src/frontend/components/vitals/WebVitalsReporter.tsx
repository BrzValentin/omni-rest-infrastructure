"use client";

import { useEffect } from "react";

/**
 * Core Web Vitals collection.
 *
 * This uses the platform's own `PerformanceObserver` rather than the `web-vitals` package. The package
 * is the usual answer and it is a good one, but it is ~2 KB of the thing this phase exists to shrink,
 * and the four metrics that carry a budget in `specifications/phase-8/performance-budget.md` are all
 * available directly. If a metric this file cannot express honestly is ever needed, take the
 * dependency then rather than approximating it here.
 *
 * Two things are deliberate:
 *
 * - **Nothing here can delay paint.** Observers are registered in an effect, after hydration, and the
 *   send happens on `visibilitychange`. There is no work on the critical path.
 * - **Every observer is individually guarded.** Entry types are unevenly supported (Safari has no
 *   `layout-shift` or `event`), and an unsupported type throws on `observe`. One missing metric must
 *   never cost the others, so each registration stands alone.
 *
 * What is sent is in {@link Vital}: a name, a number, and the metric's own id. No URL, no query string,
 * no referrer, no tenant identity. See `specifications/phase-8/error-handling.md` §6.
 */

type Vital = Readonly<{ name: string; value: number; id: string }>;

/** Largest observed value wins for LCP; CLS accumulates; the rest are first-value. */
const collected = new Map<string, Vital>();

function record(name: string, value: number, id: string): void {
  if (!Number.isFinite(value) || value < 0) return;
  collected.set(name, { name, value: Math.round(value * 1000) / 1000, id });
}

type LayoutShiftEntry = PerformanceEntry & { value: number; hadRecentInput: boolean };
type EventTimingEntry = PerformanceEntry & { duration: number; interactionId?: number };

/** Registers one observer, swallowing the throw an unsupported entry type produces. */
function observe(type: string, handler: (entries: PerformanceEntryList) => void): (() => void) | null {
  try {
    const observer = new PerformanceObserver((list) => handler(list.getEntries()));
    // `buffered` replays entries that fired before hydration — without it LCP and FCP are usually missed.
    observer.observe({ type, buffered: true } as PerformanceObserverInit);
    return () => observer.disconnect();
  } catch {
    return null;
  }
}

export function WebVitalsReporter() {
  useEffect(() => {
    if (typeof PerformanceObserver !== "function") return;

    const id = `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const stops: Array<() => void> = [];
    let clsTotal = 0;
    let inpWorst = 0;

    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (navigation) record("TTFB", navigation.responseStart, id);

    const add = (stop: (() => void) | null) => { if (stop) stops.push(stop); };

    add(observe("paint", (entries) => {
      for (const entry of entries) {
        if (entry.name === "first-contentful-paint") record("FCP", entry.startTime, id);
      }
    }));

    add(observe("largest-contentful-paint", (entries) => {
      const last = entries.at(-1);
      if (last) record("LCP", last.startTime, id);
    }));

    add(observe("layout-shift", (entries) => {
      for (const entry of entries as LayoutShiftEntry[]) {
        // Shifts within 500ms of an interaction are the user's doing, not the page's.
        if (!entry.hadRecentInput) clsTotal += entry.value;
      }
      record("CLS", clsTotal, id);
    }));

    add(observe("event", (entries) => {
      for (const entry of entries as EventTimingEntry[]) {
        if (entry.interactionId && entry.duration > inpWorst) inpWorst = entry.duration;
      }
      if (inpWorst > 0) record("INP", inpWorst, id);
    }));

    let sent = false;
    const send = () => {
      if (sent || collected.size === 0) return;
      sent = true;
      const body = JSON.stringify({ metrics: [...collected.values()] });
      // `sendBeacon` survives the page going away; fetch with keepalive is the fallback.
      if (typeof navigator.sendBeacon === "function") {
        navigator.sendBeacon("/api/vitals", new Blob([body], { type: "application/json" }));
        return;
      }
      void fetch("/api/vitals", {
        method: "POST",
        body,
        headers: { "content-type": "application/json" },
        keepalive: true,
        cache: "no-store",
      }).catch(() => {
        // Losing a measurement must never surface to the visitor.
      });
    };

    const onHidden = () => { if (document.visibilityState === "hidden") send(); };
    document.addEventListener("visibilitychange", onHidden);
    // `pagehide` covers the bfcache path, where `visibilitychange` is not guaranteed to fire.
    window.addEventListener("pagehide", send);

    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", send);
      for (const stop of stops) stop();
    };
  }, []);

  return null;
}
