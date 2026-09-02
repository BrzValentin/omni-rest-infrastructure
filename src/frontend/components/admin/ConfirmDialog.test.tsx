import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";

/** A host that opens the dialog the way every editor does: from a button in the page behind it. */
function Host({ onConfirm = () => {} }: { onConfirm?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <main>
      <button type="button" onClick={() => setOpen(true)}>Delete Starters</button>
      <input aria-label="Behind the dialog" />
      {open && (
        <ConfirmDialog
          idPrefix="delete-category"
          title="Delete “Starters”?"
          description="This removes the category from the draft menu and publishes immediately."
          onCancel={() => setOpen(false)}
          onConfirm={() => { setOpen(false); onConfirm(); }}
        />
      )}
    </main>
  );
}

describe("ConfirmDialog", () => {
  it("announces itself as an alert dialog with its title and description", async () => {
    const user = userEvent.setup();
    const { container } = render(<Host />);

    await user.click(screen.getByRole("button", { name: "Delete Starters" }));

    const dialog = screen.getByRole("alertdialog", { name: "Delete “Starters”?" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "delete-category-title");
    expect(dialog).toHaveAttribute("aria-describedby", "delete-category-description");
    expect(within(dialog).getByText(/publishes immediately/)).toBeVisible();
    expect((await axe.run(dialog, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    expect(container).toHaveAttribute("inert");
  });

  it("traps focus, hides the page behind it, and restores both on close", async () => {
    const user = userEvent.setup();
    const { container } = render(<Host />);
    const trigger = screen.getByRole("button", { name: "Delete Starters" });

    await user.click(trigger);
    const dialog = screen.getByRole("alertdialog");
    const cancel = within(dialog).getByRole("button", { name: "Cancel" });
    const confirm = within(dialog).getByRole("button", { name: "Confirm delete" });
    expect(cancel).toHaveFocus();
    expect(container).toHaveAttribute("inert");
    expect(container).toHaveAttribute("aria-hidden", "true");

    await user.keyboard("{Tab}");
    expect(confirm).toHaveFocus();
    await user.keyboard("{Tab}");
    expect(cancel).toHaveFocus();
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(confirm).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(container).not.toHaveAttribute("inert");
    expect(container).not.toHaveAttribute("aria-hidden");
  });

  it("cancels without confirming, and confirms only on the confirm button", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Host onConfirm={onConfirm} />);

    await user.click(screen.getByRole("button", { name: "Delete Starters" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onConfirm).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Delete Starters" }));
    await user.click(screen.getByRole("button", { name: "Confirm delete" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("takes its own wording for a dialog that is not a deletion", async () => {
    const user = userEvent.setup();
    render(
      <ConfirmDialog
        idPrefix="discard-draft"
        title="Discard this draft?"
        description="Your unsaved edits are dropped."
        cancelLabel="Keep editing"
        confirmLabel="Discard"
        onCancel={() => {}}
        onConfirm={() => {}}
      />,
    );

    const dialog = screen.getByRole("alertdialog", { name: "Discard this draft?" });
    expect(within(dialog).getByRole("button", { name: "Keep editing" })).toHaveFocus();
    await user.keyboard("{Tab}");
    expect(within(dialog).getByRole("button", { name: "Discard" })).toHaveFocus();
  });
});
