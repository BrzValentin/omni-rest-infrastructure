import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FieldError, fieldErrorHelpers, fieldErrorId } from "./FieldError";

const resolve = (codes: string[] | undefined) =>
  (codes?.length ? ({ field_required: "This field is required." }[codes[0]] ?? "Enter a valid value.") : null);

describe("fieldErrorId", () => {
  it("keeps a plain field name and flattens a nested path into a usable id", () => {
    expect(fieldErrorId("error", "name")).toBe("error-name");
    expect(fieldErrorId("error", "address.line1")).toBe("error-address-line1");
    expect(fieldErrorId("error", "days.1.intervals")).toBe("error-days-1-intervals");
  });
});

describe("FieldError", () => {
  it("renders the message under the id the field points at", () => {
    render(<FieldError id="error-name">This field is required.</FieldError>);
    const message = screen.getByText("This field is required.");
    expect(message).toBeVisible();
    expect(message).toHaveAttribute("id", "error-name");
  });
});

describe("fieldErrorHelpers", () => {
  it("marks an invalid field and points it at the message it produced", () => {
    const { errorFor, fieldA11y } = fieldErrorHelpers({ "address.line1": ["field_required"] }, "error", resolve);

    render(<label>Address line 1<input {...fieldA11y("address.line1")} />{errorFor("address.line1")}</label>);

    const field = screen.getByRole("textbox");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAttribute("aria-describedby", "error-address-line1");
    expect(field).toHaveAttribute("data-error-field", "address.line1");
    expect(screen.getByText("This field is required.")).toHaveAttribute("id", "error-address-line1");
  });

  it("leaves a valid field unmarked and renders nothing for it", () => {
    const { errorFor, fieldA11y } = fieldErrorHelpers({ name: ["field_required"] }, "error", resolve);

    render(<label>Email<input {...fieldA11y("email")} />{errorFor("email")}</label>);

    const field = screen.getByRole("textbox");
    expect(errorFor("email")).toBeNull();
    expect(field).toHaveAttribute("aria-invalid", "false");
    expect(field).not.toHaveAttribute("aria-describedby");
    // The attribute stays on every field so the focus-the-first-error helper can find it later.
    expect(field).toHaveAttribute("data-error-field", "email");
  });

  it("falls back to a general message for a code it does not recognise", () => {
    const { errorFor } = fieldErrorHelpers({ name: ["never_seen_before"] }, "dish-error", resolve);
    render(<p>{errorFor("name")}</p>);
    expect(screen.getByText("Enter a valid value.")).toHaveAttribute("id", "dish-error-name");
  });
});
