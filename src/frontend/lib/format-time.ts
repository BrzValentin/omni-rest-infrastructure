/**
 * Owner- and visitor-facing time formatting (BUG-005).
 *
 * The API stores and returns opening times as 24-hour `HH:mm:ss`, and the editor's native
 * `<input type="time">` works in `HH:mm`. Neither is how a Canadian restaurant owner or guest reads a
 * clock, so every place that *displays* a time goes through here and shows `h:mm AM` / `h:mm PM`.
 * Input values are never formatted: the HTML spec requires `HH:mm` there.
 *
 * The conversion is done by hand rather than with `Intl.DateTimeFormat` or `toLocaleTimeString`.
 * Newer ICU releases put U+202F (narrow no-break space) before the day period, older ones a plain
 * space, so the server render and the browser render of the same page could disagree — a hydration
 * mismatch, and a text match in a test that passes on one machine and fails on the next.
 *
 * Deliberately free of `server-only`: server components (public designs) and client components
 * (the admin editor) both render times.
 */

const TIME = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/;

/**
 * Formats a 24-hour `HH:mm` or `HH:mm:ss` time as `h:mm AM` / `h:mm PM`.
 *
 * Malformed input is returned unchanged rather than thrown. Times reach this function from the
 * published snapshot, which public server components render; a throw there would turn one bad value
 * into a failed page for every visitor, while echoing the raw value keeps the page up and still
 * shows the owner something recognisable to correct. The backend validates times on write, so this
 * path is a safety net, not a code path callers are expected to hit.
 */
export function formatTime(value: string): string {
  const match = TIME.exec(value);
  if (!match) return value;
  const hours = Number(match[1]);
  const minutes = match[2];
  if (hours > 23 || Number(minutes) > 59 || (match[3] !== undefined && Number(match[3]) > 59)) return value;
  const period = hours < 12 ? "AM" : "PM";
  const clockHour = hours % 12 === 0 ? 12 : hours % 12;
  return `${clockHour}:${minutes} ${period}`;
}

/**
 * Formats one opening period as `9:00 AM–5:00 PM`, adding ` next day` when it closes after midnight.
 *
 * The suffix wording matches the public designs (`formatIntervals` in
 * `components/designs/shared/PublicDesignParts.tsx`), so the admin preview and the public site read
 * the same way.
 */
export function formatInterval(interval: Readonly<{ opensAt: string; closesAt: string; closesNextDay?: boolean }>): string {
  return `${formatTime(interval.opensAt)}–${formatTime(interval.closesAt)}${interval.closesNextDay ? " next day" : ""}`;
}
