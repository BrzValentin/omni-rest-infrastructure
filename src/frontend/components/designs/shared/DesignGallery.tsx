"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useCallback, useRef, useState } from "react";

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

/**
 * The viewer is the larger half of the gallery's JavaScript — a portal, a focus trap, inert
 * background bookkeeping, and swipe handling — and it does nothing until a thumbnail is clicked.
 * Splitting it out keeps it off the initial payload; the chunk is fetched on the first open.
 */
const GalleryLightbox = dynamic(() => import("./DesignGalleryLightbox"));

/**
 * Tiles are laid out `repeat(auto-fill, minmax(9rem, 1fr))` (12rem in Sunroom), so a tile is never
 * wider than about half the viewport on a phone and settles near 16rem on a desktop grid. Declaring
 * that lets the optimizer hand a phone a tile-sized rendition instead of the widest stored variant.
 */
const thumbnailSizes = "(max-width: 40rem) 45vw, 16rem";

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
                        className={classes.galleryImage}
                        src={photo.thumbnailUrl}
                        alt={photo.altText}
                        width={photo.thumbnailWidth}
                        height={photo.thumbnailHeight}
                        sizes={thumbnailSizes}
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
