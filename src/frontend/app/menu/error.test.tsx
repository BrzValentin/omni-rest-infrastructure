import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import MenuError from "./error";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => React.createElement("img", props),
}));

describe("MenuError", () => {
  beforeEach(() => refresh.mockClear());

  it("deduplicates repeated retry activation", async () => {
    const user = userEvent.setup();
    const reset = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<MenuError error={new Error("hidden internal detail")} reset={reset} />);
    const retry = screen.getByRole("button", { name: "Try again" });
    await user.dblClick(retry);
    expect(reset).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledOnce();
    expect(screen.queryByText("hidden internal detail")).not.toBeInTheDocument();
  });

  it("logs the digest once without ever rendering it", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = Object.assign(new Error("hidden internal detail"), { digest: "menu-digest-1" });
    render(<MenuError error={error} reset={vi.fn()} />);

    expect(logged).toHaveBeenCalledOnce();
    expect(String(logged.mock.calls[0][1])).toContain("menu-digest-1");
    // The digest correlates a user report to a server log; neither it nor the message is displayed.
    expect(document.body.textContent).not.toContain("menu-digest-1");
    expect(document.body.textContent).not.toContain("hidden internal detail");
  });
});
