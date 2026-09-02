import React from "react";
import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminNavLink } from "./AdminNavLink";
import { hasUnsavedChanges, unsavedChangesPrompt, useUnsavedChanges } from "./useUnsavedChanges";

// `next/link` becomes a plain anchor with no `href`, so a click can be observed without jsdom
// trying to navigate. Nothing under test depends on the router.
vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) =>
    React.createElement("a", { ...rest, "data-href": href }, children),
}));

function Editor({ dirty }: { dirty: boolean }) {
  useUnsavedChanges(dirty);
  return <p>editor</p>;
}

afterEach(() => { vi.restoreAllMocks(); });

describe("useUnsavedChanges", () => {
  it("asks the browser to confirm before leaving, and only while there are edits", () => {
    const { rerender, unmount } = render(<Editor dirty={false} />);
    expect(hasUnsavedChanges()).toBe(false);

    const clean = createEvent("beforeunload", window, { cancelable: true });
    fireEvent(window, clean);
    expect(clean.defaultPrevented).toBe(false);

    rerender(<Editor dirty />);
    expect(hasUnsavedChanges()).toBe(true);
    const dirty = createEvent("beforeunload", window, { cancelable: true });
    fireEvent(window, dirty);
    expect(dirty.defaultPrevented).toBe(true);

    unmount();
    expect(hasUnsavedChanges()).toBe(false);
    const afterUnmount = createEvent("beforeunload", window, { cancelable: true });
    fireEvent(window, afterUnmount);
    expect(afterUnmount.defaultPrevented).toBe(false);
  });
});

describe("AdminNavLink", () => {
  it("navigates without asking when nothing is unsaved", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<><Editor dirty={false} /><AdminNavLink href="/admin/menu">My Menu</AdminNavLink></>);

    const click = createEvent.click(screen.getByText("My Menu"));
    fireEvent(screen.getByText("My Menu"), click);

    expect(confirm).not.toHaveBeenCalled();
    expect(click.defaultPrevented).toBe(false);
  });

  it("stays on the page when the owner declines to abandon unsaved edits", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<><Editor dirty /><AdminNavLink href="/admin/menu">My Menu</AdminNavLink></>);

    const click = createEvent.click(screen.getByText("My Menu"));
    fireEvent(screen.getByText("My Menu"), click);

    expect(confirm).toHaveBeenCalledWith(unsavedChangesPrompt);
    expect(click.defaultPrevented).toBe(true);
  });

  it("lets the owner leave once they have confirmed", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<><Editor dirty /><AdminNavLink href="/admin/gallery">My Gallery</AdminNavLink></>);

    const click = createEvent.click(screen.getByText("My Gallery"));
    fireEvent(screen.getByText("My Gallery"), click);

    expect(click.defaultPrevented).toBe(false);
  });
});
