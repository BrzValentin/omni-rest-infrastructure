import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import PageError from "./error";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

function renderBoundary(error = new Error("hidden internal detail")) {
  const reset = vi.fn();
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  const view = render(<PageError error={error} reset={reset} />);
  return { ...view, reset, logged };
}

describe("PageError", () => {
  beforeEach(() => refresh.mockClear());

  it("never renders the internal error message", () => {
    renderBoundary(Object.assign(new Error("hidden internal detail"), { digest: "abc123" }));

    expect(screen.queryByText("hidden internal detail")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain("abc123");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("We could not load this page");
  });

  it("logs the digest once on mount so a report can be matched to a server log", () => {
    const { logged, rerender } = renderBoundary(Object.assign(new Error("boom"), { digest: "abc123" }));
    const error = Object.assign(new Error("boom"), { digest: "abc123" });
    rerender(<PageError error={error} reset={vi.fn()} />);

    // The digest identifies the log entry; the message that produced it is never written anywhere
    // the reader can see, and never rendered.
    expect(logged).toHaveBeenCalledTimes(1);
    const payload = String(logged.mock.calls[0][1]);
    expect(payload).toContain("abc123");
    expect(payload).not.toContain("boom");
  });

  it("carries no brand mark, header, or navigation of the failed tenant", () => {
    const { container } = renderBoundary();

    // When this renders the tenant is precisely what failed to resolve, and the same file serves the
    // owner portal, so `PublicShell` must never appear here.
    expect(container.querySelector(".publicShell")).toBeNull();
    expect(container.querySelector(".publicHeader")).toBeNull();
    expect(container.querySelector(".publicBrandMark")).toBeNull();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("offers exactly one unbranded way back to the homepage", () => {
    renderBoundary();

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/");
    expect(links[0]).toHaveAccessibleName("Go to the homepage");
  });

  it("retries once per mount and refreshes the router alongside the boundary reset", async () => {
    const user = userEvent.setup();
    const { reset } = renderBoundary();

    await user.dblClick(screen.getByRole("button", { name: "Try again" }));

    expect(reset).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("has no accessibility violations", async () => {
    const { container } = renderBoundary();

    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(results.violations).toEqual([]);
  });
});
