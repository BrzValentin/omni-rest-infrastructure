"use client";

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import styles from "@/app/admin/admin.module.css";

/**
 * The one destructive-confirmation dialog for the whole owner portal.
 *
 * The restaurant, category, dish, and gallery editors each carried their own byte-identical copy of
 * this component, so every accessibility fix had to be made four times. The behaviour here is that
 * copy, unchanged: `role="alertdialog"`, the background made `inert` and `aria-hidden` while it is
 * open, initial focus on Cancel, a Tab/Shift+Tab cycle that cannot leave the dialog, Escape to
 * cancel, and focus restored to whatever opened it.
 */
export function ConfirmDialog({
  idPrefix,
  title,
  description,
  cancelLabel = "Cancel",
  confirmLabel = "Confirm delete",
  onCancel,
  onConfirm,
}: Readonly<{
  /** Prefix for the `aria-labelledby`/`aria-describedby` ids, so several dialogs never collide. */
  idPrefix: string;
  title: ReactNode;
  description: ReactNode;
  cancelLabel?: string;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}>) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = `${idPrefix}-title`;
  const descriptionId = `${idPrefix}-description`;

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
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onKeyDown={handleKeyDown}
      >
        <h3 id={titleId}>{title}</h3>
        <p id={descriptionId}>{description}</p>
        <div className={styles.buttonRow}>
          <button ref={cancelRef} className={styles.secondaryButton} type="button" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className={styles.dangerButton} type="button" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
