import React from "react";
import { createEvent, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserApiError } from "@/lib/browser-api";
import type { AdminGallery, AdminGalleryImage, AdminGalleryMutation } from "@/lib/gallery-admin-contract";
import { GalleryManager } from "./GalleryManager";

const mocks = vi.hoisted(() => ({ mutate: vi.fn(), uploadGalleryPhoto: vi.fn() }));
vi.mock("@/lib/browser-api", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/browser-api")>(),
  mutate: mocks.mutate,
  uploadGalleryPhoto: mocks.uploadGalleryPhoto,
}));
vi.mock("next/image", () => ({ default: (props: Record<string, unknown>) => {
  const imageProps = { ...props };
  Reflect.deleteProperty(imageProps, "loader");
  Reflect.deleteProperty(imageProps, "unoptimized");
  return React.createElement("img", imageProps);
} }));

function image(id: string, altText: string, displayOrder: number, overrides: Partial<AdminGalleryImage> = {}): AdminGalleryImage {
  return {
    id,
    mediaAssetId: `asset-${id}`,
    altText,
    caption: null,
    displayOrder,
    isActive: true,
    imageUrl: `/media/gallery/${id}.webp`,
    thumbnailUrl: `/media/gallery/${id}-thumb.webp`,
    width: 1600,
    height: 1067,
    fileSizeBytes: 240_000,
    createdAt: "2026-08-01T12:00:00Z",
    updatedAt: "2026-08-01T12:00:00Z",
    ...overrides,
  };
}

const initial: AdminGallery = {
  images: [
    image("a", "Sunny patio seating", 1, { caption: "Patio seating opens in May." }),
    image("b", "Chef plating at the counter", 2),
    image("c", "Dining room at dusk", 3, { isActive: false }),
  ],
  maximumImages: 50,
  draftVersion: "4",
  eTag: '"draft-4"',
  publicationStatus: {
    operationId: "op", status: "succeeded", draftVersion: "4", attemptCount: 1, errorCode: null,
    updatedAt: "2026-08-01T12:00:00Z",
  },
};

function mutationWith(images: AdminGalleryImage[]): AdminGalleryMutation {
  return {
    gallery: { ...initial, images, draftVersion: "5", eTag: '"draft-5"' },
    publication: {
      operationId: "op2", status: "succeeded", draftVersion: "5", attemptCount: 1, errorCode: null,
      updatedAt: "2026-08-01T12:05:00Z",
    },
  };
}

function photoFile(name = "patio.png") {
  return new File(["binary"], name, { type: "image/png" });
}

describe("GalleryManager", () => {
  beforeEach(() => {
    mocks.mutate.mockReset().mockResolvedValue(mutationWith(initial.images));
    mocks.uploadGalleryPhoto.mockReset().mockResolvedValue(mutationWith(initial.images));
  });

  it("lists photos with thumbnails, order, and visibility, and stays accessible", async () => {
    const { container } = render(<GalleryManager initial={initial} />);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(within(items[0]).getByRole("img", { name: "Sunny patio seating" }))
      .toHaveAttribute("src", "/media/gallery/a-thumb.webp");
    expect(within(items[0]).getByText("Patio seating opens in May.")).toBeVisible();
    expect(within(items[2]).getByText("Hidden")).toBeVisible();
    expect(screen.getByText("3 of 50 photos used")).toBeVisible();

    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(results.violations).toEqual([]);
  });

  it("declares thumbnail dimensions from the original aspect ratio, not the original's size", () => {
    render(<GalleryManager initial={{
      ...initial,
      images: [
        image("a", "Sunny patio seating", 1),
        image("d", "Tall doorway", 2, { width: 900, height: 1600 }),
        image("e", "Unknown size", 3, { width: 0, height: 0 }),
      ],
    }} />);

    const [landscape, portrait, unknown] = screen.getAllByRole("img");
    expect(landscape).toHaveAttribute("width", "64");
    expect(landscape).toHaveAttribute("height", "43");
    expect(portrait).toHaveAttribute("width", "36");
    expect(portrait).toHaveAttribute("height", "64");
    expect(unknown).toHaveAttribute("width", "64");
    expect(unknown).toHaveAttribute("height", "64");
  });

  it("keeps upload disabled until a file and alt text are both present", async () => {
    const user = userEvent.setup();
    render(<GalleryManager initial={initial} />);

    const submit = screen.getByRole("button", { name: "Upload photo" });
    expect(submit).toBeDisabled();

    await user.upload(screen.getByLabelText("Photo file"), photoFile());
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText("Alt text"), "Patio");
    expect(submit).toBeEnabled();
  });

  it("uploads a photo with its alt text, caption, and the current ETag", async () => {
    const user = userEvent.setup();
    const file = photoFile();
    render(<GalleryManager initial={initial} />);

    await user.upload(screen.getByLabelText("Photo file"), file);
    await user.type(screen.getByLabelText("Alt text"), "Front window in winter");
    await user.type(screen.getByLabelText("Caption"), "Snow on the sill");
    await user.click(screen.getByRole("button", { name: "Upload photo" }));

    await waitFor(() => expect(mocks.uploadGalleryPhoto).toHaveBeenCalledWith(
      file, "Front window in winter", "Snow on the sill", '"draft-4"'));
    expect(screen.getByLabelText("Alt text")).toHaveValue("");
    expect(screen.getByText(/Photo saved\. Your website is up to date\./)).toBeVisible();
  });

  it("sends a null caption when the caption field is left blank", async () => {
    const user = userEvent.setup();
    const file = photoFile();
    render(<GalleryManager initial={initial} />);

    await user.upload(screen.getByLabelText("Photo file"), file);
    await user.type(screen.getByLabelText("Alt text"), "Front window");
    await user.click(screen.getByRole("button", { name: "Upload photo" }));

    await waitFor(() => expect(mocks.uploadGalleryPhoto).toHaveBeenCalledWith(file, "Front window", null, '"draft-4"'));
  });

  it("edits the alt text and caption of an existing photo", async () => {
    const user = userEvent.setup();
    render(<GalleryManager initial={initial} />);

    await user.click(screen.getByRole("button", { name: "Edit Chef plating at the counter" }));
    const altField = screen.getByLabelText("Photo alt text");
    await user.clear(altField);
    await user.type(altField, "Chef plating a dish");
    await user.type(screen.getByLabelText("Photo caption"), "Service begins at five");
    await user.click(screen.getByRole("button", { name: "Save photo" }));

    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith(
      "/api/v1/admin/gallery/b",
      "PATCH",
      { altText: "Chef plating a dish", caption: "Service begins at five", isActive: true },
      '"draft-4"',
    ));
    expect(screen.queryByLabelText("Photo alt text")).toBeNull();
  });

  it("toggles a photo between shown and hidden", async () => {
    const user = userEvent.setup();
    render(<GalleryManager initial={initial} />);

    await user.click(screen.getByRole("button", { name: "Hide Sunny patio seating" }));

    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith(
      "/api/v1/admin/gallery/a",
      "PATCH",
      { altText: "Sunny patio seating", caption: "Patio seating opens in May.", isActive: false },
      '"draft-4"',
    ));

    // The refreshed ETag from the first response is what the next mutation must carry.
    mocks.mutate.mockClear();
    await user.click(screen.getByRole("button", { name: "Show Dining room at dusk" }));
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith(
      "/api/v1/admin/gallery/c",
      "PATCH",
      { altText: "Dining room at dusk", caption: null, isActive: true },
      '"draft-5"',
    ));
  });

  it("reorders with the move buttons and announces the new position", async () => {
    const user = userEvent.setup();
    render(<GalleryManager initial={initial} />);

    await user.click(screen.getByRole("button", { name: "Move Dining room at dusk up" }));

    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith(
      "/api/v1/admin/gallery/reorder", "PATCH", { imageIds: ["a", "c", "b"] }, '"draft-4"'));
    expect(await screen.findByText(/Dining room at dusk moved to position 2 of 3/)).toBeVisible();
  });

  it("disables the move buttons at the ends of the gallery", () => {
    render(<GalleryManager initial={initial} />);
    expect(screen.getByRole("button", { name: "Move Sunny patio seating up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Dining room at dusk down" })).toBeDisabled();
  });

  it("confirms before deleting and reports a photo that has already gone", async () => {
    const user = userEvent.setup();
    mocks.mutate.mockRejectedValue(new BrowserApiError(404, { code: "gallery_image_not_found" }));
    render(<GalleryManager initial={initial} />);

    await user.click(screen.getByRole("button", { name: "Delete Sunny patio seating" }));
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText(/Delete “Sunny patio seating”\?/)).toBeVisible();

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(mocks.mutate).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Delete Sunny patio seating" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Confirm delete" }));

    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith(
      "/api/v1/admin/gallery/a", "DELETE", undefined, '"draft-4"'));
    expect(await screen.findByText(/That photo no longer exists/)).toBeVisible();
  });

  it("shows field validation errors from the upload and preserves typed values", async () => {
    const user = userEvent.setup();
    mocks.uploadGalleryPhoto.mockRejectedValue(new BrowserApiError(400, {
      code: "admin_validation", errors: { file: ["media_content_invalid"] },
    }));
    render(<GalleryManager initial={initial} />);

    await user.upload(screen.getByLabelText("Photo file"), photoFile("patio.gif"));
    await user.type(screen.getByLabelText("Alt text"), "Patio");
    await user.click(screen.getByRole("button", { name: "Upload photo" }));

    expect(await screen.findByText(/must be a valid JPG, PNG, or WebP/)).toBeVisible();
    expect(screen.getByLabelText("Alt text")).toHaveValue("Patio");
    expect(screen.getByLabelText(/^Photo file/)).toHaveAttribute("aria-invalid", "true");
  });

  it("offers a reload path when the draft changed elsewhere", async () => {
    const user = userEvent.setup();
    mocks.mutate.mockRejectedValue(new BrowserApiError(409, { code: "concurrency_conflict" }));
    render(<GalleryManager initial={initial} />);

    await user.click(screen.getByRole("button", { name: "Move Chef plating at the counter up" }));

    expect(await screen.findByText(/The gallery changed elsewhere/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Reload latest" })).toBeVisible();
  });

  it("blocks uploading once the gallery holds the maximum number of photos", () => {
    const full = Array.from({ length: 50 }, (_, index) => image(`p${index}`, `Photo ${index + 1}`, index + 1));
    render(<GalleryManager initial={{ ...initial, images: full }} />);

    expect(screen.getByText("50 of 50 photos used")).toBeVisible();
    expect(screen.getByText(/This gallery is full/)).toBeVisible();
    expect(screen.getByLabelText("Photo file")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Upload photo" })).toBeDisabled();
  });

  it("explains an empty gallery instead of showing an empty list", () => {
    render(<GalleryManager initial={{ ...initial, images: [] }} />);
    expect(screen.getByText(/No photos yet/)).toBeVisible();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("takes a photo dropped onto the upload form and uploads it like a chosen one", async () => {
    const user = userEvent.setup();
    render(<GalleryManager initial={initial} />);

    const zone = screen.getByRole("group", { name: "Photo upload area" });
    fireEvent.drop(zone, { dataTransfer: { files: [photoFile("front-window.png")] } });

    expect(await screen.findByText("Ready to upload: front-window.png")).toBeVisible();
    await user.type(screen.getByLabelText("Alt text"), "Front window in winter");
    await user.click(screen.getByRole("button", { name: "Upload photo" }));

    await waitFor(() => expect(mocks.uploadGalleryPhoto).toHaveBeenCalledWith(
      expect.any(File), "Front window in winter", null, '"draft-4"'));
  });

  it("holds a dropped file to the same rules as the file picker", () => {
    render(<GalleryManager initial={initial} />);
    const zone = screen.getByRole("group", { name: "Photo upload area" });

    fireEvent.drop(zone, { dataTransfer: { files: [new File(["x"], "menu.pdf", { type: "application/pdf" })] } });
    expect(screen.getByText("Choose a JPG, PNG, or WebP photo.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Upload photo" })).toBeDisabled();

    const huge = new File([new Uint8Array(6 * 1024 * 1024)], "huge.png", { type: "image/png" });
    fireEvent.drop(zone, { dataTransfer: { files: [huge] } });
    expect(screen.getByText("Choose a photo smaller than 5 MB.")).toBeVisible();
    expect(mocks.uploadGalleryPhoto).not.toHaveBeenCalled();
  });

  it("replaces the picture behind a photo, keeping its words and its position", async () => {
    const user = userEvent.setup();
    const replacement = image("d", "Sunny patio seating", 4, { caption: "Patio seating opens in May." });
    mocks.uploadGalleryPhoto.mockResolvedValue(mutationWith([...initial.images, replacement]));
    mocks.mutate.mockResolvedValue(mutationWith([initial.images[1], initial.images[2], replacement]));
    render(<GalleryManager initial={initial} />);

    await user.upload(screen.getByLabelText("Replace Sunny patio seating"), photoFile("new-patio.png"));

    // The alt text and caption travel with the replacement, so nothing the owner wrote is retyped.
    await waitFor(() => expect(mocks.uploadGalleryPhoto).toHaveBeenCalledWith(
      expect.any(File), "Sunny patio seating", "Patio seating opens in May.", '"draft-4"'));
    expect(mocks.mutate).toHaveBeenNthCalledWith(
      1, "/api/v1/admin/gallery/a", "DELETE", undefined, '"draft-5"');
    // ...and the new photo is moved back to where the old one sat, rather than landing at the end.
    await waitFor(() => expect(mocks.mutate).toHaveBeenNthCalledWith(
      2, "/api/v1/admin/gallery/reorder", "PATCH", { imageIds: ["d", "b", "c"] }, '"draft-5"'));
    expect(await screen.findByText(/Photo replaced for “Sunny patio seating”/)).toBeVisible();
  });

  it("refuses an unusable replacement without touching the photo already there", async () => {
    const user = userEvent.setup();
    render(<GalleryManager initial={initial} />);

    await user.upload(
      screen.getByLabelText("Replace Sunny patio seating"),
      new File([new Uint8Array(6 * 1024 * 1024)], "huge.png", { type: "image/png" }),
    );

    expect(await screen.findByText("Choose a photo smaller than 5 MB.")).toBeVisible();
    expect(mocks.uploadGalleryPhoto).not.toHaveBeenCalled();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it("cannot replace on a full gallery, because replacing needs a free slot first", () => {
    const full = Array.from({ length: 50 }, (_, index) => image(`p${index}`, `Photo ${index + 1}`, index + 1));
    render(<GalleryManager initial={{ ...initial, images: full }} />);
    expect(screen.getByLabelText("Replace Photo 1")).toBeDisabled();
  });

  it("sends the owner back to sign in when the session ends mid-upload", async () => {
    const user = userEvent.setup();
    mocks.uploadGalleryPhoto.mockRejectedValue(new BrowserApiError(401, { code: "unauthorized" }));
    render(<GalleryManager initial={initial} />);

    await user.upload(screen.getByLabelText("Photo file"), photoFile());
    await user.type(screen.getByLabelText("Alt text"), "Front window");
    await user.click(screen.getByRole("button", { name: "Upload photo" }));

    expect(await screen.findByText(/Your session ended/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Sign in again" }))
      .toHaveAttribute("href", "/admin/login?returnPath=%2Fadmin");
    expect(screen.getByLabelText("Alt text")).toHaveValue("Front window");
  });

  it("re-issues a failed upload from a Try again button", async () => {
    const user = userEvent.setup();
    mocks.uploadGalleryPhoto.mockRejectedValueOnce(new BrowserApiError(503, { code: "unexpected_error" }));
    render(<GalleryManager initial={initial} />);

    await user.upload(screen.getByLabelText("Photo file"), photoFile());
    await user.type(screen.getByLabelText("Alt text"), "Front window");
    await user.click(screen.getByRole("button", { name: "Upload photo" }));

    expect(await screen.findByText(/Saving failed/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(mocks.uploadGalleryPhoto).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("warns before the browser walks away from a photo that was never uploaded", async () => {
    const user = userEvent.setup();
    render(<GalleryManager initial={initial} />);

    await user.type(screen.getByLabelText("Alt text"), "Front window");

    const leaving = createEvent("beforeunload", window, { cancelable: true });
    fireEvent(window, leaving);
    expect(leaving.defaultPrevented).toBe(true);
  });

  it("keeps the status bar free of draft version numbers and publication states", () => {
    render(<GalleryManager initial={initial} />);
    expect(screen.queryByText(/Draft 4/)).toBeNull();
    expect(screen.getByText("Last saved")).toBeVisible();
    expect(screen.getByText("Website up to date")).toBeVisible();
  });
});
