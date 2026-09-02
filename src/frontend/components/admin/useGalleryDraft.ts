"use client";

import { useCallback, useState } from "react";
import { BrowserApiError, mutate, uploadGalleryPhoto } from "@/lib/browser-api";
import {
  galleryErrorMessages,
  galleryProblemMessages,
  moveGalleryImage,
  type AdminGallery,
  type AdminGalleryImage,
  type AdminGalleryMutation,
} from "@/lib/gallery-admin-contract";
import { publishingSentence, sessionExpiredNotice } from "./DraftStatusBar";
import { useUnsavedChanges } from "./useUnsavedChanges";

export type GalleryMutationMethod = "POST" | "PATCH" | "DELETE";

type GalleryRequest = { run: () => Promise<AdminGalleryMutation | null>; label: string };

const savingFailedNotice = "Saving failed. Your entries are still here; try again.";

/**
 * Owns the gallery draft, its ETag, and the shared save/notice/error handling that the gallery
 * management surface needs. Every mutation — upload included — is an aggregate mutation, so the
 * current ETag always travels as `If-Match`.
 */
export function useGalleryDraft(initial: AdminGallery) {
  const [gallery, setGallery] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [dirty, setDirty] = useState(false);
  const [failedRequest, setFailedRequest] = useState<GalleryRequest | null>(null);

  useUnsavedChanges(dirty);

  const run = useCallback(async (
    request: () => Promise<AdminGalleryMutation | null>,
    label: string,
  ): Promise<boolean> => {
    setBusy(label);
    setNotice(null);
    setConflict(false);
    setSessionExpired(false);
    setFieldErrors({});
    setFailedRequest(null);
    try {
      const result = await request();
      if (result) {
        setGallery(result.gallery);
        setNotice(`${label} saved. ${publishingSentence(result.publication.status)}`);
      }
      setDirty(false);
      return true;
    } catch (error) {
      if (!(error instanceof BrowserApiError)) {
        setNotice(savingFailedNotice);
        setFailedRequest({ run: request, label });
        return false;
      }
      // A sign-in that lapsed mid-save is not a failed save the owner can retry into: they have to
      // sign in first, and nothing they typed should be lost while they do.
      if (error.status === 401) {
        setSessionExpired(true);
        setNotice(sessionExpiredNotice);
        return false;
      }
      if (error.status === 400 && error.problem.errors) {
        setFieldErrors(error.problem.errors);
        setNotice("Check the highlighted fields. Your entries are preserved.");
        return false;
      }
      const code = error.problem.code ?? "";
      if (code === "concurrency_conflict") setConflict(true);
      else setFailedRequest({ run: request, label });
      setNotice(galleryProblemMessages[code] ?? savingFailedNotice);
      return false;
    } finally {
      setBusy(null);
    }
  }, []);

  const save = useCallback((
    path: string,
    method: GalleryMutationMethod,
    body: unknown,
    label: string,
  ) => run(() => mutate<AdminGalleryMutation>(path, method, body, gallery.eTag), label), [gallery.eTag, run]);

  const upload = useCallback((
    file: File,
    altText: string,
    caption: string | null,
  ) => run(
    () => uploadGalleryPhoto<AdminGalleryMutation>(file, altText, caption, gallery.eTag),
    "Photo",
  ), [gallery.eTag, run]);

  /**
   * Swaps the picture behind one gallery entry, keeping its alt text, caption, and position.
   *
   * The gallery update endpoint carries alt text, caption, and visibility only — there is no field
   * for a new media asset — so a replacement is an upload, a delete, and a reorder, chained through
   * the ETag each step hands back. The upload goes first so a failure anywhere leaves the owner with
   * the photo they already had; that is also why the caller keeps this off a full gallery, where the
   * upload would be refused by the fifty-photo cap before the old photo had gone.
   */
  const replacePhoto = useCallback((image: AdminGalleryImage, file: File) => run(async () => {
    const position = gallery.images.findIndex((item) => item.id === image.id);
    const uploaded = await uploadGalleryPhoto<AdminGalleryMutation>(
      file, image.altText, image.caption, gallery.eTag);
    const added = uploaded.gallery.images.at(-1);
    const removed = await mutate<AdminGalleryMutation>(
      `/api/v1/admin/gallery/${image.id}`, "DELETE", undefined, uploaded.gallery.eTag);
    if (!removed || !added) return removed ?? uploaded;
    const last = removed.gallery.images.length - 1;
    if (position < 0 || position >= last) return removed;
    const imageIds = moveGalleryImage(removed.gallery.images, last, position);
    const reordered = await mutate<AdminGalleryMutation>(
      "/api/v1/admin/gallery/reorder", "PATCH", { imageIds }, removed.gallery.eTag);
    return reordered ?? removed;
  }, "Photo"), [gallery.eTag, gallery.images, run]);

  const retrySave = useCallback(() => {
    if (!failedRequest) return;
    void run(failedRequest.run, failedRequest.label);
  }, [failedRequest, run]);

  return {
    gallery, setGallery, busy, notice, setNotice, conflict, sessionExpired, fieldErrors, setFieldErrors,
    dirty, setDirty, save, upload, replacePhoto,
    retrySave: failedRequest ? retrySave : null,
  };
}

export function messageForGalleryCodes(codes: string[] | undefined): string | null {
  if (!codes?.length) return null;
  return galleryErrorMessages[codes[0]] ?? "Enter a valid value.";
}
