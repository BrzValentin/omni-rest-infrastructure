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
