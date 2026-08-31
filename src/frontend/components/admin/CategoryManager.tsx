"use client";

import { useEffect, useRef, useState, type DragEvent, type FormEvent, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { messageForCodes, useMenuDraft } from "./useMenuDraft";
import {
  categoryDescriptionMaxLength,
  categoryNameMaxLength,

  moveCategory,
  type AdminMenu,
  type AdminMenuCategory,

} from "@/lib/menu-admin-contract";
import styles from "@/app/admin/admin.module.css";

function DeleteCategoryDialog({ category, onCancel, onConfirm }: {
  category: AdminMenuCategory;
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
        aria-labelledby="delete-category-title"
        aria-describedby="delete-category-description"
        onKeyDown={handleKeyDown}
      >
        <h3 id="delete-category-title">Delete “{category.name}”?</h3>
        <p id="delete-category-description">
          This removes the category from the draft menu and publishes immediately. Categories that still contain dishes
          cannot be deleted.
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

export function CategoryManager({ initial }: { initial: AdminMenu }) {
  const { menu, busy, notice, setNotice, conflict, fieldErrors, save } = useMenuDraft(initial);
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [pendingDelete, setPendingDelete] = useState<AdminMenuCategory | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const categories = menu.categories;
  const disabled = busy !== null;

  function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void (async () => {
      const created = await save("/api/v1/admin/menu/categories", "POST", {
        name: draftName,
        description: draftDescription.trim() === "" ? null : draftDescription,
      }, "Category");
      if (created) {
        setDraftName("");
        setDraftDescription("");
      }
    })();
  }

  function startEditing(category: AdminMenuCategory) {
    setEditingId(category.id);
    setEditName(category.name);
    setEditDescription(category.description ?? "");
  }

  function submitRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingId) return;
    void (async () => {
      const renamed = await save(`/api/v1/admin/menu/categories/${editingId}`, "PATCH", {
        name: editName,
        description: editDescription.trim() === "" ? null : editDescription,
      }, "Category");
      if (renamed) setEditingId(null);
    })();
  }

  async function saveOrder(categoryIds: string[], movedName: string, position: number) {
    const reordered = await save("/api/v1/admin/menu/categories/reorder", "PATCH", { categoryIds }, "Category order");
    if (reordered) {
      setNotice(`${movedName} moved to position ${position} of ${categoryIds.length}. Category order saved.`);
    }
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= categories.length) return;
    const categoryIds = moveCategory(categories, from, to);
    void saveOrder(categoryIds, categories[from].name, to + 1);
  }

  function handleDrop(event: DragEvent<HTMLLIElement>, to: number) {
    event.preventDefault();
    const from = categories.findIndex((category) => category.id === dragId);
    setDragId(null);
    if (from >= 0 && from !== to) move(from, to);
  }

  function errorFor(field: string) {
    const text = messageForCodes(fieldErrors[field]);
    if (!text) return null;
    return <span className={styles.fieldError} id={`menu-error-${field}`}>{text}</span>;
  }
  function fieldA11y(field: string) {
    return {
      "data-error-field": field,
      "aria-invalid": Boolean(fieldErrors[field]),
      "aria-describedby": fieldErrors[field] ? `menu-error-${field}` : undefined,
    };
  }

  if (!menu.menuId) {
    return (
      <main id="main-content" className={styles.editorMain}>
        <h1>Menu categories</h1>
        <p>This restaurant has no active menu yet, so categories cannot be managed.</p>
      </main>
    );
  }

  return (
    <main id="main-content" className={styles.editorMain}>
      <div className={styles.editorHeading}>
        <div>
          <p className={styles.eyebrow}>Draft editor</p>
          <h1>Menu categories</h1>
        </div>
        <a className={styles.secondaryButton} href="/admin/restaurant/preview">Preview draft</a>
      </div>

      <div className={styles.statusBar} role="status" aria-live="polite">
        <span>Draft {menu.draftVersion}</span>
        <span>Publication: {menu.publicationStatus?.status ?? "not started"}</span>
        {notice && <strong>{notice}</strong>}
        {conflict && <button type="button" onClick={() => window.location.reload()}>Reload latest</button>}
      </div>

      <section className={styles.editorSection} aria-labelledby="category-list-title">
        <h2 id="category-list-title">{menu.menuName}</h2>
        <p>
          Drag a category, or use the move buttons, to change the order visitors see. Changes publish as soon as they
          are saved.
        </p>
        {categories.length === 0 && <p>No categories yet. Add the first one below.</p>}
        <ol className={styles.categoryList}>
          {categories.map((category, index) => (
            <li
              key={category.id}
              className={styles.categoryRow}
              draggable={!disabled}
              aria-label={`${category.name}, position ${index + 1} of ${categories.length}`}
              onDragStart={(event) => {
                setDragId(category.id);
                event.dataTransfer.effectAllowed = "move";
              }}
              onDragEnd={() => setDragId(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => handleDrop(event, index)}
            >
              <span className={styles.categoryDrag} aria-hidden="true">⠿</span>
              {editingId === category.id ? (
                <form className={styles.inlineForm} onSubmit={submitRename}>
                  <label>
                    Category name
                    <input
                      required
                      autoFocus
                      maxLength={categoryNameMaxLength}
                      {...fieldA11y("name")}
                      value={editName}
                      onChange={(event) => setEditName(event.target.value)}
                    />
                    {errorFor("name")}
                  </label>
                  <label>
                    Description
                    <input
                      maxLength={categoryDescriptionMaxLength}
                      {...fieldA11y("description")}
                      value={editDescription}
                      onChange={(event) => setEditDescription(event.target.value)}
                    />
                    {errorFor("description")}
                  </label>
                  <div className={styles.buttonRow}>
                    <button className={styles.primaryButton} type="submit" disabled={disabled}>Save name</button>
                    <button className={styles.secondaryButton} type="button" onClick={() => setEditingId(null)}>Cancel</button>
                  </div>
                </form>
              ) : (
                <>
                  <span className={styles.categoryMeta}>
                    <strong>{category.name}</strong>
                    <span>{category.dishCount === 1 ? "1 dish" : `${category.dishCount} dishes`}</span>
                    {category.description && <span>{category.description}</span>}
                    {!category.isActive && <span className={styles.publishedBadge}>Hidden</span>}
                  </span>
                  <span className={styles.categoryActions}>
                    <button
                      type="button"
                      disabled={disabled || index === 0}
                      aria-label={`Move ${category.name} up`}
                      onClick={() => move(index, index - 1)}
                    >
                      Move up
                    </button>
                    <button
                      type="button"
                      disabled={disabled || index === categories.length - 1}
                      aria-label={`Move ${category.name} down`}
                      onClick={() => move(index, index + 1)}
                    >
                      Move down
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      aria-label={`Rename ${category.name}`}
                      onClick={() => startEditing(category)}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className={styles.dangerButton}
                      disabled={disabled}
                      aria-label={`Delete ${category.name}`}
                      onClick={() => setPendingDelete(category)}
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
        <DeleteCategoryDialog
          category={pendingDelete}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            const category = pendingDelete;
            setPendingDelete(null);
            void save(`/api/v1/admin/menu/categories/${category.id}`, "DELETE", undefined, "Category");
          }}
        />
      )}

      <form className={styles.editorSection} onSubmit={submitCreate} aria-labelledby="category-create-title">
        <h2 id="category-create-title">Add a category</h2>
        <div className={styles.formGrid}>
          <label>
            Name
            <input
              required
              maxLength={categoryNameMaxLength}
              {...fieldA11y("name")}
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
            />
            {editingId === null && errorFor("name")}
          </label>
          <label>
            Description
            <input
              maxLength={categoryDescriptionMaxLength}
              {...fieldA11y("description")}
              value={draftDescription}
              onChange={(event) => setDraftDescription(event.target.value)}
            />
            {editingId === null && errorFor("description")}
          </label>
        </div>
        <button className={styles.primaryButton} type="submit" disabled={disabled}>Add category</button>
      </form>
    </main>
  );
}
