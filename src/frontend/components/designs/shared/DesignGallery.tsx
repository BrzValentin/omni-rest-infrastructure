"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type TouchEvent } from "react";
import { createPortal } from "react-dom";

import type { GalleryPhoto } from "@/lib/restaurant-contract";

export type DesignGalleryClasses = Readonly<{
  gallerySection: string;
  galleryHeading: string;
  galleryGrid: string;
  galleryItem: string;
  galleryThumbButton: string;
  galleryFrame: string;
  galleryImage: string;
  gallerySkeleton: string;
  galleryFallback: string;
  galleryEmpty: string;
  lightboxBackdrop: string;
  lightbox: string;
  lightboxFigure: string;
  lightboxImage: string;
  lightboxCaption: string;
  lightboxNav: string;
  lightboxNavButton: string;
  lightboxClose: string;
  lightboxCounter: string;
}>;

type DesignGalleryProps = Readonly<{
  photos: readonly GalleryPhoto[];
  classes: DesignGalleryClasses;
  headingId: string;
  restaurantName: string;
}>;

const eagerTileCount = 4;
const swipeThresholdPixels = 40;

function counterLabel(index: number, total: number) {
  return `Photo ${index + 1} of ${total}`;
}

export function DesignGallery({ photos, classes, headingId, restaurantName }: DesignGalleryProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [failed, setFailed] = useState<Readonly<Record<string, true>>>({});
  const [loaded, setLoaded] = useState<Readonly<Record<string, true>>>({});
  const reported = useRef(new Set<string>());

  const reportFailure = useCallback((photo: GalleryPhoto, kind: string) => {
    setFailed((current) => (current[photo.id] ? current : { ...current, [photo.id]: true }));
    if (reported.current.has(photo.id)) return;
    reported.current.add(photo.id);
    console.warn(`Gallery ${kind} failed to load for photo ${photo.id}.`);
  }, []);

  const markLoaded = useCallback((photo: GalleryPhoto) => {
    setLoaded((current) => (current[photo.id] ? current : { ...current, [photo.id]: true }));
  }, []);

  return (
    <section className={classes.gallerySection} aria-labelledby={headingId}>
      <h2 className={classes.galleryHeading} id={headingId}>Gallery</h2>
      {photos.length === 0 ? (
        <p className={classes.galleryEmpty}>No photos available.</p>
      ) : (
        <ul className={classes.galleryGrid} aria-label={`${restaurantName} photos`}>
          {photos.map((photo, index) => (
            <li className={classes.galleryItem} key={photo.id}>
              <button
                className={classes.galleryThumbButton}
                type="button"
                disabled={failed[photo.id] === true}
                data-photo-id={photo.id}
                onClick={() => setOpenIndex(index)}
              >
                <span className={classes.galleryFrame}>
                  {failed[photo.id] ? (
                    <span className={classes.galleryFallback} role="img" aria-label={`${photo.altText}: image unavailable`}>
                      <span aria-hidden="true">◇</span>
                    </span>
                  ) : (
                    <>
                      <Image
                        unoptimized
                        loader={({ src }) => src}
                        className={classes.galleryImage}
                        src={photo.thumbnailUrl}
                        alt={photo.altText}
                        width={photo.thumbnailWidth}
                        height={photo.thumbnailHeight}
                        loading={index < eagerTileCount ? "eager" : "lazy"}
                        onLoad={() => markLoaded(photo)}
                        onError={() => reportFailure(photo, "thumbnail")}
                      />
                      {loaded[photo.id] ? null : (
                        <span className={classes.gallerySkeleton} aria-hidden="true" />
                      )}
                    </>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {openIndex === null ? null : (
        <GalleryLightbox
          classes={classes}
          photos={photos}
          startIndex={openIndex}
          onClose={() => setOpenIndex(null)}
        />
      )}
    </section>
  );
}

function GalleryLightbox({ photos, classes, startIndex, onClose }: Readonly<{
  photos: readonly GalleryPhoto[];
  classes: DesignGalleryClasses;
  startIndex: number;
  onClose: () => void;
}>) {
  const [index, setIndex] = useState(startIndex);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const photo = photos[index];
  const total = photos.length;

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
    closeRef.current?.focus();
    return () => {
      for (const item of background) {
        if (!item.inert) item.element.removeAttribute("inert");
        if (item.ariaHidden === null) item.element.removeAttribute("aria-hidden");
        else item.element.setAttribute("aria-hidden", item.ariaHidden);
      }
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  // Only the immediate neighbours are prefetched, so opening the viewer never pulls the whole gallery.
  useEffect(() => {
    for (const neighbour of [photos[index - 1], photos[index + 1]]) {
      if (!neighbour) continue;
      const preloaded = new window.Image();
      preloaded.src = neighbour.imageUrl;
    }
  }, [index, photos]);

  // Reaching either end disables the nav button that was just used, and the browser blurs a control the moment it
  // becomes disabled. Without this the dialog would lose focus to <body>, so Escape, the arrow keys, and the Tab
  // trap — all bound to the dialog element — would stop responding while the rest of the page is still inert.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const active = document.activeElement;
    const usable = active instanceof HTMLElement
      && dialog.contains(active)
      && !(active instanceof HTMLButtonElement && active.disabled);
    if (usable) return;
    dialog.focus();
  }, [index]);

  function show(next: number) {
    const clamped = Math.min(Math.max(next, 0), total - 1);
    if (clamped === index) return;
    setIndex(clamped);
    setFailed(false);
    setLoaded(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "ArrowRight") { event.preventDefault(); show(index + 1); return; }
    if (event.key === "ArrowLeft") { event.preventDefault(); show(index - 1); return; }
    if (event.key === "Home") { event.preventDefault(); show(0); return; }
    if (event.key === "End") { event.preventDefault(); show(total - 1); return; }
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

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    const touch = event.touches[0];
    touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  }

  function handleTouchEnd(event: TouchEvent<HTMLDivElement>) {
    const start = touchStart.current;
    const touch = event.changedTouches[0];
    touchStart.current = null;
    if (!start || !touch) return;
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    // Vertical scrolling is never hijacked: the horizontal travel has to dominate.
    if (Math.abs(deltaX) < swipeThresholdPixels || Math.abs(deltaY) >= Math.abs(deltaX)) return;
    show(deltaX < 0 ? index + 1 : index - 1);
  }

  return createPortal(
    <div className={classes.lightboxBackdrop}>
      <div
        ref={dialogRef}
        className={classes.lightbox}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-label={counterLabel(index, total)}
        onKeyDown={handleKeyDown}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <button ref={closeRef} className={classes.lightboxClose} type="button" onClick={onClose}>Close</button>
        <figure className={classes.lightboxFigure}>
          {failed ? (
            <div className={classes.galleryFallback} role="img" aria-label={`${photo.altText}: image unavailable`}>
              <span aria-hidden="true">◇</span>
            </div>
          ) : (
            <>
              <Image
                unoptimized
                loader={({ src }) => src}
                className={classes.lightboxImage}
                src={photo.imageUrl}
                alt={photo.altText}
                width={photo.width}
                height={photo.height}
                onLoad={() => setLoaded(true)}
                onError={() => setFailed(true)}
              />
              {loaded ? null : <div className={classes.gallerySkeleton} aria-hidden="true" />}
            </>
          )}
          {photo.caption ? <figcaption className={classes.lightboxCaption}>{photo.caption}</figcaption> : null}
        </figure>
        <p className={classes.lightboxCounter} role="status" aria-live="polite">{counterLabel(index, total)}</p>
        <div className={classes.lightboxNav}>
          <button
            className={classes.lightboxNavButton}
            type="button"
            disabled={index === 0}
            onClick={() => show(index - 1)}
          >
            Previous photo
          </button>
          <button
            className={classes.lightboxNavButton}
            type="button"
            disabled={index === total - 1}
            onClick={() => show(index + 1)}
          >
            Next photo
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
