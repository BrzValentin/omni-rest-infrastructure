"use client";

import type { ReactNode } from "react";
import styles from "@/app/admin/admin.module.css";

/** Field-level error codes as the API returns them, keyed by field path. */
export type FieldErrors = Record<string, string[]>;

/**
 * The id that ties a field to its message. Dots are legal in a field path (`address.line1`,
 * `days.1.intervals`) but read badly in an id, so they become dashes — exactly as the restaurant
 * editor already did, which is what its tests assert (`error-days-1-intervals`).
 */
export function fieldErrorId(idPrefix: string, field: string): string {
  return `${idPrefix}-${field.replaceAll(".", "-")}`;
}

export function FieldError({ id, children }: Readonly<{ id: string; children: ReactNode }>) {
  return <span className={styles.fieldError} id={id}>{children}</span>;
}

/**
 * Builds the `errorFor`/`fieldA11y` pair every editor needs.
 *
 * All four editors carried their own copy of these two functions, differing only in the id prefix
 * and in which error-code dictionary they looked the message up in. The accessible contract they
 * produce is unchanged: `data-error-field` for the focus-the-first-error helper, `aria-invalid`, and
 * an `aria-describedby` that points at the rendered message only when there is one.
 */
export function fieldErrorHelpers(
  errors: FieldErrors,
  idPrefix: string,
  resolve: (codes: string[] | undefined) => string | null,
) {
  return {
    errorFor(field: string): ReactNode {
      const text = resolve(errors[field]);
      if (!text) return null;
      return <FieldError id={fieldErrorId(idPrefix, field)}>{text}</FieldError>;
    },
    fieldA11y(field: string) {
      return {
        "data-error-field": field,
        "aria-invalid": Boolean(errors[field]),
        "aria-describedby": errors[field] ? fieldErrorId(idPrefix, field) : undefined,
      };
    },
  };
}
