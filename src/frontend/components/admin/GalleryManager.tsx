"use client";

import Image from "next/image";
import { useRef, useState, type DragEvent, type FormEvent } from "react";

import {
  describeUnusablePhoto,
  galleryAltTextMaxLength,
  galleryCaptionMaxLength,
  galleryImageAccept,
  moveGalleryImage,
  type AdminGallery,
  type AdminGalleryImage,
} from "@/lib/gallery-admin-contract";
import { ConfirmDialog } from "./ConfirmDialog";
import { DraftStatusBar } from "./DraftStatusBar";
import { fieldErrorHelpers } from "./FieldError";
import { messageForGalleryCodes, useGalleryDraft } from "./useGalleryDraft";
import styles from "@/app/admin/admin.module.css";

/** `.dishThumbnail` renders the admin thumbnail inside a 4rem box. */
const thumbnailFrameSizePixels = 64;

/**
 * `AdminGalleryImage.width`/`height` describe the ORIGINAL variant, so declaring them on the thumbnail would
 * reserve a box several times too large before the image loads. The admin contract carries no thumbnail
 * dimensions, so the aspect ratio is kept and scaled down to the frame the thumbnail actually renders in.
 */
function thumbnailBox(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { width: thumbnailFrameSizePixels, height: thumbnailFrameSizePixels };
  }
  const scale = thumbnailFrameSizePixels / Math.max(width, height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function GalleryManager({ initial }: { initial: AdminGallery }) {
  const {
    gallery, busy, notice, setNotice, conflict, sessionExpired, fieldErrors, setDirty,
    save, upload, replacePhoto, retrySave,
  } = useGalleryDraft(initial);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadAltText, setUploadAltText] = useState("");
  const [uploadCaption, setUploadCaption] = useState("");
  const [fileProblem, setFileProblem] = useState<string | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAltText, setEditAltText] = useState("");
  const [editCaption, setEditCaption] = useState("");
  const [pendingDelete, setPendingDelete] = useState<AdminGalleryImage | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const images = gallery.images;
  const maximum = gallery.maximumImages;
  const atLimit = images.length >= maximum;
  const disabled = busy !== null;
  const { errorFor, fieldA11y } = fieldErrorHelpers(fieldErrors, "gallery-error", messageForGalleryCodes);

  /** The one gate every chosen photo passes, whether it arrived by picker or by drop. */
  function acceptFile(file: File | null | undefined) {
    if (!file) return;
    const problem = describeUnusablePhoto(file);
    setFileProblem(problem);
    setUploadFile(problem ? null : file);
    if (!problem) setDirty(true);
  }

  function submitUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!uploadFile || uploadAltText.trim() === "" || atLimit) return;
    const file = uploadFile;
    void (async () => {
      const uploaded = await upload(file, uploadAltText, uploadCaption.trim() === "" ? null : uploadCaption);
      if (uploaded) {
        setUploadFile(null);
        setUploadAltText("");
        setUploadCaption("");
        setFileProblem(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    })();
  }

  /**
   * Swaps the picture behind an existing entry without making the owner delete and re-add it, which
   * would have cost them the alt text, the caption, and the position.
   */
  function replaceWith(image: AdminGalleryImage, file: File | null | undefined) {
    if (!file) return;
    const problem = describeUnusablePhoto(file);
    if (problem) {
      setNotice(problem);
      return;
    }
    void (async () => {
      if (await replacePhoto(image, file)) setNotice(`Photo replaced for “${image.altText}”.`);
    })();
  }

  function startEditing(image: AdminGalleryImage) {
    setEditingId(image.id);
    setEditAltText(image.altText);
    setEditCaption(image.caption ?? "");
  }

  function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const image = images.find((item) => item.id === editingId);
    if (!image) return;
    void (async () => {
      const saved = await save(`/api/v1/admin/gallery/${image.id}`, "PATCH", {
        altText: editAltText,
        caption: editCaption.trim() === "" ? null : editCaption,
        isActive: image.isActive,
      }, "Photo");
      if (saved) setEditingId(null);
    })();
  }

  function toggleActive(image: AdminGalleryImage) {
    void save(`/api/v1/admin/gallery/${image.id}`, "PATCH", {
      altText: image.altText,
      caption: image.caption,
      isActive: !image.isActive,
    }, "Photo visibility");
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= images.length) return;
    const imageIds = moveGalleryImage(images, from, to);
    const moved = images[from];
    void (async () => {
      if (await save("/api/v1/admin/gallery/reorder", "PATCH", { imageIds }, "Photo order")) {
        setNotice(`${moved.altText} moved to position ${to + 1} of ${imageIds.length}. Photo order saved.`);
      }
    })();
  }

  function handleDrop(event: DragEvent<HTMLLIElement>, to: number) {
    event.preventDefault();
    const from = images.findIndex((image) => image.id === dragId);
    setDragId(null);
    if (from >= 0 && from !== to) move(from, to);
  }

  return (
    <main id="main-content" className={styles.editorMain}>
      <div className={styles.editorHeading}>
        <div>
          <p className={styles.eyebrow}>Draft editor</p>
          <h1>Photo gallery</h1>
        </div>
        <a className={styles.secondaryButton} href="/admin/restaurant/preview">Preview draft</a>
      </div>

      <DraftStatusBar
        publication={gallery.publicationStatus}
        notice={notice}
        conflict={conflict}
        sessionExpired={sessionExpired}
        onRetry={retrySave}
        busy={disabled}
      >
        <span>{images.length} of {maximum} photos used</span>
      </DraftStatusBar>

      <section className={styles.editorSection} aria-labelledby="gallery-list-title">
        <h2 id="gallery-list-title">Gallery photos</h2>
        <p>
          Drag a photo, or use the move buttons, to change the order visitors see. Hidden photos keep their place in
          the order. Changes publish as soon as they are saved.
        </p>
        {images.length === 0 && <p>No photos yet. Upload the first one below.</p>}
        <ol className={styles.categoryList}>
          {images.map((image, index) => (
            <li
              key={image.id}
              className={styles.categoryRow}
              draggable={!disabled}
              aria-label={`${image.altText}, position ${index + 1} of ${images.length}`}
              onDragStart={(event) => {
                setDragId(image.id);
                event.dataTransfer.effectAllowed = "move";
              }}
              onDragEnd={() => setDragId(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => handleDrop(event, index)}
            >
              <span className={styles.categoryDrag} aria-hidden="true">⠿</span>
              <Image
                unoptimized
                loader={({ src }) => src}
                className={styles.dishThumbnail}
                src={image.thumbnailUrl}
                alt={image.altText}
                {...thumbnailBox(image.width, image.height)}
              />
              {editingId === image.id ? (
                <form className={styles.inlineForm} onSubmit={submitEdit} onChange={() => setDirty(true)}>
                  <label>
                    Photo alt text
                    <input
                      required
                      autoFocus
                      maxLength={galleryAltTextMaxLength}
                      {...fieldA11y("altText")}
                      value={editAltText}
                      onChange={(event) => setEditAltText(event.target.value)}
                    />
                    {errorFor("altText")}
                  </label>
                  <label>
                    Photo caption
                    <input
                      maxLength={galleryCaptionMaxLength}
                      {...fieldA11y("caption")}
                      value={editCaption}
                      onChange={(event) => setEditCaption(event.target.value)}
                    />
                    {errorFor("caption")}
                  </label>
                  <div className={styles.buttonRow}>
                    <button className={styles.primaryButton} type="submit" disabled={disabled}>Save photo</button>
                    <button className={styles.secondaryButton} type="button" onClick={() => setEditingId(null)}>Cancel</button>
                  </div>
                </form>
              ) : (
                <>
                  <span className={styles.categoryMeta}>
                    <strong>{image.altText}</strong>
                    {image.caption && <span>{image.caption}</span>}
                    <span>Position {image.displayOrder}</span>
                    {!image.isActive && <span className={styles.publishedBadge}>Hidden</span>}
                  </span>
                  <span className={styles.categoryActions}>
                    <button
                      type="button"
                      disabled={disabled || index === 0}
                      aria-label={`Move ${image.altText} up`}
                      onClick={() => move(index, index - 1)}
                    >
                      Move up
                    </button>
                    <button
                      type="button"
                      disabled={disabled || index === images.length - 1}
                      aria-label={`Move ${image.altText} down`}
                      onClick={() => move(index, index + 1)}
                    >
                      Move down
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      aria-label={image.isActive ? `Hide ${image.altText}` : `Show ${image.altText}`}
                      onClick={() => toggleActive(image)}
                    >
                      {image.isActive ? "Hide" : "Show"}
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      aria-label={`Edit ${image.altText}`}
                      onClick={() => startEditing(image)}
                    >
                      Edit
                    </button>
                    {/* Replacing uploads the new photo before removing the old one, so it needs a free
                        slot. On a full gallery the owner deletes first, exactly as they do to add. */}
                    <span className={styles.replaceControl}>
                      <span aria-hidden="true">Replace photo</span>
                      <input
                        type="file"
                        accept={galleryImageAccept}
                        disabled={disabled || atLimit}
                        aria-label={`Replace ${image.altText}`}
                        onChange={(event) => {
                          replaceWith(image, event.target.files?.[0]);
                          event.target.value = "";
                        }}
                      />
                    </span>
                    <button
                      type="button"
                      className={styles.dangerButton}
                      disabled={disabled}
                      aria-label={`Delete ${image.altText}`}
                      onClick={() => setPendingDelete(image)}
                    >
                      Delete
                    </button>
                  </span>
                </>
              )}
            </li>
          ))}
        </ol>
      </section>

      {pendingDelete && (
        <ConfirmDialog
          idPrefix="delete-photo"
          title={`Delete “${pendingDelete.altText}”?`}
          description={"This removes the photo from the gallery and publishes immediately. The remaining photos "
            + "keep their order. To hide a photo temporarily instead, use Hide."}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            const image = pendingDelete;
            setPendingDelete(null);
            void save(`/api/v1/admin/gallery/${image.id}`, "DELETE", undefined, "Photo");
          }}
        />
      )}

      <form
        className={styles.editorSection}
        onSubmit={submitUpload}
        onChange={() => setDirty(true)}
        aria-labelledby="gallery-upload-title"
      >
        <h2 id="gallery-upload-title">Add a photo</h2>
        <p>
          A gallery holds up to {maximum} photos. Alt text is required so the photo is described to visitors using a
          screen reader; the caption is optional and shown under the enlarged photo.
        </p>
        {atLimit && <p className={styles.fieldError}>This gallery is full. Delete a photo before uploading another.</p>}
        <div className={styles.formGrid}>
          {/* The drop zone wraps the file picker rather than replacing it: dragging is a shortcut,
              never the only way in, so the keyboard path stays exactly what it was. */}
          <div
            role="group"
            aria-label="Photo upload area"
            className={dropActive ? `${styles.dropZone} ${styles.dropZoneActive}` : styles.dropZone}
            onDragEnter={(event) => { event.preventDefault(); if (!atLimit) setDropActive(true); }}
            onDragOver={(event) => { event.preventDefault(); if (!atLimit) setDropActive(true); }}
            onDragLeave={() => setDropActive(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDropActive(false);
              if (!atLimit) acceptFile(event.dataTransfer?.files?.[0]);
            }}
          >
            <p>Drag a photo here, or choose a file.</p>
            <label>
              Photo file
              <input
                ref={fileInputRef}
                type="file"
                accept={galleryImageAccept}
                disabled={atLimit}
                {...fieldA11y("file")}
                onChange={(event) => acceptFile(event.target.files?.[0] ?? null)}
              />
              {errorFor("file")}
            </label>
            {uploadFile && <p>Ready to upload: {uploadFile.name}</p>}
            {fileProblem && <p className={styles.fieldError}>{fileProblem}</p>}
          </div>
          <label>
            Alt text
            <input
              required
              maxLength={galleryAltTextMaxLength}
              disabled={atLimit}
              {...fieldA11y("altText")}
              value={uploadAltText}
              onChange={(event) => setUploadAltText(event.target.value)}
            />
            {editingId === null && errorFor("altText")}
          </label>
          <label>
            Caption
            <input
              maxLength={galleryCaptionMaxLength}
              disabled={atLimit}
              {...fieldA11y("caption")}
              value={uploadCaption}
              onChange={(event) => setUploadCaption(event.target.value)}
            />
            {editingId === null && errorFor("caption")}
          </label>
        </div>
        <button
          className={styles.primaryButton}
          type="submit"
          disabled={disabled || atLimit || !uploadFile || uploadAltText.trim() === ""}
        >
          Upload photo
        </button>
      </form>
    </main>
  );
}
