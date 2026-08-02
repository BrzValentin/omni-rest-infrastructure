import { render, screen } from "@testing-library/react";
import axe from "axe-core";
import { describe, expect, it } from "vitest";
import { CallButton } from "./CallButton";
import { PhoneLink } from "./PhoneLink";

describe("phone components", () => {
  it("renders a native telephone anchor from canonical E.164 and visible display text", () => {
    render(<CallButton e164="+12045550123" display="(204) 555-0123" />);
    const link = screen.getByRole("link", { name: "Call (204) 555-0123" });
    expect(link).toHaveAttribute("href", "tel:+12045550123");
    expect(link).toHaveTextContent("Call (204) 555-0123");
  });

  it("omits the anchor for missing or invalid canonical numbers", () => {
    const { rerender } = render(<PhoneLink e164={null}>Call</PhoneLink>);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    rerender(<PhoneLink e164="204-555-0123">Call</PhoneLink>);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("has no detectable axe violations", async () => {
    const { container } = render(<CallButton e164="+12045550123" display="(204) 555-0123" variant="compact" />);
    expect((await axe.run(container)).violations).toEqual([]);
  });
});
