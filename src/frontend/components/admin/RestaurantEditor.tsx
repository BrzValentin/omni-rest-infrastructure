"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { BrowserApiError, browserGet, mutate, uploadMedia } from "@/lib/browser-api";
import { isE164 } from "@/lib/phone";
import type { AdminMediaAsset, AdminMutation, AdminRestaurant, PublicationStatus, RegularHoursDay, SocialLink, SpecialHours } from "@/lib/restaurant-contract";
import styles from "@/app/admin/admin.module.css";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const EMPTY_ADDRESS = { line1: "", line2: "", city: "", region: "", postalCode: "", countryCode: "CA", latitude: null, longitude: null };
const EMPTY_SPECIAL: Omit<SpecialHours, "id"> = { date: "", isClosed: false, note: "", intervals: [{ opensAt: "09:00", closesAt: "17:00", closesNextDay: false }] };
const ERROR_MESSAGES: Record<string, string> = {
  field_required: "This field is required.", field_length_invalid: "Use a valid value within the allowed length.",
  phone_e164_invalid: "Use E.164 format, such as +12045550123.", phone_display_invalid: "Provide both phone formats or leave both blank.",
  email_invalid: "Enter a valid email address.", time_zone_invalid: "Enter a valid IANA time zone.",
  country_code_invalid: "Use a two-letter uppercase country code.", coordinates_invalid: "Provide both coordinates within valid latitude and longitude ranges.",
  hours_days_duplicate: "Provide each day once.", hours_day_invalid: "Choose a valid day.",
  hours_interval_required: "Add at least one opening period.", hours_interval_limit: "Use no more than 12 periods.",
  hours_interval_invalid: "Use valid, different opening and closing times.", hours_intervals_overlap: "Opening periods cannot overlap.",
  special_date_invalid: "Choose a valid special date.", closed_date_has_intervals: "A closed date cannot contain opening periods.",
  social_platform_duplicate: "Provide each social platform once.", social_url_invalid: "Use an approved HTTPS URL for this platform.",
};

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

function DeleteSpecialDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const background = Array.from(document.body.children)
      .filter((element) => !element.contains(dialog))
      .map((element) => ({
        element: element as HTMLElement,
        inert: element.hasAttribute("inert"),
        ariaHidden: element.getAttribute("aria-hidden"),
      }));
    for (const item of background) {
      item.element.setAttribute("inert", "");
      item.element.setAttribute("aria-hidden", "true");
    }
    cancelRef.current?.focus();
    return () => {
      for (const item of background) {
        if (!item.inert) item.element.removeAttribute("inert");
        if (item.ariaHidden === null) item.element.removeAttribute("aria-hidden");
        else item.element.setAttribute("aria-hidden", item.ariaHidden);
      }
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled])") ?? []);
    if (focusable.length === 0) return;
    const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
    const nextIndex = event.shiftKey
      ? (currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1)
      : (currentIndex < 0 || currentIndex === focusable.length - 1 ? 0 : currentIndex + 1);
    event.preventDefault();
    focusable[nextIndex].focus();
  }

  return createPortal(
    <div className={styles.modalBackdrop}>
      <div ref={dialogRef} className={styles.confirmation} role="alertdialog" aria-modal="true" aria-labelledby="delete-special-title" aria-describedby="delete-special-description" onKeyDown={handleKeyDown}>
        <h3 id="delete-special-title">Delete special hours?</h3>
        <p id="delete-special-description">This removes the date from the draft. Publication starts immediately after confirmation.</p>
        <div className={styles.buttonRow}>
          <button ref={cancelRef} className={styles.secondaryButton} type="button" onClick={onCancel}>Cancel</button>
          <button className={styles.dangerButton} type="button" onClick={onConfirm}>Confirm delete</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function RestaurantEditor({ initial, initialMedia }: { initial: AdminRestaurant; initialMedia: AdminMediaAsset[] }) {
  const [restaurant, setRestaurant] = useState(initial);
  const [profile, setProfile] = useState({
    name: initial.name, description: initial.description ?? "", phoneE164: initial.phoneE164 ?? "",
    phoneDisplay: initial.phoneDisplay ?? "", email: initial.email ?? "", timeZone: initial.timeZone,
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
  const [dirty, setDirty] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const errorSummaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function save(path: string, body: unknown, label: string, method: "POST" | "PUT" | "DELETE" = "PUT"): Promise<boolean> {
    setBusy(label); setNotice(null); setConflict(false); setFieldErrors({});
    try {
      const result = await mutate<AdminMutation>(path, method, body, restaurant.eTag);
      if (result) {
        setRestaurant(result.restaurant);
        setNotice(`${label} saved. Publishing ${result.publication.status}.`);
      } else {
        setNotice(`${label} saved.`);
      }
      setDirty(false);
      return true;
    } catch (error) {
      if (error instanceof BrowserApiError && error.status === 409) {
        setConflict(true);
        setNotice("This restaurant changed elsewhere. Your entries are preserved; reload only when you are ready to reapply them.");
      } else if (error instanceof BrowserApiError && error.status === 400 && error.problem.errors) {
        setFieldErrors(error.problem.errors);
        setNotice("Check the error summary. Your entries are preserved.");
        const errors = error.problem.errors;
        window.setTimeout(() => focusFirstValidationError(errors, errorSummaryRef.current), 0);
      } else {
        setNotice("Saving failed. Your entries are still here; try again.");
      }
      return false;
    } finally { setBusy(null); }
  }

  function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (profile.phoneE164 && !isE164(profile.phoneE164)) {
      setNotice("Phone must be E.164, for example +12045550123."); return;
    }
    void save("/api/v1/admin/restaurant/profile", {
      ...profile,
      description: profile.description || null,
      phoneE164: profile.phoneE164 || null,
      phoneDisplay: profile.phoneDisplay || null,
      email: profile.email || null,
      address: { ...profile.address, line2: profile.address.line2 || null },
    }, "Profile");
  }

  function changeInterval(day: number, index: number, key: "opensAt" | "closesAt", value: string) {
    setHours((current) => current.map((entry) => entry.dayOfWeek !== day ? entry : {
      ...entry, intervals: entry.intervals.map((interval, position) => position === index ? { ...interval, [key]: value } : interval),
    }));
    setDirty(true);
  }

  function errorFor(field: string) {
    const codes = fieldErrors[field];
    if (!codes?.length) return null;
    return <span className={styles.fieldError} id={`error-${field.replaceAll(".", "-")}`}>{ERROR_MESSAGES[codes[0]] ?? "Enter a valid value."}</span>;
  }

  function fieldA11y(field: string) {
    return {
      "data-error-field": field,
      "aria-invalid": Boolean(fieldErrors[field]),
      "aria-describedby": fieldErrors[field] ? `error-${field.replaceAll(".", "-")}` : undefined,
    };
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
      <div className={styles.statusBar} role="status" aria-live="polite">
        <span>Draft {restaurant.draftVersion}</span>
        <span>Publication: {restaurant.publicationStatus?.status ?? "not started"}</span>
        {notice && <strong>{notice}</strong>}
        {conflict && <button type="button" onClick={() => window.location.reload()}>Reload latest</button>}
      </div>
      {Object.keys(fieldErrors).length > 0 && <div className={styles.errorSummary} ref={errorSummaryRef} tabIndex={-1} role="alert" aria-labelledby="error-summary-title"><h2 id="error-summary-title">Please correct these fields</h2><ul>{Object.entries(fieldErrors).map(([field, codes]) => <li key={field}><strong>{field}</strong>: {ERROR_MESSAGES[codes[0]] ?? "Enter a valid value."}</li>)}</ul></div>}

      <form className={styles.editorSection} onSubmit={submitProfile} onChange={() => setDirty(true)}>
        <h2>Restaurant profile</h2>
        <div className={styles.formGrid}>
          <label>Name<input required maxLength={120} {...fieldA11y("name")} value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />{errorFor("name")}</label>
          <label>Description<textarea maxLength={300} {...fieldA11y("description")} value={profile.description} onChange={(e) => setProfile({ ...profile, description: e.target.value })} />{errorFor("description")}</label>
          <label>Phone (E.164)<input inputMode="tel" placeholder="+12045550123" {...fieldA11y("phoneE164")} value={profile.phoneE164} onChange={(e) => setProfile({ ...profile, phoneE164: e.target.value })} />{errorFor("phoneE164")}</label>
          <label>Phone display<input inputMode="tel" placeholder="(204) 555-0123" {...fieldA11y("phoneDisplay")} value={profile.phoneDisplay} onChange={(e) => setProfile({ ...profile, phoneDisplay: e.target.value })} />{errorFor("phoneDisplay")}</label>
          <label>Email<input type="email" autoComplete="email" {...fieldA11y("email")} value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} />{errorFor("email")}</label>
          <label>Time zone<input required {...fieldA11y("timeZone")} value={profile.timeZone} onChange={(e) => setProfile({ ...profile, timeZone: e.target.value })} />{errorFor("timeZone")}</label>
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
        {pendingDeleteSpecialId && <DeleteSpecialDialog
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
        {restaurant.mainImage ? <div><p><strong>Selected:</strong> {restaurant.mainImage.altText} ({restaurant.mainImage.processingStatus})</p>{restaurant.mainImage.variants[0] && <Image unoptimized loader={({ src }) => src} className={styles.imagePreview} src={restaurant.mainImage.variants[0].url} width={restaurant.mainImage.variants[0].width} height={restaurant.mainImage.variants[0].height} alt={restaurant.mainImage.altText} />}</div> : <p>No main image selected.</p>}
        <label>Ready image<select value={imageId} aria-describedby="asset-help" onChange={(e) => { const asset = mediaAssets.find((item) => item.id === e.target.value); setImageId(e.target.value); setMediaAltText(asset?.altText ?? ""); setDirty(true); }}><option value="">Choose an image</option>{mediaAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.altText}</option>)}</select></label>
        <p id="asset-help">Only validated, tenant-owned images whose processing status is ready are available.</p>
        <label>Selected image alt text<input maxLength={200} value={mediaAltText} onChange={(e) => { setMediaAltText(e.target.value); setDirty(true); }} /></label>
        <div className={styles.buttonRow}><button className={styles.primaryButton} type="button" disabled={!imageId || busy !== null} onClick={() => void save("/api/v1/admin/restaurant/main-image", { mediaAssetId: imageId }, "Main image")}>Select image</button><button className={styles.secondaryButton} type="button" disabled={!imageId || !mediaAltText.trim() || busy !== null} onClick={() => void saveMediaAltText()}>Save alt text</button><button type="button" className={styles.dangerButton} disabled={!restaurant.mainImage || busy !== null} onClick={() => void save("/api/v1/admin/restaurant/main-image", undefined, "Main image", "DELETE")}>Remove image</button></div>
        <div className={styles.inlineForm}><label>Upload image<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)} /></label><label>Upload alt text<input maxLength={200} value={mediaAltText} onChange={(e) => setMediaAltText(e.target.value)} /></label></div>
        <button className={styles.secondaryButton} type="button" disabled={!uploadFile || !mediaAltText.trim() || busy !== null} onClick={() => void uploadSelectedMedia()}>Upload image</button>
      </section>

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
  return <section className={styles.editorSection} aria-labelledby="publication-title"><h2 id="publication-title">Publication</h2>{status ? <><p role="status">Status: <strong>{status.status}</strong>. Attempts: {status.attemptCount}.</p>{status.errorCode && <p>Error: {status.errorCode}</p>}{status.status === "failed" && <button className={styles.primaryButton} type="button" disabled={pending} onClick={async () => { setPending(true); try { const next = await mutate<PublicationStatus>(`/api/v1/admin/publication-status/${status.operationId}/retry`, "POST", {}); if (next) setObserved(next); } finally { setPending(false); } }}>Retry publication</button>}</> : <p>No publication has been requested yet.</p>}</section>;
}
