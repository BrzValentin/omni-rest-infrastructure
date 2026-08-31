"use client";

import { useCallback, useState } from "react";
import { BrowserApiError, mutate, uploadGalleryPhoto } from "@/lib/browser-api";
import {
  galleryErrorMessages,
  galleryProblemMessages,
  type AdminGallery,
  type AdminGalleryMutation,
} from "@/lib/gallery-admin-contract";

export type GalleryMutationMethod = "POST" | "PATCH" | "DELETE";

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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const run = useCallback(async (
    request: () => Promise<AdminGalleryMutation | null>,
    label: string,
  ): Promise<boolean> => {
    setBusy(label);
    setNotice(null);
    setConflict(false);
    setFieldErrors({});
    try {
      const result = await request();
      if (result) {
        setGallery(result.gallery);
        setNotice(`${label} saved. Publishing ${result.publication.status}.`);
      }
      return true;
    } catch (error) {
      if (!(error instanceof BrowserApiError)) {
        setNotice("Saving failed. Your entries are still here; try again.");
        return false;
      }
      if (error.status === 400 && error.problem.errors) {
        setFieldErrors(error.problem.errors);
        setNotice("Check the highlighted fields. Your entries are preserved.");
        return false;
      }
      const code = error.problem.code ?? "";
      if (code === "concurrency_conflict") setConflict(true);
      setNotice(galleryProblemMessages[code] ?? "Saving failed. Your entries are still here; try again.");
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

  return { gallery, setGallery, busy, notice, setNotice, conflict, fieldErrors, setFieldErrors, save, upload };
}

export function messageForGalleryCodes(codes: string[] | undefined): string | null {
  if (!codes?.length) return null;
  return galleryErrorMessages[codes[0]] ?? "Enter a valid value.";
}
