import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";

import { StateCard } from "./StateCard";

describe("StateCard", () => {
  it("renders the existing public state-card classes rather than new ones", () => {
    const { container } = render(<StateCard variant="notFound" title="Page not found" body="Check the address." />);

    const card = container.querySelector("section");
    expect(card).toHaveClass("publicStateCard");
    expect(card).toHaveAttribute("data-state", "notFound");
    expect(screen.getByRole("heading", { level: 1, name: "Page not found" })).toBeInTheDocument();
    expect(screen.getByText("Check the address.")).toBeInTheDocument();
  });

  it("labels the card with its own heading", () => {
    render(<StateCard variant="error" title="We could not load this page" body="Try again." onRetry={vi.fn()} />);

    // A region announced without a name is exactly what a screen reader user cannot navigate to.
    expect(screen.getByRole("region", { name: "We could not load this page" })).toBeInTheDocument();
  });

  it("offers no retry for a state where retrying cannot help", () => {
    render(<StateCard variant="notFound" title="Page not found" body="Check the address." />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("runs the retry action once no matter how often it is pressed", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<StateCard variant="error" title="Failed" body="Try again." onRetry={onRetry} />);

    const retry = screen.getByRole("button", { name: "Try again" });
    await user.dblClick(retry);
    await user.click(retry);

    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("drops to a heading level 2 when the page already owns the h1", () => {
    render(<StateCard variant="empty" headingLevel={2} title="Nothing yet" body="Come back soon." />);

    expect(screen.getByRole("heading", { level: 2, name: "Nothing yet" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });

  it("accepts a caller-supplied heading id and extra content", () => {
    render(
      <StateCard variant="unavailable" titleId="fixed-id" title="Unavailable" body="Soon.">
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/">Go to the homepage</a>
      </StateCard>,
    );

    expect(screen.getByRole("heading", { name: "Unavailable" })).toHaveAttribute("id", "fixed-id");
    expect(screen.getByRole("link", { name: "Go to the homepage" })).toHaveAttribute("href", "/");
  });

  it("has no accessibility violations in any variant", async () => {
    for (const variant of ["notFound", "error", "unavailable", "empty"] as const) {
      const { container, unmount } = render(
        <main>
          <StateCard variant={variant} title={`Title ${variant}`} body="Body copy." onRetry={vi.fn()} />
        </main>,
      );
      const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
      expect(results.violations, variant).toEqual([]);
      unmount();
    }
  });
});
