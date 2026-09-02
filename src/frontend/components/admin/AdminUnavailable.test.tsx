import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { message } from "@/lib/menu-messages";
import { AdminUnavailable } from "./AdminUnavailable";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

describe("AdminUnavailable", () => {
  beforeEach(() => refresh.mockClear());

  it("tells an outage apart from a section that is simply empty", () => {
    const { unmount } = render(<AdminUnavailable reason="unavailable" section="admin.section.menu" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(message("adminUnavailableTitle"));
    expect(screen.getByText(message("adminUnavailableBody"))).toBeInTheDocument();
    unmount();

    // All six portal pages used to render one identical dead end for both, so an owner could not tell
    // an outage worth waiting out from a section that was only empty until they filled it in.
    render(<AdminUnavailable reason="empty" section="admin.section.menu" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(message("adminEmptyTitle"));
    expect(screen.getByText(message("adminEmptyBody"))).toBeInTheDocument();
    expect(screen.queryByText(message("adminUnavailableBody"))).not.toBeInTheDocument();
  });

  it("names the section it is standing in for", () => {
    render(<AdminUnavailable reason="unavailable" section="admin.section.gallery" />);

    expect(screen.getByText("Gallery editor")).toBeInTheDocument();
  });

  it("offers a retry for an outage and none for an empty section", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<AdminUnavailable reason="unavailable" section="admin.section.design" />);

    const retry = screen.getByRole("button", { name: message("adminRetry") });
    await user.dblClick(retry);
    // One refresh per mount: a second press before the first lands is a duplicate, not a new attempt.
    expect(refresh).toHaveBeenCalledOnce();
    unmount();

    render(<AdminUnavailable reason="empty" section="admin.section.design" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("keeps the portal's landmark so the skip link still has a target", () => {
    const { container } = render(<AdminUnavailable reason="unavailable" section="admin.section.portal" />);

    expect(container.querySelector("main")).toHaveAttribute("id", "main-content");
  });

  it("shows no status code, stack trace, or technical wording", () => {
    render(<AdminUnavailable reason="unavailable" section="admin.section.restaurant" />);

    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/\b(50[0-9]|40[0-9])\b/);
    expect(text).not.toMatch(/error|exception|stack|upstream|fetch/i);
  });

  it("has no accessibility violations in either reason", async () => {
    for (const reason of ["unavailable", "empty"] as const) {
      const { container, unmount } = render(<AdminUnavailable reason={reason} section="admin.section.menu" />);
      const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
      expect(results.violations, reason).toEqual([]);
      unmount();
    }
  });
});
