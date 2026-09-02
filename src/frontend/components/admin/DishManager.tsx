"use client";

import { useRef, useState, type FormEvent } from "react";
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
import { ConfirmDialog } from "./ConfirmDialog";
import { DraftStatusBar } from "./DraftStatusBar";
import { fieldErrorHelpers } from "./FieldError";
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

export function DishManager({ initial, initialMedia }: { initial: AdminMenu; initialMedia: AdminMediaAsset[] }) {
  const {
    menu, busy, notice, setNotice, conflict, sessionExpired, fieldErrors, setDirty, save, retrySave,
  } = useMenuDraft(initial);
  const [selectedCategoryId, setSelectedCategoryId] = useState(initial.categories[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const [editingDishId, setEditingDishId] = useState<string | null>(null);
  const [form, setForm] = useState<DishForm>(() => emptyForm(initial.categories[0]?.id ?? ""));
  // Per-row price edits, keyed by dish id, so a price can be corrected without opening the full
  // dish form. `priceDishId` is the row whose price save came back invalid, which keeps the one
  // `price` message beside the field that produced it instead of duplicating it on the form below.
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [priceDishId, setPriceDishId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AdminDish | null>(null);
  const [mediaAssets, setMediaAssets] = useState(initialMedia);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadAltText, setUploadAltText] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  const category = menu.categories.find((item) => item.id === selectedCategoryId) ?? menu.categories[0];
  const dishes = category?.dishes ?? [];
  const disabled = busy !== null;
  const { errorFor, fieldA11y } = fieldErrorHelpers(fieldErrors, "dish-error", messageForCodes);

  // The filter is a client-side pass over the menu already in hand — the portal loads the whole
  // draft menu — so it never asks the backend for anything and never touches the public site.
  const query = search.trim().toLowerCase();
  const filtering = query !== "";
  const allDishes = menu.categories.flatMap((item) => item.dishes);
  const visibleDishes = filtering
    ? allDishes.filter((item) => item.name.toLowerCase().includes(query))
    : dishes;
  const categoryNames = new Map(menu.categories.map((item) => [item.id, item.name]));

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

  /**
   * Saves one price through the dedicated price endpoint.
   *
   * Changing a price used to mean opening the whole dish form and re-submitting every field, which
   * risked clobbering a description or a badge that had changed elsewhere in the meantime. The
   * backend has carried a price-only endpoint — separately audited as `menu.dish.price_changed` —
   * since the menu shipped; this is what finally calls it.
   */
  function savePrice(dish: AdminDish) {
    const next = priceDrafts[dish.id];
    if (next === undefined || next.trim() === "") return;
    void (async () => {
      setPriceDishId(dish.id);
      const saved = await save(
        `/api/v1/admin/menu/dishes/${dish.id}/price`, "PATCH", { price: Number(next) }, "Price");
      if (!saved) return;
      setPriceDrafts((current) => {
        const remaining = { ...current };
        delete remaining[dish.id];
        return remaining;
      });
      setPriceDishId(null);
      setNotice(`${dish.name} is now ${formatAdminPrice(Number(next).toFixed(2), menu.locale, menu.currency)}.`);
    })();
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

      <DraftStatusBar
        publication={menu.publicationStatus}
        notice={notice}
        conflict={conflict}
        sessionExpired={sessionExpired}
        onRetry={retrySave}
        busy={disabled}
      />

      <section className={styles.editorSection} aria-labelledby="dish-list-title">
        <h2 id="dish-list-title">Dishes in this category</h2>
        <div className={styles.inlineForm}>
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
          <label>
            Search dishes by name
            <input
              type="search"
              value={search}
              placeholder="poutine"
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          {filtering && (
            <button className={styles.secondaryButton} type="button" onClick={() => setSearch("")}>
              Clear search
            </button>
          )}
        </div>
        {filtering && (
          <p>
            {visibleDishes.length === 0
              ? `No dish matches “${search.trim()}”.`
              : `${visibleDishes.length} of ${allDishes.length} dishes match “${search.trim()}”, `
                + "across every category. Clear the search to change the order."}
          </p>
        )}
        {!filtering && dishes.length === 0 && <p>No dishes in this category yet. Add the first one below.</p>}
        <ol className={styles.categoryList}>
          {visibleDishes.map((dish, index) => {
            const priceDraft = priceDrafts[dish.id];
            const priceChanged = priceDraft !== undefined && priceDraft.trim() !== ""
              && Number(priceDraft) !== Number(dish.price);
            return (
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
                  {filtering && <span>{categoryNames.get(dish.categoryId) ?? ""}</span>}
                  <span className={dish.availability === "available" ? styles.availableBadge : styles.unavailableBadge}>
                    {availabilityLabels[dish.availability]}
                  </span>
                  {dish.badges.length > 0 && (
                    <span>{dish.badges.map((code) => badgeLabels[code] ?? code).join(", ")}</span>
                  )}
                </span>
                <span className={styles.inlinePrice}>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    aria-label={`Price for ${dish.name}`}
                    {...(priceDishId === dish.id ? fieldA11y("price") : {})}
                    value={priceDraft ?? dish.price}
                    onChange={(event) => {
                      setPriceDrafts((current) => ({ ...current, [dish.id]: event.target.value }));
                      setDirty(true);
                    }}
                  />
                  <button
                    type="button"
                    disabled={disabled || !priceChanged}
                    aria-label={`Save price for ${dish.name}`}
                    onClick={() => savePrice(dish)}
                  >
                    Save price
                  </button>
                  {priceDishId === dish.id && errorFor("price")}
                </span>
                <span className={styles.categoryActions}>
                  <button
                    type="button"
                    disabled={disabled || filtering || index === 0}
                    aria-label={`Move ${dish.name} up`}
                    onClick={() => move(index, index - 1)}
                  >
                    Move up
                  </button>
                  <button
                    type="button"
                    disabled={disabled || filtering || index === visibleDishes.length - 1}
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
            );
          })}
        </ol>
      </section>

      {pendingDelete && (
        <ConfirmDialog
          idPrefix="delete-dish"
          title={`Delete “${pendingDelete.name}”?`}
          description={`${pendingDelete.name} disappears from the menu immediately. The record is kept for `
            + "reporting, but visitors will no longer see it. To hide a dish temporarily instead, set it "
            + "to Unavailable."}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            const dish = pendingDelete;
            setPendingDelete(null);
            void save(`/api/v1/admin/menu/dishes/${dish.id}`, "DELETE", undefined, "Dish");
          }}
        />
      )}

      <form
        ref={formRef}
        className={styles.editorSection}
        onSubmit={submit}
        onChange={() => setDirty(true)}
        aria-labelledby="dish-form-title"
      >
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
              {...(priceDishId === null ? fieldA11y("price") : { "data-error-field": "price" })}
              value={form.price}
              onChange={(event) => setForm({ ...form, price: event.target.value })}
            />
            {priceDishId === null && errorFor("price")}
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
