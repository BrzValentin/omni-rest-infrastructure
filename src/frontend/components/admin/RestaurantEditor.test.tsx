import React from "react";
import { act, createEvent, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserApiError } from "@/lib/browser-api";
import type { AdminMutation, AdminRestaurant } from "@/lib/restaurant-contract";
import { PublicationPanel, RestaurantEditor } from "./RestaurantEditor";

const mocks = vi.hoisted(() => ({ mutate: vi.fn(), browserGet: vi.fn(), uploadMedia: vi.fn() }));
vi.mock("@/lib/browser-api", async (importOriginal) => ({ ...await importOriginal<typeof import("@/lib/browser-api")>(), mutate: mocks.mutate, browserGet: mocks.browserGet, uploadMedia: mocks.uploadMedia }));
vi.mock("next/image", () => ({ default: (props: Record<string, unknown>) => {
  const imageProps = { ...props };
  Reflect.deleteProperty(imageProps, "loader");
  Reflect.deleteProperty(imageProps, "unoptimized");
  return React.createElement("img", imageProps);
} }));

const initial: AdminRestaurant = {
  id: "restaurant", name: "Prairie Table", description: "Seasonal", phoneE164: "+12045550123", phoneDisplay: "(204) 555-0123", email: "hello@example.test", timeZone: "America/Winnipeg",
  address: { line1: "1 Main", line2: null, city: "Winnipeg", region: "MB", postalCode: "R3C 1A1", countryCode: "CA", latitude: null, longitude: null },
  regularHours: [{ dayOfWeek: 1, intervals: [{ opensAt: "09:00:00", closesAt: "17:00:00", closesNextDay: false }] }],
  specialHours: [{ id: "special", date: "2026-12-25", isClosed: true, note: "Holiday", intervals: [] }],
  restaurantType: "Restaurant", priceRange: "$$", logo: null, coverImage: null,
  socialLinks: [{ platform: "instagram", url: "https://instagram.com/example" }],
  mainImage: { id: "33333333-3333-3333-3333-333333333333", altText: "Dining room", processingStatus: "ready", variants: [{ url: "https://images.example.test/main.webp", width: 800, height: 600 }] },
  draftDesignId: "legacy-current-v1", publishedDesignId: "legacy-current-v1",
  websiteDesigns: [
    { id: "legacy-current-v1", name: "Current design", contractVersion: "1", availability: "grandfathered" },
    { id: "quiet-elegance-v1", name: "Quiet Elegance", contractVersion: "1", availability: "available" },
    { id: "nightfall-v1", name: "Nightfall", contractVersion: "1", availability: "available" },
    { id: "broadsheet-v1", name: "Broadsheet", contractVersion: "1", availability: "available" },
    { id: "sunroom-v1", name: "Sunroom", contractVersion: "1", availability: "available" },
  ],
  draftVersion: "3", eTag: '"draft-3"', publicationStatus: { operationId: "operation", status: "failed", draftVersion: "3", attemptCount: 2, errorCode: "projection_failed", updatedAt: "2026-07-31T12:00:00Z" },
};
const mutation: AdminMutation = { restaurant: initial, publication: initial.publicationStatus! };

describe("RestaurantEditor", () => {
  beforeEach(() => { mocks.mutate.mockReset().mockResolvedValue(mutation); mocks.browserGet.mockReset(); });

  it("edits and saves each restaurant section while preserving accessible structure", async () => {
    const user = userEvent.setup({ delay: null });
    const { container } = render(<RestaurantEditor initial={initial} initialMedia={[initial.mainImage!]} />);

    // `userEvent.type` dispatches one event per character, which under jsdom dominates the
    // runtime of this test (13 fields) and pushed it past the default 5s timeout. None of the
    // assertions below depend on per-keystroke behaviour — these are plain controlled inputs,
    // and the E.164 check runs on submit — so set values directly and keep userEvent for the
    // interactions this test is actually about: clicks, selection, focus, and the dialog
    // (with `delay: null`, since nothing here depends on inter-event timing).
    const setValue = (field: HTMLElement, value: string) => { fireEvent.change(field, { target: { value } }); };

    for (const [label, value] of [
      ["Name", "New Prairie Table"], ["Description", "Updated seasonal"],
      ["Phone number as shown to visitors", "204-555-0123"],
      ["Email", "new@example.test"], ["Website", "https://prairietable.example"], ["Address line 1", "2 Main"],
      ["Address line 2", "Suite 1"], ["City", "Brandon"], ["Province or state", "SK"], ["Postal code", "R7A 0A1"], ["Country code", "US"],
    ]) {
      setValue(screen.getByLabelText(label), value);
    }
    setValue(screen.getByLabelText("Time zone"), "America/Regina");
    setValue(screen.getByLabelText("Phone number (with country code)"), "2045550123");
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    expect(screen.getByText(/Enter the phone number with its country code/)).toBeVisible();
    setValue(screen.getByLabelText("Phone number (with country code)"), "+12045550123");
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith("/api/v1/admin/restaurant/profile", "PUT", expect.any(Object), '"draft-3"'));

    await user.click(screen.getByRole("button", { name: "Copy Monday to weekdays" }));
    await user.click(screen.getAllByRole("button", { name: "Add period" })[0]);
    const sunday = screen.getByRole("group", { name: "Sunday" });
    setValue(within(sunday).getByLabelText("Opens"), "18:00");
    setValue(within(sunday).getByLabelText("Closes"), "02:00");
    await user.click(within(sunday).getByRole("button", { name: "Remove Sunday period 1" }));
    await user.click(screen.getByRole("button", { name: "Save regular hours" }));
    expect(mocks.mutate).toHaveBeenCalledWith("/api/v1/admin/restaurant/regular-hours", "PUT", expect.any(Object), '"draft-3"');

    setValue(screen.getByLabelText("Date"), "2026-12-31");
    const specialSection = screen.getByRole("heading", { name: "Special hours" }).parentElement!;
    await user.click(within(specialSection).getByLabelText("Closed all day"));
    await user.click(within(specialSection).getByLabelText("Closed all day"));
    setValue(within(specialSection).getByLabelText("Opens"), "20:00");
    setValue(within(specialSection).getByLabelText("Closes"), "01:00");
    await user.click(screen.getByRole("button", { name: "Add special date" }));
    expect(mocks.mutate).toHaveBeenCalledWith("/api/v1/admin/special-hours", "POST", expect.any(Object), '"draft-3"');
    await user.click(screen.getByRole("button", { name: "Delete special hours for 2026-12-25" }));
    expect(screen.getByRole("alertdialog", { name: "Delete special hours?" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete special hours for 2026-12-25" }));
    await user.click(screen.getByRole("button", { name: "Confirm delete" }));
    expect(mocks.mutate).toHaveBeenCalledWith("/api/v1/admin/special-hours/special", "DELETE", {}, '"draft-3"');

    const socialSection = screen.getByRole("heading", { name: "Social links" }).parentElement!;
    await user.selectOptions(within(socialSection).getByLabelText("Platform"), "facebook");
    setValue(within(socialSection).getByLabelText("URL"), "https://facebook.com/example");
    await user.click(within(socialSection).getByRole("button", { name: "Remove" }));
    await user.click(screen.getByRole("button", { name: "Add link" }));
    await user.click(screen.getByRole("button", { name: "Save social links" }));
    expect(mocks.mutate).toHaveBeenCalledWith("/api/v1/admin/restaurant/social-links", "PUT", expect.any(Object), '"draft-3"');

    await user.selectOptions(screen.getByLabelText("Ready image"), initial.mainImage!.id);
    await user.click(screen.getByRole("button", { name: "Select image" }));
    await user.click(screen.getByRole("button", { name: "Remove image" }));
    expect(mocks.mutate).toHaveBeenCalledWith("/api/v1/admin/restaurant/main-image", "DELETE", undefined, '"draft-3"');

    await user.click(screen.getByRole("button", { name: "Retry publication" }));
    expect(mocks.mutate).toHaveBeenCalledWith("/api/v1/admin/publication-status/operation/retry", "POST", {});
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    // This test drives every section of a large form and finishes with a full axe run. It sits
    // near the default timeout on its own and exceeds it under coverage instrumentation, so the
    // budget is stated explicitly rather than left to chance.
  }, 30_000);

  it("preserves entries and offers an explicit reload after an ETag conflict", async () => {
    const user = userEvent.setup();
    mocks.mutate.mockRejectedValueOnce(new BrowserApiError(409, { code: "version_conflict" }));
    render(<RestaurantEditor initial={{ ...initial, mainImage: null, publicationStatus: null }} initialMedia={[]} />);
    await user.type(screen.getByLabelText("Description"), " retained");
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    expect(await screen.findByText(/entries are preserved/)).toBeVisible();
    expect(screen.getByLabelText("Description")).toHaveValue("Seasonal retained");
    expect(screen.getByRole("button", { name: "Reload latest" })).toBeVisible();
  });

  it("maps backend 400 codes inline and focuses the first invalid field without clearing input", async () => {
    const user = userEvent.setup();
    mocks.mutate.mockRejectedValueOnce(new BrowserApiError(400, { code: "admin_validation", errors: { name: ["field_length_invalid"] } }));
    render(<RestaurantEditor initial={initial} initialMedia={[initial.mainImage!]} />);
    await user.clear(screen.getByLabelText("Name")); await user.type(screen.getByLabelText("Name"), "Retained name");
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    const summary = await screen.findByRole("alert", { name: "Please correct these fields" });
    expect(summary).toBeVisible();
    await waitFor(() => expect(screen.getByRole("textbox", { name: /^Name/ })).toHaveFocus());
    expect(screen.getByRole("textbox", { name: /^Name/ })).toHaveValue("Retained name");
    expect(screen.getByRole("textbox", { name: /^Name/ })).toHaveAttribute("aria-invalid", "true");
    expect(screen.getAllByText("Use a valid value within the allowed length.").length).toBeGreaterThanOrEqual(1);
  });

  it("maps hours errors inline and focuses the affected day group", async () => {
    const user = userEvent.setup();
    mocks.mutate.mockRejectedValueOnce(new BrowserApiError(400, { code: "admin_validation", errors: { "days.1.intervals": ["hours_intervals_overlap"] } }));
    render(<RestaurantEditor initial={initial} initialMedia={[initial.mainImage!]} />);

    await user.click(screen.getByRole("button", { name: "Save regular hours" }));
    const monday = await screen.findByRole("group", { name: "Monday" });
    await waitFor(() => expect(monday).toHaveFocus());
    expect(monday).toHaveAttribute("aria-invalid", "true");
    expect(monday).toHaveAttribute("aria-describedby", "error-days-1-intervals");
    expect(within(monday).getByText("Opening periods cannot overlap.")).toBeVisible();
    expect(screen.getByRole("alert", { name: "Please correct these fields" })).toBeVisible();
  });

  it("maps special-hour errors inline and focuses the interval group while preserving values", async () => {
    const user = userEvent.setup();
    mocks.mutate.mockRejectedValueOnce(new BrowserApiError(400, { code: "admin_validation", errors: { intervals: ["hours_interval_invalid"] } }));
    render(<RestaurantEditor initial={initial} initialMedia={[initial.mainImage!]} />);

    await user.type(screen.getByLabelText("Date"), "2026-12-31");
    const specialSection = screen.getByRole("heading", { name: "Special hours" }).parentElement!;
    const opens = within(specialSection).getByLabelText("Opens");
    await user.clear(opens);
    await user.type(opens, "11:00");
    await user.click(screen.getByRole("button", { name: "Add special date" }));

    const intervals = screen.getByRole("group", { name: "Special-hour intervals" });
    await waitFor(() => expect(intervals).toHaveFocus());
    expect(intervals).toHaveAttribute("aria-invalid", "true");
    expect(intervals).toHaveAttribute("aria-describedby", "error-intervals");
    expect(within(intervals).getByText("Use valid, different opening and closing times.")).toBeVisible();
    expect(opens).toHaveValue("11:00");
  });

  it("maps social URL errors inline and focuses the affected platform group", async () => {
    const user = userEvent.setup();
    mocks.mutate.mockRejectedValueOnce(new BrowserApiError(400, { code: "admin_validation", errors: { "links.instagram": ["social_url_invalid"] } }));
    render(<RestaurantEditor initial={initial} initialMedia={[initial.mainImage!]} />);

    await user.click(screen.getByRole("button", { name: "Save social links" }));
    const group = await screen.findByRole("group", { name: "instagram social link" });
    await waitFor(() => expect(group).toHaveFocus());
    expect(group).toHaveAttribute("aria-invalid", "true");
    expect(within(group).getByLabelText("URL")).toHaveAttribute("aria-describedby", "error-links-instagram");
    expect(within(group).getByText("Use an approved HTTPS URL for this platform.")).toBeVisible();
    expect(within(group).getByLabelText("URL")).toHaveValue("https://instagram.com/example");
  });

  it("makes destructive confirmation keyboard-safe and restores focus and background state", async () => {
    const user = userEvent.setup();
    const { container } = render(<RestaurantEditor initial={initial} initialMedia={[initial.mainImage!]} />);
    const trigger = screen.getByRole("button", { name: "Delete special hours for 2026-12-25" });

    await user.click(trigger);
    const dialog = screen.getByRole("alertdialog", { name: "Delete special hours?" });
    const cancel = within(dialog).getByRole("button", { name: "Cancel" });
    const confirm = within(dialog).getByRole("button", { name: "Confirm delete" });
    expect(cancel).toHaveFocus();
    expect(container).toHaveAttribute("inert");
    expect(container).toHaveAttribute("aria-hidden", "true");

    await user.keyboard("{Tab}");
    expect(confirm).toHaveFocus();
    await user.keyboard("{Tab}");
    expect(cancel).toHaveFocus();
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(confirm).toHaveFocus();
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(container).not.toHaveAttribute("inert");
    expect(container).not.toHaveAttribute("aria-hidden");
  });

  it("saves the restaurant's own website and explains an address it will not accept", async () => {
    const user = userEvent.setup();
    mocks.mutate.mockRejectedValueOnce(new BrowserApiError(400, {
      code: "admin_validation", errors: { websiteUrl: ["website_url_invalid"] },
    }));
    render(<RestaurantEditor initial={{ ...initial, websiteUrl: "https://prairietable.example" }} initialMedia={[]} />);

    const website = screen.getByLabelText("Website");
    expect(website).toHaveAttribute("type", "url");
    expect(website).toHaveValue("https://prairietable.example");

    fireEvent.change(website, { target: { value: "http://insecure.example" } });
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    // The message appears twice by design: once in the error summary, once beside the field.
    await waitFor(() => expect(
      screen.getAllByText(/Enter a full web address that starts with https/)).toHaveLength(2));
    expect(website).toHaveAttribute("aria-invalid", "true");
    expect(website).toHaveAttribute("aria-describedby", "error-websiteUrl");
    // The error summary names the field the way the form does, not the way the API does.
    expect(within(screen.getByRole("alert", { name: "Please correct these fields" })).getByText("Website")).toBeVisible();

    fireEvent.change(website, { target: { value: "https://prairietable.example" } });
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    await waitFor(() => expect(mocks.mutate).toHaveBeenLastCalledWith(
      "/api/v1/admin/restaurant/profile", "PUT",
      expect.objectContaining({ websiteUrl: "https://prairietable.example" }), '"draft-3"'));
  });

  it("clears the website when the field is left blank", async () => {
    const user = userEvent.setup();
    render(<RestaurantEditor initial={{ ...initial, websiteUrl: "https://prairietable.example" }} initialMedia={[]} />);

    fireEvent.change(screen.getByLabelText("Website"), { target: { value: "   " } });
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith("/api/v1/admin/restaurant/profile", "PUT",
      expect.objectContaining({ websiteUrl: null }), '"draft-3"'));
  });

  it("saves the About us text with the profile, keeping the owner's paragraph breaks (BUG-001)", async () => {
    const user = userEvent.setup();
    render(<RestaurantEditor initial={initial} initialMedia={[]} />);

    const about = screen.getByLabelText("About us");
    expect(about).toHaveAttribute("maxLength", "2000");
    fireEvent.change(about, { target: { value: "  Our story.\n\nOur kitchen.  " } });
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith("/api/v1/admin/restaurant/profile", "PUT",
      expect.objectContaining({ about: "Our story.\n\nOur kitchen." }), '"draft-3"'));
  });

  it("tells the owner the public map needs both coordinates (BUG-003)", () => {
    render(<RestaurantEditor initial={initial} initialMedia={[]} />);
    expect(screen.getByText(/Add both coordinates to show a map of your location/)).toBeVisible();
  });

  it("clears About us when the field is left blank, which hides the public section", async () => {
    const user = userEvent.setup();
    render(<RestaurantEditor initial={{ ...initial, about: "Old story" }} initialMedia={[]} />);

    expect(screen.getByLabelText("About us")).toHaveValue("Old story");
    fireEvent.change(screen.getByLabelText("About us"), { target: { value: "   " } });
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith("/api/v1/admin/restaurant/profile", "PUT",
      expect.objectContaining({ about: null }), '"draft-3"'));
  });

  it("offers time zones as places to pick rather than an identifier to type", () => {
    render(<RestaurantEditor initial={initial} initialMedia={[]} />);

    const zone = screen.getByLabelText("Time zone");
    expect(zone.tagName).toBe("SELECT");
    expect(zone).toHaveValue("America/Winnipeg");
    expect(within(zone).getByRole("option", { name: "Central — Winnipeg" })).toBeInTheDocument();
    expect(within(zone).getByRole("option", { name: "Pacific — Vancouver" })).toBeInTheDocument();
  });

  it("keeps a time zone that is not on the Canadian list rather than silently changing it", () => {
    render(<RestaurantEditor initial={{ ...initial, timeZone: "Europe/Kyiv" }} initialMedia={[]} />);
    expect(screen.getByLabelText("Time zone")).toHaveValue("Europe/Kyiv");
  });

  it("speaks plainly in the status bar and the publication panel", () => {
    render(<RestaurantEditor initial={initial} initialMedia={[]} />);

    expect(screen.queryByText(/Draft 3/)).toBeNull();
    expect(screen.queryByText(/projection_failed/)).toBeNull();
    // The media library's processing state is described, never printed as its stored value.
    expect(screen.queryByText(/\(ready\)/)).toBeNull();
    expect(screen.getByText(/Dining room — ready to use/)).toBeVisible();
    expect(screen.getByText("Last saved")).toBeVisible();
    expect(screen.getAllByText("Website update did not finish").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/We have tried 2 times/)).toBeVisible();
  });

  it("sends the owner back to sign in when the session ends mid-save, keeping every entry", async () => {
    const user = userEvent.setup();
    mocks.mutate.mockRejectedValue(new BrowserApiError(401, { code: "unauthorized" }));
    render(<RestaurantEditor initial={initial} initialMedia={[]} />);

    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Seasonal, retained" } });
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    expect(await screen.findByText(/Your session ended/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Sign in again" }))
      .toHaveAttribute("href", "/admin/login?returnPath=%2Fadmin");
    expect(screen.getByLabelText("Description")).toHaveValue("Seasonal, retained");
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("re-issues the last failed save from a Try again button", async () => {
    const user = userEvent.setup();
    mocks.mutate.mockRejectedValueOnce(new BrowserApiError(503, { code: "unexpected_error" }));
    render(<RestaurantEditor initial={initial} initialMedia={[]} />);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "New Prairie Table" } });
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    expect(await screen.findByText(/Saving failed/)).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledTimes(2));
    expect(mocks.mutate).toHaveBeenLastCalledWith("/api/v1/admin/restaurant/profile", "PUT",
      expect.objectContaining({ name: "New Prairie Table" }), '"draft-3"');
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("warns before the browser walks away from unsaved profile edits", async () => {
    const user = userEvent.setup();
    render(<RestaurantEditor initial={initial} initialMedia={[]} />);

    const clean = createEvent("beforeunload", window, { cancelable: true });
    fireEvent(window, clean);
    expect(clean.defaultPrevented).toBe(false);

    await user.type(screen.getByLabelText("Name"), "!");

    const leaving = createEvent("beforeunload", window, { cancelable: true });
    fireEvent(window, leaving);
    expect(leaving.defaultPrevented).toBe(true);
  });

  it("adopts a new pending publication prop and polls it to completion", async () => {
    vi.useFakeTimers();
    const pending = { ...initial.publicationStatus!, operationId: "new-operation", status: "pending", errorCode: null, updatedAt: "2026-07-31T13:00:00Z" };
    const succeeded = { ...pending, status: "succeeded", updatedAt: "2026-07-31T13:00:01Z" };
    mocks.browserGet.mockResolvedValue(succeeded);
    const { rerender } = render(<PublicationPanel status={initial.publicationStatus} />);
    expect(screen.getByRole("button", { name: "Retry publication" })).toBeVisible();
    rerender(<PublicationPanel status={pending} />);
    expect(screen.queryByRole("button", { name: "Retry publication" })).not.toBeInTheDocument();
    expect(screen.getByText("Website updating now", { selector: "strong" })).toBeVisible();
    await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
    expect(mocks.browserGet).toHaveBeenCalledWith("/api/v1/admin/publication-status/new-operation");
    expect(screen.getByText("Website up to date", { selector: "strong" })).toBeVisible();
    vi.useRealTimers();
  });

  // Each of these renders the whole editor and ends with a full axe run, which under coverage
  // instrumentation can approach the default 5s timeout on its own.
  describe("phase 1 bug report", { timeout: 15_000 }, () => {
    const axeOptions = { rules: { "color-contrast": { enabled: false } } };
    const sectionTitled = (name: string) => screen.getByRole("heading", { name }).parentElement!;

    it("lists saved special hours on the 12-hour clock with the next-day suffix, while the time inputs keep HH:mm (BUG-005)", async () => {
      const user = userEvent.setup();
      const { container } = render(<RestaurantEditor initial={{
        ...initial,
        specialHours: [{ id: "late", date: "2026-12-31", isClosed: false, note: "Late service", intervals: [{ opensAt: "20:00:00", closesAt: "01:00:00", closesNextDay: true }] }],
      }} initialMedia={[]} />);
      const special = sectionTitled("Special hours");

      expect(within(special).getByText(/8:00 PM–1:00 AM next day \(Late service\)/)).toBeVisible();
      expect(within(special).queryByText(/\d\d:\d\d–/)).toBeNull();

      await user.click(within(special).getByRole("button", { name: "Edit" }));
      expect(within(special).getByLabelText("Opens")).toHaveValue("20:00");
      expect(within(special).getByLabelText("Closes")).toHaveValue("01:00");
      expect((await axe.run(container, axeOptions)).violations).toEqual([]);
    });

    it("offers no Note field in the special-hours editor, so nothing can be painted over an interval's Remove button (BUG-004)", async () => {
      const { container } = render(<RestaurantEditor initial={initial} initialMedia={[]} />);
      const special = sectionTitled("Special hours");

      expect(within(special).queryByLabelText("Note")).toBeNull();
      expect(within(screen.getByRole("group", { name: "Special-hour intervals" })).getByRole("button", { name: "Remove special period 1" })).toBeVisible();
      expect((await axe.run(container, axeOptions)).violations).toEqual([]);
    });

    it("sends an edited special date's existing note back unchanged even though the note cannot be edited (BUG-004)", async () => {
      const user = userEvent.setup();
      const { container } = render(<RestaurantEditor initial={initial} initialMedia={[]} />);
      const special = sectionTitled("Special hours");

      await user.click(within(special).getByRole("button", { name: "Edit" }));
      await user.click(within(special).getByRole("button", { name: "Save special date" }));

      await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith("/api/v1/admin/special-hours/special", "PUT",
        { date: "2026-12-25", isClosed: true, note: "Holiday", intervals: [] }, '"draft-3"'));
      expect((await axe.run(container, axeOptions)).violations).toEqual([]);
    });

    it("sends no note for a new special date and still removes an unwanted period with its Remove button (BUG-004)", async () => {
      const user = userEvent.setup();
      const { container } = render(<RestaurantEditor initial={initial} initialMedia={[]} />);
      const special = sectionTitled("Special hours");

      fireEvent.change(within(special).getByLabelText("Date"), { target: { value: "2026-12-31" } });
      await user.click(within(special).getByRole("button", { name: "Add special period" }));
      expect(within(special).getAllByLabelText("Opens")).toHaveLength(2);
      await user.click(within(special).getByRole("button", { name: "Remove special period 2" }));
      expect(within(special).getAllByLabelText("Opens")).toHaveLength(1);
      await user.click(within(special).getByRole("button", { name: "Add special date" }));

      await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith("/api/v1/admin/special-hours", "POST",
        { date: "2026-12-31", isClosed: false, note: null, intervals: [{ opensAt: "09:00", closesAt: "17:00" }] }, '"draft-3"'));
      expect((await axe.run(container, axeOptions)).violations).toEqual([]);
    });

    it("adds a second social link from a pasted Facebook profile URL and saves both links with their own platforms (BUG-006)", async () => {
      const user = userEvent.setup();
      const { container } = render(<RestaurantEditor initial={initial} initialMedia={[]} />);
      const social = sectionTitled("Social links");

      await user.click(within(social).getByRole("button", { name: "Add link" }));
      const url = within(social).getAllByLabelText("URL")[1];
      await user.clear(url);
      await user.paste("https://www.facebook.com/profile.php?id=100073564902779");

      const platform = within(social).getAllByLabelText("Platform")[1];
      expect(platform.tagName).toBe("SELECT");
      expect(platform).toHaveValue("facebook");
      expect(platform).toHaveDisplayValue("Facebook");

      await user.click(within(social).getByRole("button", { name: "Save social links" }));
      await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith("/api/v1/admin/restaurant/social-links", "PUT", {
        links: [
          { platform: "instagram", url: "https://instagram.com/example" },
          { platform: "facebook", url: "https://www.facebook.com/profile.php?id=100073564902779" },
        ],
      }, '"draft-3"'));
      expect((await axe.run(container, axeOptions)).violations).toEqual([]);
    });

    it("switches a row to the platform its pasted URL belongs to, unless another row already uses that platform (BUG-006)", async () => {
      const user = userEvent.setup();
      const { container } = render(<RestaurantEditor initial={initial} initialMedia={[]} />);
      const social = sectionTitled("Social links");

      await user.click(within(social).getByRole("button", { name: "Add link" }));
      const url = within(social).getAllByLabelText("URL")[1];
      const platform = within(social).getAllByLabelText("Platform")[1];
      expect(platform).toHaveValue("facebook");

      await user.clear(url);
      await user.paste("https://youtu.be/prairie-table");
      expect(platform).toHaveValue("youtube");

      // Instagram belongs to the first row; the backend's URL error explains this better than a
      // silent switch into a duplicate platform would.
      await user.clear(url);
      await user.paste("https://www.instagram.com/someone-else");
      expect(platform).toHaveValue("youtube");
      expect(within(social).getAllByLabelText("Platform")[0]).toHaveValue("instagram");
      expect((await axe.run(container, axeOptions)).violations).toEqual([]);
    });

    it("disables in each row the platforms that other rows already use (BUG-006)", async () => {
      const user = userEvent.setup();
      const { container } = render(<RestaurantEditor initial={initial} initialMedia={[]} />);
      const social = sectionTitled("Social links");

      await user.click(within(social).getByRole("button", { name: "Add link" }));
      const [first, second] = within(social).getAllByLabelText("Platform");

      expect(within(first).getByRole("option", { name: "Instagram" })).toBeEnabled();
      expect(within(first).getByRole("option", { name: "Facebook" })).toBeDisabled();
      expect(within(first).getByRole("option", { name: "Google Business Profile" })).toBeEnabled();
      expect(within(second).getByRole("option", { name: "Instagram" })).toBeDisabled();
      expect(within(second).getByRole("option", { name: "Facebook" })).toBeEnabled();

      await user.selectOptions(second, "linkedin");
      expect(within(first).getByRole("option", { name: "Facebook" })).toBeEnabled();
      expect(within(first).getByRole("option", { name: "LinkedIn" })).toBeDisabled();
      expect((await axe.run(container, axeOptions)).violations).toEqual([]);
    });

    it("starts a new link on the only platform left and then disables Add link with a visible reason (BUG-006)", async () => {
      const user = userEvent.setup();
      const sixLinks = [
        { platform: "instagram", url: "https://instagram.com/example" },
        { platform: "facebook", url: "https://facebook.com/example" },
        { platform: "tiktok", url: "https://tiktok.com/@example" },
        { platform: "google_business", url: "https://maps.app.goo.gl/example" },
        { platform: "x", url: "https://x.com/example" },
        { platform: "youtube", url: "https://youtube.com/@example" },
      ];
      const { container } = render(<RestaurantEditor initial={{ ...initial, socialLinks: sixLinks }} initialMedia={[]} />);
      const social = sectionTitled("Social links");
      const addLink = within(social).getByRole("button", { name: "Add link" });
      expect(addLink).toBeEnabled();
      expect(within(social).queryByText(/Every supported platform already has a link/)).toBeNull();

      await user.click(addLink);

      expect(within(social).getAllByLabelText("Platform").at(-1)).toHaveValue("linkedin");
      expect(addLink).toBeDisabled();
      expect(within(social).getByText(/Every supported platform already has a link/)).toBeVisible();
      expect((await axe.run(container, axeOptions)).violations).toEqual([]);
    });
  });
});
