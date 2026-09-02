import { moveItem } from "./menu-admin-contract";
import type { PublicationStatus } from "./restaurant-contract";

export type AdminGalleryImage = {
  id: string;
  mediaAssetId: string;
  altText: string;
  caption: string | null;
  displayOrder: number;
  isActive: boolean;
  imageUrl: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  fileSizeBytes: number | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminGallery = {
  images: AdminGalleryImage[];
  maximumImages: number;
  draftVersion: string;
  eTag: string;
  publicationStatus: PublicationStatus | null;
};

export type AdminGalleryMutation = { gallery: AdminGallery; publication: PublicationStatus };

export const galleryAltTextMaxLength = 300;
export const galleryCaptionMaxLength = 300;
/** Fallback for an older snapshot that predates `maximumImages`; the server value always wins. */
export const galleryMaximumImages = 50;

/** The formats the server's media validator accepts, and the `accept` attribute built from them. */
export const galleryImageTypes = ["image/jpeg", "image/png", "image/webp"] as const;
export const galleryImageAccept = galleryImageTypes.join(",");
const acceptedImageTypes = new Set<string>(galleryImageTypes);

/**
 * Mirrors the server's default media size limit (`LocalMediaStorageOptions.MaximumBytes`, 5 MiB).
 * The server stays the authority — a deployment may configure a smaller limit — but rejecting an
 * obviously oversized file here saves the owner a slow upload that was always going to be refused.
 */
export const galleryMaximumFileSizeBytes = 5 * 1024 * 1024;

/**
 * Explains, in the owner's words, why a chosen file cannot be uploaded — or null when it can.
 *
 * The file picker and the drop zone both go through this, so dragging a photo in is held to exactly
 * the same rules as choosing one, and the wording matches what the server would have said.
 */
export function describeUnusablePhoto(file: File): string | null {
  if (!acceptedImageTypes.has(file.type)) return "Choose a JPG, PNG, or WebP photo.";
  if (file.size > galleryMaximumFileSizeBytes) return "Choose a photo smaller than 5 MB.";
  return null;
}

/**
 * Moves one photo within the gallery and returns the resulting id order.
 * Shares the menu reorder helper so both surfaces stage identical payloads.
 */
export const moveGalleryImage = moveItem;

export const galleryErrorMessages: Record<string, string> = {
  field_required: "This field is required.",
  value_too_long: "Use a shorter value.",
  media_form_required: "The image could not be read. Choose the file again.",
  media_size_invalid: "Choose an image within the allowed file size.",
  media_content_invalid: "The image must be a valid JPG, PNG, or WebP within the allowed dimensions.",
  gallery_reorder_incomplete: "The new order must include every photo exactly once.",
};

export const galleryProblemMessages: Record<string, string> = {
  gallery_limit_reached: "This gallery is full. Delete a photo before uploading another.",
  gallery_image_not_found: "That photo no longer exists. Reload to see the current gallery.",
  concurrency_conflict:
    "The gallery changed elsewhere. Your entries are preserved; reload when you are ready to reapply them.",
  data_conflict: "The change conflicts with the current gallery. Reload and try again.",
  csrf_invalid: "Your session needs refreshing. Reload the page and try again.",
};
