import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";

import { galleryPhotos } from "@/test/fixtures";
import { DesignGallery } from "./shared/DesignGallery";
import { createDesignClassNames } from "./shared/designClassNames";

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const imageProps = { ...props };
    for (const key of ["loader", "unoptimized", "sizes", "priority"]) {
      Reflect.deleteProperty(imageProps, key);
    }
    return React.createElement("img", imageProps);
  },
}));

const classes = createDesignClassNames("quiet-elegance-v1");

function renderGallery(photos = galleryPhotos) {
  return render(
    <DesignGallery
      photos={photos}
      classes={classes}
      headingId="quiet-gallery"
      restaurantName="Prairie Table"
    />,
  );
}

function swipe(dialog: HTMLElement, from: readonly [number, number], to: readonly [number, number]) {
  fireEvent.touchStart(dialog, { touches: [{ clientX: from[0], clientY: from[1] }] });
  fireEvent.touchEnd(dialog, { changedTouches: [{ clientX: to[0], clientY: to[1] }] });
}

// The viewer is a `next/dynamic` chunk (PR-21 Task 3), so it arrives a microtask after the click
// rather than in the same commit. Every assertion below still reads the dialog synchronously; this
// is the one place that has to wait for the module.
async function openFirstPhoto() {
  const user = userEvent.setup();
  const trigger = screen.getByRole("button", { name: galleryPhotos[0].altText });
  await user.click(trigger);
  await screen.findByRole("dialog");
  return { user, trigger };
}

describe("DesignGallery", () => {
  it("renders each photo as a thumbnail and never references the full-size image", () => {
    const { container } = renderGallery();

    expect(screen.getByRole("heading", { level: 2, name: "Gallery" })).toHaveAttribute("id", "quiet-gallery");
    const thumbnails = screen.getAllByRole("img");
    expect(thumbnails.map((image) => image.getAttribute("src")))
      .toEqual(galleryPhotos.map((photo) => photo.thumbnailUrl));
    for (const photo of galleryPhotos) {
      expect(container.innerHTML).not.toContain(photo.imageUrl);
    }
    expect(screen.getAllByRole("listitem")).toHaveLength(galleryPhotos.length);
  });

  it("loads the first four tiles eagerly and lazily thereafter", () => {
    renderGallery([...galleryPhotos, { ...galleryPhotos[0], id: "photo-5" }, { ...galleryPhotos[1], id: "photo-6" }]);

    const thumbnails = screen.getAllByRole("img");
    expect(thumbnails.slice(0, 4).map((image) => image.getAttribute("loading")))
      .toEqual(["eager", "eager", "eager", "eager"]);
    expect(thumbnails[4]).toHaveAttribute("loading", "lazy");
  });

  it("renders the empty copy when the gallery has no photos", () => {
    renderGallery([]);
    expect(screen.getByText("No photos available.")).toBeVisible();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("opens the viewer on a thumbnail with the full-size image, caption, and counter", async () => {
    renderGallery();
    await openFirstPhoto();

    const dialog = screen.getByRole("dialog", { name: "Photo 1 of 3" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(within(dialog).getByRole("img", { name: galleryPhotos[0].altText }))
      .toHaveAttribute("src", galleryPhotos[0].imageUrl);
    expect(within(dialog).getByText(galleryPhotos[0].caption!)).toBeVisible();
    expect(within(dialog).getByRole("status")).toHaveTextContent("Photo 1 of 3");
    expect(within(dialog).getByRole("button", { name: "Close" })).toHaveFocus();
  });

  it("navigates with the arrow, Home, and End keys and clamps at both ends", async () => {
    renderGallery();
    const { user } = await openFirstPhoto();

    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("dialog", { name: "Photo 1 of 3" })).toBeInTheDocument();

    await user.keyboard("{ArrowRight}");
    const second = screen.getByRole("dialog", { name: "Photo 2 of 3" });
    expect(within(second).getByRole("img", { name: galleryPhotos[1].altText }))
      .toHaveAttribute("src", galleryPhotos[1].imageUrl);

    await user.keyboard("{End}");
    expect(screen.getByRole("dialog", { name: "Photo 3 of 3" })).toBeInTheDocument();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("dialog", { name: "Photo 3 of 3" })).toBeInTheDocument();

    await user.keyboard("{Home}");
    expect(screen.getByRole("dialog", { name: "Photo 1 of 3" })).toBeInTheDocument();
  });

  it("disables Previous on the first photo and Next on the last", async () => {
    renderGallery();
    const { user } = await openFirstPhoto();

    expect(screen.getByRole("button", { name: "Previous photo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next photo" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Next photo" }));
    await user.click(screen.getByRole("button", { name: "Next photo" }));

    expect(screen.getByRole("dialog", { name: "Photo 3 of 3" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next photo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous photo" })).toBeEnabled();
  });

  it("keeps the viewer keyboard-operable after Next disables on the last photo", async () => {
    renderGallery();
    const { user, trigger } = await openFirstPhoto();

    await user.click(screen.getByRole("button", { name: "Next photo" }));
    await user.click(screen.getByRole("button", { name: "Next photo" }));

    const dialog = screen.getByRole("dialog", { name: "Photo 3 of 3" });
    expect(screen.getByRole("button", { name: "Next photo" })).toBeDisabled();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    expect(document.activeElement).not.toBeDisabled();

    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("dialog", { name: "Photo 2 of 3" })).toBeInTheDocument();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("dialog", { name: "Photo 3 of 3" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("keeps Tab trapped after Next disables on the last photo", async () => {
    renderGallery();
    const { user } = await openFirstPhoto();

    await user.click(screen.getByRole("button", { name: "Next photo" }));
    await user.click(screen.getByRole("button", { name: "Next photo" }));
    const dialog = screen.getByRole("dialog", { name: "Photo 3 of 3" });

    await user.tab();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();

    await user.tab();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    expect(screen.getByRole("button", { name: "Previous photo" })).toHaveFocus();

    await user.tab();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
  });

  it("keeps the viewer keyboard-operable after Previous disables on the first photo", async () => {
    renderGallery();
    const { user, trigger } = await openFirstPhoto();

    await user.click(screen.getByRole("button", { name: "Next photo" }));
    await user.click(screen.getByRole("button", { name: "Previous photo" }));

    const dialog = screen.getByRole("dialog", { name: "Photo 1 of 3" });
    expect(screen.getByRole("button", { name: "Previous photo" })).toBeDisabled();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    expect(document.activeElement).not.toBeDisabled();

    await user.tab();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();

    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("dialog", { name: "Photo 2 of 3" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("closes on Escape and returns focus to the thumbnail that opened it", async () => {
    renderGallery();
    const { user, trigger } = await openFirstPhoto();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("traps Tab inside the viewer", async () => {
    renderGallery();
    const { user } = await openFirstPhoto();
    const dialog = screen.getByRole("dialog");

    await user.tab();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    expect(screen.getByRole("button", { name: "Next photo" })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();

    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Next photo" })).toHaveFocus();
  });

  it("navigates on a horizontal swipe and ignores short, vertical, or incomplete ones", async () => {
    renderGallery();
    await openFirstPhoto();
    const dialog = screen.getByRole("dialog");

    swipe(dialog, [200, 100], [100, 110]);
    expect(screen.getByRole("dialog", { name: "Photo 2 of 3" })).toBeInTheDocument();

    swipe(dialog, [100, 100], [200, 110]);
    expect(screen.getByRole("dialog", { name: "Photo 1 of 3" })).toBeInTheDocument();

    swipe(dialog, [100, 100], [200, 110]);
    expect(screen.getByRole("dialog", { name: "Photo 1 of 3" })).toBeInTheDocument();

    swipe(dialog, [200, 100], [180, 100]);
    expect(screen.getByRole("dialog", { name: "Photo 1 of 3" })).toBeInTheDocument();

    swipe(dialog, [200, 100], [100, 400]);
    expect(screen.getByRole("dialog", { name: "Photo 1 of 3" })).toBeInTheDocument();

    fireEvent.touchStart(dialog, { touches: [] });
    fireEvent.touchEnd(dialog, { changedTouches: [{ clientX: 40, clientY: 100 }] });
    expect(screen.getByRole("dialog", { name: "Photo 1 of 3" })).toBeInTheDocument();

    fireEvent.touchStart(dialog, { touches: [{ clientX: 200, clientY: 100 }] });
    fireEvent.touchEnd(dialog, { changedTouches: [] });
    expect(screen.getByRole("dialog", { name: "Photo 1 of 3" })).toBeInTheDocument();
  });

  it("drops the tile skeleton once the thumbnail loads", () => {
    const { container } = renderGallery();
    expect(container.querySelectorAll(`.${classes.gallerySkeleton}`)).toHaveLength(galleryPhotos.length);

    fireEvent.load(screen.getByRole("img", { name: galleryPhotos[0].altText }));
    expect(container.querySelectorAll(`.${classes.gallerySkeleton}`)).toHaveLength(galleryPhotos.length - 1);

    fireEvent.load(screen.getByRole("img", { name: galleryPhotos[0].altText }));
    expect(container.querySelectorAll(`.${classes.gallerySkeleton}`)).toHaveLength(galleryPhotos.length - 1);
  });

  it("shows the viewer skeleton until the full-size image loads and the placeholder when it fails", async () => {
    renderGallery();
    await openFirstPhoto();
    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelectorAll(`.${classes.gallerySkeleton}`)).toHaveLength(1);

    fireEvent.load(within(dialog).getByRole("img", { name: galleryPhotos[0].altText }));
    expect(dialog.querySelectorAll(`.${classes.gallerySkeleton}`)).toHaveLength(0);

    fireEvent.error(within(dialog).getByRole("img", { name: galleryPhotos[0].altText }));
    expect(within(dialog).getByRole("img", { name: `${galleryPhotos[0].altText}: image unavailable` })).toBeVisible();
    expect(within(dialog).queryByRole("img", { name: galleryPhotos[0].altText })).toBeNull();
  });

  it("replaces a broken thumbnail with a labelled placeholder and keeps the rest usable", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    renderGallery();

    fireEvent.error(screen.getByRole("img", { name: galleryPhotos[0].altText }));

    expect(screen.getByRole("img", { name: `${galleryPhotos[0].altText}: image unavailable` })).toBeVisible();
    expect(screen.queryByRole("img", { name: galleryPhotos[0].altText })).toBeNull();
    expect(screen.getByRole("img", { name: galleryPhotos[1].altText })).toBeVisible();
    expect(screen.getAllByRole("listitem")).toHaveLength(galleryPhotos.length);
    expect(warn).toHaveBeenCalledTimes(1);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: galleryPhotos[1].altText }));
    expect(await screen.findByRole("dialog", { name: "Photo 2 of 3" })).toBeInTheDocument();
  });

  it("keeps the viewer out of the initial render until a thumbnail is opened", async () => {
    const { container } = renderGallery();

    // The lazily loaded chunk must not be pulled in just because the gallery rendered.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(container.querySelector(`.${classes.lightboxBackdrop}`)).toBeNull();

    await openFirstPhoto();
    expect(screen.getByRole("dialog", { name: "Photo 1 of 3" })).toBeInTheDocument();
  });

  it("has no accessibility violations with the viewer closed or open", async () => {
    const { container } = renderGallery();
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);

    await openFirstPhoto();
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    expect((await axe.run(screen.getByRole("dialog"), { rules: { "color-contrast": { enabled: false } } })).violations)
      .toEqual([]);
  });
});
