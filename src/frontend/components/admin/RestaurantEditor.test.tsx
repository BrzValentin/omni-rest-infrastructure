import React from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
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
    const user = userEvent.setup();
    const { container } = render(<RestaurantEditor initial={initial} initialMedia={[initial.mainImage!]} />);

    for (const [label, value] of [
      ["Name", "New Prairie Table"], ["Description", "Updated seasonal"], ["Phone display", "204-555-0123"],
      ["Email", "new@example.test"], ["Time zone", "America/Regina"], ["Address line 1", "2 Main"],
      ["Address line 2", "Suite 1"], ["City", "Brandon"], ["Province or state", "SK"], ["Postal code", "R7A 0A1"], ["Country code", "US"],
    ]) {
      const field = screen.getByLabelText(label);
      await user.clear(field);
      await user.type(field, value);
    }
    await user.clear(screen.getByLabelText("Phone (E.164)"));
    await user.type(screen.getByLabelText("Phone (E.164)"), "2045550123");
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    expect(screen.getByText(/Phone must be E\.164/)).toBeVisible();
    await user.clear(screen.getByLabelText("Phone (E.164)"));
    await user.type(screen.getByLabelText("Phone (E.164)"), "+12045550123");
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith("/api/v1/admin/restaurant/profile", "PUT", expect.any(Object), '"draft-3"'));

    await user.click(screen.getByRole("button", { name: "Copy Monday to weekdays" }));
    await user.click(screen.getAllByRole("button", { name: "Add period" })[0]);
    const sunday = screen.getByRole("group", { name: "Sunday" });
    await user.clear(within(sunday).getByLabelText("Opens")); await user.type(within(sunday).getByLabelText("Opens"), "18:00");
    await user.clear(within(sunday).getByLabelText("Closes")); await user.type(within(sunday).getByLabelText("Closes"), "02:00");
    await user.click(within(sunday).getByRole("button", { name: "Remove Sunday period 1" }));
    await user.click(screen.getByRole("button", { name: "Save regular hours" }));
    expect(mocks.mutate).toHaveBeenCalledWith("/api/v1/admin/restaurant/regular-hours", "PUT", expect.any(Object), '"draft-3"');

    await user.type(screen.getByLabelText("Date"), "2026-12-31");
    const specialSection = screen.getByRole("heading", { name: "Special hours" }).parentElement!;
    await user.click(within(specialSection).getByLabelText("Closed all day"));
    await user.click(within(specialSection).getByLabelText("Closed all day"));
    await user.clear(within(specialSection).getByLabelText("Opens")); await user.type(within(specialSection).getByLabelText("Opens"), "20:00");
    await user.clear(within(specialSection).getByLabelText("Closes")); await user.type(within(specialSection).getByLabelText("Closes"), "01:00");
    await user.type(within(specialSection).getByLabelText("Note"), "New Year");
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
    await user.clear(within(socialSection).getByLabelText("Platform")); await user.type(within(socialSection).getByLabelText("Platform"), "facebook");
    await user.clear(within(socialSection).getByLabelText("URL")); await user.type(within(socialSection).getByLabelText("URL"), "https://facebook.com/example");
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
  });

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

  it("adopts a new pending publication prop and polls it to completion", async () => {
    vi.useFakeTimers();
    const pending = { ...initial.publicationStatus!, operationId: "new-operation", status: "pending", errorCode: null, updatedAt: "2026-07-31T13:00:00Z" };
    const succeeded = { ...pending, status: "succeeded", updatedAt: "2026-07-31T13:00:01Z" };
    mocks.browserGet.mockResolvedValue(succeeded);
    const { rerender } = render(<PublicationPanel status={initial.publicationStatus} />);
    expect(screen.getByRole("button", { name: "Retry publication" })).toBeVisible();
    rerender(<PublicationPanel status={pending} />);
    expect(screen.queryByRole("button", { name: "Retry publication" })).not.toBeInTheDocument();
    expect(screen.getByText("pending", { selector: "strong" })).toBeVisible();
    await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
    expect(mocks.browserGet).toHaveBeenCalledWith("/api/v1/admin/publication-status/new-operation");
    expect(screen.getByText("succeeded", { selector: "strong" })).toBeVisible();
    vi.useRealTimers();
  });
});
