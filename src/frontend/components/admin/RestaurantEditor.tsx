"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import { BrowserApiError, browserGet, mutate, uploadMedia } from "@/lib/browser-api";
import { isE164 } from "@/lib/phone";
import type { AdminMediaAsset, AdminMutation, AdminRestaurant, MainImage, PublicationStatus, RegularHoursDay, SocialLink, SpecialHours } from "@/lib/restaurant-contract";
import { canadianTimeZones, priceRanges, restaurantTypes } from "@/lib/restaurant-contract";
import { ConfirmDialog } from "./ConfirmDialog";
import { DraftStatusBar, publishingLabel, publishingSentence, sessionExpiredNotice } from "./DraftStatusBar";
import { fieldErrorHelpers } from "./FieldError";
import { useUnsavedChanges } from "./useUnsavedChanges";
import styles from "@/app/admin/admin.module.css";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const EMPTY_ADDRESS = { line1: "", line2: "", city: "", region: "", postalCode: "", countryCode: "CA", latitude: null, longitude: null };
const EMPTY_SPECIAL: Omit<SpecialHours, "id"> = { date: "", isClosed: false, note: "", intervals: [{ opensAt: "09:00", closesAt: "17:00", closesNextDay: false }] };
const SAVING_FAILED = "Saving failed. Your entries are still here; try again.";
const ERROR_MESSAGES: Record<string, string> = {
  field_required: "This field is required.", field_length_invalid: "Use a valid value within the allowed length.",
  phone_e164_invalid: "Include the country code, such as +12045550123.", phone_display_invalid: "Provide both phone formats or leave both blank.",
  email_invalid: "Enter a valid email address.", time_zone_invalid: "Choose a time zone from the list.",
  country_code_invalid: "Use a two-letter uppercase country code.", coordinates_invalid: "Provide both coordinates within valid latitude and longitude ranges.",
  hours_days_duplicate: "Provide each day once.", hours_day_invalid: "Choose a valid day.",
  hours_interval_required: "Add at least one opening period.", hours_interval_limit: "Use no more than 12 periods.",
  hours_interval_invalid: "Use valid, different opening and closing times.", hours_intervals_overlap: "Opening periods cannot overlap.",
  special_date_invalid: "Choose a valid special date.", closed_date_has_intervals: "A closed date cannot contain opening periods.",
  special_date_duplicate: "You already have special hours on that date. Edit the existing one instead.",
  social_platform_duplicate: "Provide each social platform once.", social_url_invalid: "Use an approved HTTPS URL for this platform.",
  website_url_invalid: "Enter a full web address that starts with https://, such as https://example.com.",
};

/**
 * Plain names for the field paths the API reports errors against.
 *
 * The error summary used to print the raw path — `address.line1`, `days.1.intervals` — at an owner
 * who has never seen the request body those names come from.
 */
const FIELD_LABELS: Record<string, string> = {
  name: "Name", description: "Description", phoneE164: "Phone number", phoneDisplay: "Phone number as shown",
  email: "Email", timeZone: "Time zone", websiteUrl: "Website", restaurantType: "Establishment type",
  priceRange: "Price range", "address.line1": "Address line 1", "address.line2": "Address line 2",
  "address.city": "City", "address.region": "Province or state", "address.postalCode": "Postal code",
  "address.countryCode": "Country code", "address.coordinates": "Map coordinates", days: "Regular hours",
  date: "Special date", intervals: "Opening periods", note: "Note", links: "Social links",
};

/** Plain wording for a media asset's processing state, which is `pending`, `ready`, or `failed`. */
function imageStatusLabel(status: string): string {
  switch (status) {
    case "ready": return "ready to use";
    case "pending": return "still being prepared";
    case "failed": return "could not be prepared — upload it again";
    default: return "not ready yet";
  }
}

function messageForRestaurantCodes(codes: string[] | undefined): string | null {
  if (!codes?.length) return null;
  return ERROR_MESSAGES[codes[0]] ?? "Enter a valid value.";
}

function fieldLabel(field: string): string {
  const known = FIELD_LABELS[field];
  if (known) return known;
  if (field.startsWith("days.")) return `${DAYS[Number(field.split(".")[1])] ?? "Regular"} hours`;
  if (field.startsWith("links.")) return `${field.slice("links.".length)} link`;
  return field;
}

function normalizeHours(hours: RegularHoursDay[]): RegularHoursDay[] {
  return DAYS.map((_, dayOfWeek) => hours.find((day) => day.dayOfWeek === dayOfWeek) ?? { dayOfWeek, intervals: [] });
}

function focusFirstValidationError(errors: Record<string, string[]>, fallback: HTMLElement | null) {
  const targets = Array.from(document.querySelectorAll<HTMLElement>("[data-error-field]"));
  for (const field of Object.keys(errors)) {
    const target = targets.find((element) => element.dataset.errorField === field);
    if (target) {
      target.focus();
      return;
    }
  }
  fallback?.focus();
}

/**
 * One image slot backed by the shared media library.
 *
 * The main image, logo, and cover image differ only in their label and endpoint, so they share this
 * component rather than repeating the picker three times. Upload stays on the main-image section: it
 * adds to the tenant's media library, which all three slots select from.
 */
function ImageSlot({
  title, endpoint, current, assets, busy, onSave,
}: Readonly<{
  title: string;
  endpoint: string;
  current: MainImage | null;
  assets: AdminMediaAsset[];
  busy: string | null;
  onSave: (path: string, body: unknown, label: string, method?: "POST" | "PUT" | "DELETE") => Promise<boolean>;
}>) {
  const [selectedId, setSelectedId] = useState(current?.id ?? "");
  const label = title.toLowerCase();
  const titleId = `${endpoint.replace(/\W+/g, "-")}-title`;
  const variant = current?.variants[0];

  return (
    <section className={styles.editorSection} aria-labelledby={titleId}>
      <h2 id={titleId}>{title}</h2>
      {current ? (
        <div>
          <p><strong>Selected:</strong> {current.altText} — {imageStatusLabel(current.processingStatus)}</p>
          {variant && (
            <Image
              unoptimized
              loader={({ src }) => src}
              className={styles.imagePreview}
              src={variant.url}
              width={variant.width}
              height={variant.height}
              alt={current.altText}
            />
          )}
        </div>
      ) : <p>No {label} selected.</p>}
      {/* Labels and button names include the slot name so all three image sections stay
          distinguishable to assistive technology and to tests. */}
      <label>
        {`Ready image for ${label}`}
        <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
          <option value="">Choose an image</option>
          {assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.altText}</option>)}
        </select>
      </label>
      <div className={styles.buttonRow}>
        <button
          className={styles.primaryButton}
          type="button"
          disabled={!selectedId || busy !== null}
          onClick={() => void onSave(endpoint, { mediaAssetId: selectedId }, title)}
        >
          {`Select ${label}`}
        </button>
        <button
          type="button"
          className={styles.dangerButton}
          disabled={!current || busy !== null}
          onClick={() => void onSave(endpoint, undefined, title, "DELETE")}
        >
          {`Remove ${label}`}
        </button>
      </div>
    </section>
  );
}

export function RestaurantEditor({ initial, initialMedia }: { initial: AdminRestaurant; initialMedia: AdminMediaAsset[] }) {
  const [restaurant, setRestaurant] = useState(initial);
  const [profile, setProfile] = useState({
    name: initial.name, description: initial.description ?? "", phoneE164: initial.phoneE164 ?? "",
    phoneDisplay: initial.phoneDisplay ?? "", email: initial.email ?? "", timeZone: initial.timeZone,
    websiteUrl: initial.websiteUrl ?? "",
    restaurantType: initial.restaurantType ?? "", priceRange: initial.priceRange ?? "",
    address: initial.address ?? EMPTY_ADDRESS,
  });
  const [hours, setHours] = useState(() => normalizeHours(initial.regularHours));
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>(initial.socialLinks);
  const [special, setSpecial] = useState(EMPTY_SPECIAL);
  const [editingSpecialId, setEditingSpecialId] = useState<string | null>(null);
  const [pendingDeleteSpecialId, setPendingDeleteSpecialId] = useState<string | null>(null);
  const [imageId, setImageId] = useState(initial.mainImage?.id ?? "");
  const [mediaAssets, setMediaAssets] = useState(initialMedia);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [mediaAltText, setMediaAltText] = useState(initial.mainImage?.altText ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  // The last save that failed for a reason the owner cannot fix by editing a field, kept so the
  // status bar can offer to re-issue it rather than making them find the button again.
  const [failedSave, setFailedSave] = useState<
    { path: string; body: unknown; label: string; method: "POST" | "PUT" | "DELETE" } | null>(null);
  const errorSummaryRef = useRef<HTMLDivElement>(null);

  useUnsavedChanges(dirty);

  const { errorFor, fieldA11y } = fieldErrorHelpers(fieldErrors, "error", messageForRestaurantCodes);

  async function save(path: string, body: unknown, label: string, method: "POST" | "PUT" | "DELETE" = "PUT"): Promise<boolean> {
    setBusy(label); setNotice(null); setConflict(false); setSessionExpired(false); setFieldErrors({}); setFailedSave(null);
    try {
      const result = await mutate<AdminMutation>(path, method, body, restaurant.eTag);
      if (result) {
        setRestaurant(result.restaurant);
        setNotice(`${label} saved. ${publishingSentence(result.publication.status)}`);
      } else {
        setNotice(`${label} saved.`);
      }
      setDirty(false);
      return true;
    } catch (error) {
      if (error instanceof BrowserApiError && error.status === 401) {
        // A lapsed sign-in is not something retrying can fix, and nothing typed is thrown away
        // while the owner goes and signs in again.
        setSessionExpired(true);
        setNotice(sessionExpiredNotice);
      } else if (error instanceof BrowserApiError && error.status === 409) {
        setConflict(true);
        setNotice("This restaurant changed elsewhere. Your entries are preserved; reload only when you are ready to reapply them.");
      } else if (error instanceof BrowserApiError && error.status === 400 && error.problem.errors) {
        setFieldErrors(error.problem.errors);
        setNotice("Check the error summary. Your entries are preserved.");
        const errors = error.problem.errors;
        window.setTimeout(() => focusFirstValidationError(errors, errorSummaryRef.current), 0);
      } else {
        setFailedSave({ path, body, label, method });
        setNotice(SAVING_FAILED);
      }
      return false;
    } finally { setBusy(null); }
  }

  function retrySave() {
    if (!failedSave) return;
    void save(failedSave.path, failedSave.body, failedSave.label, failedSave.method);
  }

  function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (profile.phoneE164 && !isE164(profile.phoneE164)) {
      setNotice("Enter the phone number with its country code, for example +12045550123."); return;
    }
    void save("/api/v1/admin/restaurant/profile", {
      ...profile,
      description: profile.description || null,
      phoneE164: profile.phoneE164 || null,
      phoneDisplay: profile.phoneDisplay || null,
      email: profile.email || null,
      websiteUrl: profile.websiteUrl.trim() || null,
      restaurantType: profile.restaurantType || null,
      priceRange: profile.priceRange || null,
      address: { ...profile.address, line2: profile.address.line2 || null },
    }, "Profile");
  }

  function changeInterval(day: number, index: number, key: "opensAt" | "closesAt", value: string) {
    setHours((current) => current.map((entry) => entry.dayOfWeek !== day ? entry : {
      ...entry, intervals: entry.intervals.map((interval, position) => position === index ? { ...interval, [key]: value } : interval),
    }));
    setDirty(true);
  }

  async function removeSpecial(id: string) {
    if (await save(`/api/v1/admin/special-hours/${id}`, {}, "Special hours", "DELETE")) {
      setRestaurant((current) => ({ ...current, specialHours: current.specialHours.filter((item) => item.id !== id) }));
    }
  }

  async function saveSpecial() {
    const body = { date: special.date, isClosed: special.isClosed, note: special.note || null, intervals: special.isClosed ? [] : special.intervals.map(({ opensAt, closesAt }) => ({ opensAt, closesAt })) };
    const path = editingSpecialId ? `/api/v1/admin/special-hours/${editingSpecialId}` : "/api/v1/admin/special-hours";
    if (await save(path, body, "Special hours", editingSpecialId ? "PUT" : "POST")) {
      setSpecial(EMPTY_SPECIAL);
      setEditingSpecialId(null);
    }
  }

  async function uploadSelectedMedia() {
    if (!uploadFile || !mediaAltText.trim()) return;
    setBusy("Media upload"); setNotice(null);
    try {
      const uploaded = await uploadMedia<AdminMediaAsset>(uploadFile, mediaAltText);
      setMediaAssets((current) => [...current, uploaded]);
      setImageId(uploaded.id);
      setMediaAltText(uploaded.altText);
      setUploadFile(null);
      setNotice("Image uploaded and ready to select.");
    } catch (error) {
      setNotice(error instanceof BrowserApiError && error.status === 400
        ? "The image must be a valid PNG, JPEG, or WebP within the configured size and dimensions."
        : "Image upload failed. Try again.");
    } finally { setBusy(null); }
  }

  async function saveMediaAltText() {
    if (!imageId || !mediaAltText.trim()) return;
    if (await save(`/api/v1/admin/media-assets/${imageId}/alt-text`, { altText: mediaAltText }, "Image alt text")) {
      setMediaAssets((current) => current.map((item) => item.id === imageId ? { ...item, altText: mediaAltText.trim() } : item));
    }
  }

  return (
    <main id="main-content" className={styles.editorMain}>
      <div className={styles.editorHeading}><div><p className={styles.eyebrow}>Draft editor</p><h1>Restaurant</h1></div><a className={styles.secondaryButton} href="/admin/restaurant/preview">Preview draft</a></div>
      <DraftStatusBar
        publication={restaurant.publicationStatus}
        notice={notice}
        conflict={conflict}
        sessionExpired={sessionExpired}
        onRetry={failedSave ? retrySave : null}
        busy={busy !== null}
      />
      {Object.keys(fieldErrors).length > 0 && <div className={styles.errorSummary} ref={errorSummaryRef} tabIndex={-1} role="alert" aria-labelledby="error-summary-title"><h2 id="error-summary-title">Please correct these fields</h2><ul>{Object.entries(fieldErrors).map(([field, codes]) => <li key={field}><strong>{fieldLabel(field)}</strong>: {ERROR_MESSAGES[codes[0]] ?? "Enter a valid value."}</li>)}</ul></div>}

      <form className={styles.editorSection} onSubmit={submitProfile} onChange={() => setDirty(true)}>
        <h2>Restaurant profile</h2>
        <div className={styles.formGrid}>
          <label>Name<input required maxLength={120} {...fieldA11y("name")} value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />{errorFor("name")}</label>
          <label>Description<textarea maxLength={300} {...fieldA11y("description")} value={profile.description} onChange={(e) => setProfile({ ...profile, description: e.target.value })} />{errorFor("description")}</label>
          <label>Phone number (with country code)<input inputMode="tel" placeholder="+12045550123" {...fieldA11y("phoneE164")} value={profile.phoneE164} onChange={(e) => setProfile({ ...profile, phoneE164: e.target.value })} />{errorFor("phoneE164")}</label>
          <label>Phone number as shown to visitors<input inputMode="tel" placeholder="(204) 555-0123" {...fieldA11y("phoneDisplay")} value={profile.phoneDisplay} onChange={(e) => setProfile({ ...profile, phoneDisplay: e.target.value })} />{errorFor("phoneDisplay")}</label>
          <label>Email<input type="email" autoComplete="email" {...fieldA11y("email")} value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} />{errorFor("email")}</label>
          <label>Website<input type="url" inputMode="url" maxLength={2048} placeholder="https://example.com" autoComplete="url" {...fieldA11y("websiteUrl")} value={profile.websiteUrl} onChange={(e) => setProfile({ ...profile, websiteUrl: e.target.value })} />{errorFor("websiteUrl")}</label>
          <p>Your own site, if you have one. It has to start with https:// — leave it blank otherwise.</p>
          {/* The stored value is still an IANA identifier, which is what the backend validates; the
              owner picks a place instead of typing that key from memory. */}
          <label>Time zone<select required {...fieldA11y("timeZone")} value={profile.timeZone} onChange={(e) => setProfile({ ...profile, timeZone: e.target.value })}>{canadianTimeZones.some((zone) => zone.id === profile.timeZone) ? null : <option value={profile.timeZone}>{profile.timeZone}</option>}{canadianTimeZones.map((zone) => <option key={zone.id} value={zone.id}>{zone.label}</option>)}</select>{errorFor("timeZone")}</label>
          <label>Establishment type<select {...fieldA11y("restaurantType")} value={profile.restaurantType} onChange={(e) => setProfile({ ...profile, restaurantType: e.target.value })} aria-describedby="restaurant-type-help"><option value="">Not specified</option>{restaurantTypes.map((type) => <option key={type} value={type}>{type.replace(/([a-z])([A-Z])/g, "$1 $2")}</option>)}</select>{errorFor("restaurantType")}</label>
          <p id="restaurant-type-help">Search engines use the most specific type. Choose a cafe, bakery, or bar over the generic restaurant when it fits.</p>
          <label>Price range<select {...fieldA11y("priceRange")} value={profile.priceRange} onChange={(e) => setProfile({ ...profile, priceRange: e.target.value })}><option value="">Not specified</option>{priceRanges.map((range) => <option key={range} value={range}>{range}</option>)}</select>{errorFor("priceRange")}</label>
          <label>Address line 1<input required autoComplete="address-line1" {...fieldA11y("address.line1")} value={profile.address.line1} onChange={(e) => setProfile({ ...profile, address: { ...profile.address, line1: e.target.value } })} />{errorFor("address.line1")}</label>
          <label>Address line 2<input autoComplete="address-line2" {...fieldA11y("address.line2")} value={profile.address.line2 ?? ""} onChange={(e) => setProfile({ ...profile, address: { ...profile.address, line2: e.target.value } })} />{errorFor("address.line2")}</label>
          <label>City<input required autoComplete="address-level2" {...fieldA11y("address.city")} value={profile.address.city} onChange={(e) => setProfile({ ...profile, address: { ...profile.address, city: e.target.value } })} />{errorFor("address.city")}</label>
          <label>Province or state<input required autoComplete="address-level1" {...fieldA11y("address.region")} value={profile.address.region} onChange={(e) => setProfile({ ...profile, address: { ...profile.address, region: e.target.value } })} />{errorFor("address.region")}</label>
          <label>Postal code<input required autoComplete="postal-code" {...fieldA11y("address.postalCode")} value={profile.address.postalCode} onChange={(e) => setProfile({ ...profile, address: { ...profile.address, postalCode: e.target.value } })} />{errorFor("address.postalCode")}</label>
          <label>Country code<input required minLength={2} maxLength={2} autoComplete="country" {...fieldA11y("address.countryCode")} value={profile.address.countryCode} onChange={(e) => setProfile({ ...profile, address: { ...profile.address, countryCode: e.target.value.toUpperCase() } })} />{errorFor("address.countryCode")}</label>
          <label>Latitude<input type="number" min={-90} max={90} step="any" {...fieldA11y("address.coordinates")} value={profile.address.latitude ?? ""} onChange={(e) => setProfile({ ...profile, address: { ...profile.address, latitude: e.target.value === "" ? null : Number(e.target.value) } })} />{errorFor("address.coordinates")}</label>
          <label>Longitude<input type="number" min={-180} max={180} step="any" {...fieldA11y("address.coordinates")} value={profile.address.longitude ?? ""} onChange={(e) => setProfile({ ...profile, address: { ...profile.address, longitude: e.target.value === "" ? null : Number(e.target.value) } })} /></label>
        </div>
        <button className={styles.primaryButton} disabled={busy !== null}>Save profile</button>
      </form>

      <section className={styles.editorSection} aria-labelledby="hours-title" tabIndex={-1} {...fieldA11y("days")}>
        <h2 id="hours-title">Regular hours</h2>
        {errorFor("days")}
        <p>Add multiple periods for split shifts. A closing time earlier than opening means the shift closes the next day.</p>
        <button type="button" className={styles.secondaryButton} onClick={() => { const monday = hours[1].intervals.map((item) => ({ ...item })); setHours(hours.map((day) => day.dayOfWeek >= 1 && day.dayOfWeek <= 5 ? { ...day, intervals: monday.map((item) => ({ ...item })) } : day)); setDirty(true); }}>Copy Monday to weekdays</button>
        <div className={styles.hoursGrid}>{hours.map((day) => <fieldset key={day.dayOfWeek} className={styles.dayCard} tabIndex={-1} {...fieldA11y(`days.${day.dayOfWeek}.intervals`)}>
          <legend>{DAYS[day.dayOfWeek]}</legend>
          {errorFor(`days.${day.dayOfWeek}.intervals`)}
          {day.intervals.length === 0 && <p>Closed</p>}
          {day.intervals.map((interval, index) => <div className={styles.intervalRow} key={index}>
            <label>Opens<input type="time" required value={interval.opensAt.slice(0, 5)} onChange={(e) => changeInterval(day.dayOfWeek, index, "opensAt", e.target.value)} /></label>
            <label>Closes<input type="time" required value={interval.closesAt.slice(0, 5)} onChange={(e) => changeInterval(day.dayOfWeek, index, "closesAt", e.target.value)} /></label>
            <button type="button" aria-label={`Remove ${DAYS[day.dayOfWeek]} period ${index + 1}`} onClick={() => { setHours(hours.map((entry) => entry.dayOfWeek === day.dayOfWeek ? { ...entry, intervals: entry.intervals.filter((_, position) => position !== index) } : entry)); setDirty(true); }}>Remove</button>
          </div>)}
          <button type="button" onClick={() => { setHours(hours.map((entry) => entry.dayOfWeek === day.dayOfWeek ? { ...entry, intervals: [...entry.intervals, { opensAt: "09:00", closesAt: "17:00", closesNextDay: false }] } : entry)); setDirty(true); }}>Add period</button>
        </fieldset>)}</div>
        <button className={styles.primaryButton} type="button" disabled={busy !== null} onClick={() => void save("/api/v1/admin/restaurant/regular-hours", { days: hours.map((day) => ({ dayOfWeek: day.dayOfWeek, intervals: day.intervals.map(({ opensAt, closesAt }) => ({ opensAt, closesAt })) })) }, "Regular hours")}>Save regular hours</button>
      </section>

      <section className={styles.editorSection} aria-labelledby="special-title">
        <h2 id="special-title">Special hours</h2>
        <ul className={styles.specialList}>{restaurant.specialHours.map((item) => <li key={item.id}><span><strong>{item.date}</strong> — {item.isClosed ? "Closed" : item.intervals.map((interval) => `${interval.opensAt.slice(0, 5)}–${interval.closesAt.slice(0, 5)}`).join(", ")}{item.note && ` (${item.note})`}</span><span className={styles.buttonRow}><button type="button" onClick={() => { setEditingSpecialId(item.id); setSpecial({ date: item.date, isClosed: item.isClosed, note: item.note, intervals: item.intervals.map((period) => ({ ...period, opensAt: period.opensAt.slice(0, 5), closesAt: period.closesAt.slice(0, 5) })) }); }}>Edit</button><button type="button" aria-label={`Delete special hours for ${item.date}`} onClick={() => setPendingDeleteSpecialId(item.id)}>Delete</button></span></li>)}</ul>
        {pendingDeleteSpecialId && <ConfirmDialog
          idPrefix="delete-special"
          title="Delete special hours?"
          description="This removes the date from the draft. Publication starts immediately after confirmation."
          onCancel={() => setPendingDeleteSpecialId(null)}
          onConfirm={async () => {
            const id = pendingDeleteSpecialId;
            setPendingDeleteSpecialId(null);
            await removeSpecial(id);
          }}
        />}
        <div className={styles.inlineForm}>
          <label>Date<input type="date" required {...fieldA11y("date")} value={special.date} onChange={(e) => { setSpecial({ ...special, date: e.target.value }); setDirty(true); }} />{errorFor("date")}</label>
          <label className={styles.checkLabel}><input type="checkbox" checked={special.isClosed} onChange={(e) => { setSpecial({ ...special, isClosed: e.target.checked }); setDirty(true); }} /> Closed all day</label>
          <div role="group" aria-label="Special-hour intervals" tabIndex={-1} {...fieldA11y("intervals")}>
            {!special.isClosed && special.intervals.map((period, index) => <div className={styles.intervalRow} key={index}><label>Opens<input type="time" value={period.opensAt} onChange={(e) => { setSpecial({ ...special, intervals: special.intervals.map((item, position) => position === index ? { ...item, opensAt: e.target.value } : item) }); setDirty(true); }} /></label><label>Closes<input type="time" value={period.closesAt} onChange={(e) => { setSpecial({ ...special, intervals: special.intervals.map((item, position) => position === index ? { ...item, closesAt: e.target.value } : item) }); setDirty(true); }} /></label><button type="button" aria-label={`Remove special period ${index + 1}`} onClick={() => { setSpecial({ ...special, intervals: special.intervals.filter((_, position) => position !== index) }); setDirty(true); }}>Remove</button></div>)}
            {errorFor("intervals")}
          </div>
          <label>Note<input maxLength={200} {...fieldA11y("note")} value={special.note ?? ""} onChange={(e) => setSpecial({ ...special, note: e.target.value })} />{errorFor("note")}</label>
        </div>
        {!special.isClosed && <button className={styles.secondaryButton} type="button" onClick={() => { setSpecial({ ...special, intervals: [...special.intervals, { opensAt: "09:00", closesAt: "17:00", closesNextDay: false }] }); setDirty(true); }}>Add special period</button>}
        <div className={styles.buttonRow}><button className={styles.primaryButton} type="button" disabled={!special.date || (!special.isClosed && special.intervals.length === 0) || busy !== null} onClick={() => void saveSpecial()}>{editingSpecialId ? "Save special date" : "Add special date"}</button>{editingSpecialId && <button className={styles.secondaryButton} type="button" onClick={() => { setEditingSpecialId(null); setSpecial(EMPTY_SPECIAL); }}>Cancel edit</button>}</div>
      </section>

      <section className={styles.editorSection} aria-labelledby="social-title" tabIndex={-1} {...fieldA11y("links")}>
        <h2 id="social-title">Social links</h2>
        {errorFor("links")}
        {socialLinks.map((link, index) => {
          const field = `links.${link.platform}`;
          const describedBy = fieldErrors[field] ? `error-${field.replaceAll(".", "-")}` : undefined;
          return <div className={styles.inlineForm} key={index} role="group" aria-label={`${link.platform} social link`} tabIndex={-1} {...fieldA11y(field)}><label>Platform<input value={link.platform} onChange={(e) => { setSocialLinks(socialLinks.map((item, position) => position === index ? { ...item, platform: e.target.value } : item)); setDirty(true); }} /></label><label>URL<input type="url" aria-invalid={Boolean(fieldErrors[field])} aria-describedby={describedBy} value={link.url} onChange={(e) => { setSocialLinks(socialLinks.map((item, position) => position === index ? { ...item, url: e.target.value } : item)); setDirty(true); }} /></label>{errorFor(field)}<button type="button" onClick={() => { setSocialLinks(socialLinks.filter((_, position) => position !== index)); setDirty(true); }}>Remove</button></div>;
        })}
        <div className={styles.buttonRow}><button type="button" className={styles.secondaryButton} onClick={() => { setSocialLinks([...socialLinks, { platform: "instagram", url: "https://" }]); setDirty(true); }}>Add link</button><button type="button" className={styles.primaryButton} disabled={busy !== null} onClick={() => void save("/api/v1/admin/restaurant/social-links", { links: socialLinks }, "Social links")}>Save social links</button></div>
      </section>

      <section className={styles.editorSection} aria-labelledby="image-title">
        <h2 id="image-title">Main image</h2>
        {restaurant.mainImage ? <div><p><strong>Selected:</strong> {restaurant.mainImage.altText} — {imageStatusLabel(restaurant.mainImage.processingStatus)}</p>{restaurant.mainImage.variants[0] && <Image unoptimized loader={({ src }) => src} className={styles.imagePreview} src={restaurant.mainImage.variants[0].url} width={restaurant.mainImage.variants[0].width} height={restaurant.mainImage.variants[0].height} alt={restaurant.mainImage.altText} />}</div> : <p>No main image selected.</p>}
        <label>Ready image<select value={imageId} aria-describedby="asset-help" onChange={(e) => { const asset = mediaAssets.find((item) => item.id === e.target.value); setImageId(e.target.value); setMediaAltText(asset?.altText ?? ""); setDirty(true); }}><option value="">Choose an image</option>{mediaAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.altText}</option>)}</select></label>
        <p id="asset-help">Only your own images that have finished processing appear in this list.</p>
        <label>Selected image alt text<input maxLength={200} value={mediaAltText} onChange={(e) => { setMediaAltText(e.target.value); setDirty(true); }} /></label>
        <div className={styles.buttonRow}><button className={styles.primaryButton} type="button" disabled={!imageId || busy !== null} onClick={() => void save("/api/v1/admin/restaurant/main-image", { mediaAssetId: imageId }, "Main image")}>Select image</button><button className={styles.secondaryButton} type="button" disabled={!imageId || !mediaAltText.trim() || busy !== null} onClick={() => void saveMediaAltText()}>Save alt text</button><button type="button" className={styles.dangerButton} disabled={!restaurant.mainImage || busy !== null} onClick={() => void save("/api/v1/admin/restaurant/main-image", undefined, "Main image", "DELETE")}>Remove image</button></div>
        <div className={styles.inlineForm}><label>Upload image<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)} /></label><label>Upload alt text<input maxLength={200} value={mediaAltText} onChange={(e) => setMediaAltText(e.target.value)} /></label></div>
        <button className={styles.secondaryButton} type="button" disabled={!uploadFile || !mediaAltText.trim() || busy !== null} onClick={() => void uploadSelectedMedia()}>Upload image</button>
      </section>

      <ImageSlot
        title="Logo"
        endpoint="/api/v1/admin/restaurant/logo"
        current={restaurant.logo}
        assets={mediaAssets}
        busy={busy}
        onSave={save}
      />

      <ImageSlot
        title="Cover image"
        endpoint="/api/v1/admin/restaurant/cover-image"
        current={restaurant.coverImage}
        assets={mediaAssets}
        busy={busy}
        onSave={save}
      />

      <PublicationPanel status={restaurant.publicationStatus} />
    </main>
  );
}

export function PublicationPanel({ status: initial }: { status: PublicationStatus | null }) {
  const [observed, setObserved] = useState<PublicationStatus | null>(null);
  const status = observed && initial && observed.operationId === initial.operationId && observed.updatedAt >= initial.updatedAt
    ? observed
    : initial;
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (!status || !["pending", "processing"].includes(status.status)) return;
    const timer = window.setInterval(() => { void browserGet<PublicationStatus>(`/api/v1/admin/publication-status/${status.operationId}`).then(setObserved); }, 2500);
    return () => window.clearInterval(timer);
  }, [status]);
  // The owner is told what happened to their website, never the internal state name or the error
  // code behind it — those are for the logs, not for a restaurant owner reading a status panel.
  return <section className={styles.editorSection} aria-labelledby="publication-title"><h2 id="publication-title">Your website</h2>{status ? <><p role="status"><strong>{publishingLabel(status)}</strong></p>{status.status === "failed" && <p>We have tried {status.attemptCount === 1 ? "once" : `${status.attemptCount} times`}. Try again below, and contact support if it keeps failing.</p>}{status.status === "failed" && <button className={styles.primaryButton} type="button" disabled={pending} onClick={async () => { setPending(true); try { const next = await mutate<PublicationStatus>(`/api/v1/admin/publication-status/${status.operationId}/retry`, "POST", {}); if (next) setObserved(next); } finally { setPending(false); } }}>Retry publication</button>}</> : <p>Your changes have not been published yet.</p>}</section>;
}
