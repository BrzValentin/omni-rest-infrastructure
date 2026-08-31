"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { BrowserApiError, uploadMedia } from "@/lib/browser-api";
import {
  availabilityLabels,
  badgeLabels,
  dishDescriptionMaxLength,
  dishNameMaxLength,
  formatAdminPrice,
  moveItem,
  type AdminDish,
  type AdminMenu,
  type DishAvailability,
} from "@/lib/menu-admin-contract";
import type { AdminMediaAsset } from "@/lib/restaurant-contract";
import { messageForCodes, useMenuDraft } from "./useMenuDraft";
import styles from "@/app/admin/admin.module.css";

type DishForm = {
  categoryId: string;
  name: string;
  price: string;
  description: string;
  mediaAssetId: string;
  availability: DishAvailability;
  badges: string[];
};

function emptyForm(categoryId: string): DishForm {
  return { categoryId, name: "", price: "", description: "", mediaAssetId: "", availability: "available", badges: [] };
}

function formFor(dish: AdminDish): DishForm {
  return {
    categoryId: dish.categoryId,
    name: dish.name,
    price: dish.price,
    description: dish.description ?? "",
    mediaAssetId: dish.mediaAssetId ?? "",
    availability: dish.availability,
    badges: [...dish.badges],
  };
}

function DeleteDishDialog({ dish, onCancel, onConfirm }: {
  dish: AdminDish;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

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
    cancelRef.current?.focus();
    return () => {
      for (const item of background) {
        if (!item.inert) item.element.removeAttribute("inert");
        if (item.ariaHidden === null) item.element.removeAttribute("aria-hidden");
        else item.element.setAttribute("aria-hidden", item.ariaHidden);
      }
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }
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

  return createPortal(
    <div className={styles.modalBackdrop}>
      <div
        ref={dialogRef}
        className={styles.confirmation}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-dish-title"
        aria-describedby="delete-dish-description"
        onKeyDown={handleKeyDown}
      >
        <h3 id="delete-dish-title">Delete “{dish.name}”?</h3>
        <p id="delete-dish-description">
          {dish.name} disappears from the menu immediately. The record is kept for reporting, but visitors will no
          longer see it. To hide a dish temporarily instead, set it to Unavailable.
        </p>
        <div className={styles.buttonRow}>
          <button ref={cancelRef} className={styles.secondaryButton} type="button" onClick={onCancel}>Cancel</button>
          <button className={styles.dangerButton} type="button" onClick={onConfirm}>Confirm delete</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function DishManager({ initial, initialMedia }: { initial: AdminMenu; initialMedia: AdminMediaAsset[] }) {
  const { menu, busy, notice, setNotice, conflict, fieldErrors, save } = useMenuDraft(initial);
  const [selectedCategoryId, setSelectedCategoryId] = useState(initial.categories[0]?.id ?? "");
  const [editingDishId, setEditingDishId] = useState<string | null>(null);
  const [form, setForm] = useState<DishForm>(() => emptyForm(initial.categories[0]?.id ?? ""));
  const [pendingDelete, setPendingDelete] = useState<AdminDish | null>(null);
  const [mediaAssets, setMediaAssets] = useState(initialMedia);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadAltText, setUploadAltText] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  const category = menu.categories.find((item) => item.id === selectedCategoryId) ?? menu.categories[0];
  const dishes = category?.dishes ?? [];
  const disabled = busy !== null;

  function errorFor(field: string) {
    const text = messageForCodes(fieldErrors[field]);
    if (!text) return null;
    return <span className={styles.fieldError} id={`dish-error-${field}`}>{text}</span>;
  }

  function fieldA11y(field: string) {
    return {
      "data-error-field": field,
      "aria-invalid": Boolean(fieldErrors[field]),
      "aria-describedby": fieldErrors[field] ? `dish-error-${field}` : undefined,
    };
  }

  function body() {
    return {
      categoryId: form.categoryId,
      name: form.name,
      price: form.price === "" ? null : Number(form.price),
      description: form.description.trim() === "" ? null : form.description,
      mediaAssetId: form.mediaAssetId === "" ? null : form.mediaAssetId,
      availability: form.availability,
      badges: form.badges,
    };
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void (async () => {
      const saved = editingDishId
        ? await save(`/api/v1/admin/menu/dishes/${editingDishId}`, "PATCH", body(), "Dish")
        : await save("/api/v1/admin/menu/dishes", "POST", body(), "Dish");
      if (saved) {
        setEditingDishId(null);
        setForm(emptyForm(form.categoryId));
        setSelectedCategoryId(form.categoryId);
      }
    })();
  }

  function startEditing(dish: AdminDish) {
    setEditingDishId(dish.id);
    setForm(formFor(dish));
    formRef.current?.scrollIntoView({ block: "nearest" });
  }

  function move(from: number, to: number) {
    if (!category || to < 0 || to >= dishes.length) return;
    const dishIds = moveItem(dishes, from, to);
    void (async () => {
      if (await save("/api/v1/admin/menu/dishes/reorder", "PATCH", { categoryId: category.id, dishIds }, "Dish order")) {
        setNotice(`${dishes[from].name} moved to position ${to + 1} of ${dishes.length}. Dish order saved.`);
      }
    })();
  }

  function toggleAvailability(dish: AdminDish) {
    const status: DishAvailability = dish.availability === "available" ? "unavailable" : "available";
    void save(`/api/v1/admin/menu/dishes/${dish.id}/availability`, "PATCH", { status }, "Dish availability");
  }

  async function upload() {
    if (!uploadFile || uploadAltText.trim() === "") return;
    setNotice(null);
    try {
      const uploaded = await uploadMedia<AdminMediaAsset>(uploadFile, uploadAltText);
      setMediaAssets((current) => [...current, uploaded]);
      setForm((current) => ({ ...current, mediaAssetId: uploaded.id }));
      setUploadFile(null);
      setUploadAltText("");
      setNotice("Image uploaded and selected for this dish.");
    } catch (error) {
      setNotice(error instanceof BrowserApiError && error.status === 400
        ? "The image must be a valid PNG, JPEG, or WebP within the configured size and dimensions."
        : "Image upload failed. Try again.");
    }
  }

  if (!menu.menuId || menu.categories.length === 0) {
    return (
      <main id="main-content" className={styles.editorMain}>
        <h1>Dishes</h1>
        <p>Add at least one menu category before adding dishes.</p>
        <a className={styles.primaryLink} href="/admin/menu">Manage categories</a>
      </main>
    );
  }

  const selectedMedia = mediaAssets.find((asset) => asset.id === form.mediaAssetId);

  return (
    <main id="main-content" className={styles.editorMain}>
      <div className={styles.editorHeading}>
        <div>
          <p className={styles.eyebrow}>Draft editor</p>
          <h1>Dishes</h1>
        </div>
        <a className={styles.secondaryButton} href="/admin/restaurant/preview">Preview draft</a>
      </div>

      <div className={styles.statusBar} role="status" aria-live="polite">
        <span>Draft {menu.draftVersion}</span>
        <span>Publication: {menu.publicationStatus?.status ?? "not started"}</span>
        {notice && <strong>{notice}</strong>}
        {conflict && <button type="button" onClick={() => window.location.reload()}>Reload latest</button>}
      </div>

      <section className={styles.editorSection} aria-labelledby="dish-list-title">
        <h2 id="dish-list-title">Dishes in this category</h2>
        <label>
          Show category
          <select
            value={category?.id ?? ""}
            onChange={(event) => setSelectedCategoryId(event.target.value)}
          >
            {menu.categories.map((item) => (
              <option key={item.id} value={item.id}>{item.name} ({item.dishCount})</option>
            ))}
          </select>
        </label>
        {dishes.length === 0 && <p>No dishes in this category yet. Add the first one below.</p>}
        <ol className={styles.categoryList}>
          {dishes.map((dish, index) => (
            <li key={dish.id} className={styles.categoryRow}>
              {dish.media?.variants[0] && (
                <Image
                  unoptimized
                  loader={({ src }) => src}
                  className={styles.dishThumbnail}
                  src={dish.media.variants[0].url}
                  width={dish.media.variants[0].width}
                  height={dish.media.variants[0].height}
                  alt={dish.media.altText}
                />
              )}
              <span className={styles.categoryMeta}>
                <strong>{dish.name}</strong>
                <span>{formatAdminPrice(dish.price, menu.locale, menu.currency)}</span>
                <span className={dish.availability === "available" ? styles.availableBadge : styles.unavailableBadge}>
                  {availabilityLabels[dish.availability]}
                </span>
                {dish.badges.length > 0 && (
                  <span>{dish.badges.map((code) => badgeLabels[code] ?? code).join(", ")}</span>
                )}
              </span>
              <span className={styles.categoryActions}>
                <button
                  type="button"
                  disabled={disabled || index === 0}
                  aria-label={`Move ${dish.name} up`}
                  onClick={() => move(index, index - 1)}
                >
                  Move up
                </button>
                <button
                  type="button"
                  disabled={disabled || index === dishes.length - 1}
                  aria-label={`Move ${dish.name} down`}
                  onClick={() => move(index, index + 1)}
                >
                  Move down
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={dish.availability === "available"
                    ? `Mark ${dish.name} unavailable`
                    : `Mark ${dish.name} available`}
                  onClick={() => toggleAvailability(dish)}
                >
                  {dish.availability === "available" ? "Mark unavailable" : "Mark available"}
                </button>
                <button type="button" disabled={disabled} aria-label={`Edit ${dish.name}`} onClick={() => startEditing(dish)}>
                  Edit
                </button>
                <button
                  type="button"
                  className={styles.dangerButton}
                  disabled={disabled}
                  aria-label={`Delete ${dish.name}`}
                  onClick={() => setPendingDelete(dish)}
                >
                  Delete
                </button>
              </span>
            </li>
          ))}
        </ol>
      </section>

      {pendingDelete && (
        <DeleteDishDialog
          dish={pendingDelete}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            const dish = pendingDelete;
            setPendingDelete(null);
            void save(`/api/v1/admin/menu/dishes/${dish.id}`, "DELETE", undefined, "Dish");
          }}
        />
      )}

      <form ref={formRef} className={styles.editorSection} onSubmit={submit} aria-labelledby="dish-form-title">
        <h2 id="dish-form-title">{editingDishId ? "Edit dish" : "Add a dish"}</h2>
        <div className={styles.formGrid}>
          <label>
            Name
            <input
              required
              maxLength={dishNameMaxLength}
              {...fieldA11y("name")}
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
            {errorFor("name")}
          </label>
          <label>
            Category
            <select
              {...fieldA11y("categoryId")}
              value={form.categoryId}
              onChange={(event) => setForm({ ...form, categoryId: event.target.value })}
            >
              {menu.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            {errorFor("categoryId")}
          </label>
          <label>
            Price ({menu.currency})
            <input
              required
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              {...fieldA11y("price")}
              value={form.price}
              onChange={(event) => setForm({ ...form, price: event.target.value })}
            />
            {errorFor("price")}
          </label>
          <label>
            Availability
            <select
              {...fieldA11y("availability")}
              value={form.availability}
              onChange={(event) => setForm({ ...form, availability: event.target.value as DishAvailability })}
            >
              <option value="available">Available</option>
              <option value="unavailable">Unavailable</option>
            </select>
            {errorFor("availability")}
          </label>
          <label>
            Description
            <textarea
              maxLength={dishDescriptionMaxLength}
              {...fieldA11y("description")}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
            {errorFor("description")}
          </label>
          <label>
            Image
            <select
              {...fieldA11y("mediaAssetId")}
              value={form.mediaAssetId}
              onChange={(event) => setForm({ ...form, mediaAssetId: event.target.value })}
            >
              <option value="">No image</option>
              {mediaAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.altText}</option>)}
            </select>
            {errorFor("mediaAssetId")}
          </label>
        </div>

        {selectedMedia?.variants[0] && (
          <Image
            unoptimized
            loader={({ src }) => src}
            className={styles.imagePreview}
            src={selectedMedia.variants[0].url}
            width={selectedMedia.variants[0].width}
            height={selectedMedia.variants[0].height}
            alt={selectedMedia.altText}
          />
        )}

        <fieldset className={styles.dayCard}>
          <legend>Dietary and special flags</legend>
          {menu.availableBadges.map((code) => (
            <label className={styles.checkLabel} key={code}>
              <input
                type="checkbox"
                checked={form.badges.includes(code)}
                onChange={(event) => setForm({
                  ...form,
                  badges: event.target.checked
                    ? [...form.badges, code]
                    : form.badges.filter((item) => item !== code),
                })}
              />
              {badgeLabels[code] ?? code}
            </label>
          ))}
          {errorFor("badges")}
        </fieldset>

        <div className={styles.inlineForm}>
          <label>
            Upload a new image
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <label>
            Image alt text
            <input maxLength={200} value={uploadAltText} onChange={(event) => setUploadAltText(event.target.value)} />
          </label>
          <button
            className={styles.secondaryButton}
            type="button"
            disabled={!uploadFile || uploadAltText.trim() === "" || disabled}
            onClick={() => void upload()}
          >
            Upload image
          </button>
        </div>

        <div className={styles.buttonRow}>
          <button className={styles.primaryButton} type="submit" disabled={disabled}>
            {editingDishId ? "Save dish" : "Add dish"}
          </button>
          {(editingDishId || form.mediaAssetId) && (
            <button
              className={styles.secondaryButton}
              type="button"
              disabled={disabled || !form.mediaAssetId}
              onClick={() => setForm({ ...form, mediaAssetId: "" })}
            >
              Remove image
            </button>
          )}
          {editingDishId && (
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={() => { setEditingDishId(null); setForm(emptyForm(form.categoryId)); }}
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    </main>
  );
}
