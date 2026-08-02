import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import MenuError from "./error";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

describe("MenuError", () => {
  it("deduplicates repeated retry activation", async () => {
    const user = userEvent.setup();
    const reset = vi.fn();
    render(<MenuError error={new Error("hidden internal detail")} reset={reset} />);
    const retry = screen.getByRole("button", { name: "Try again" });
    await user.dblClick(retry);
    expect(reset).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledOnce();
    expect(screen.queryByText("hidden internal detail")).not.toBeInTheDocument();
  });
});
