import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminMutation, AdminRestaurant } from "@/lib/restaurant-contract";
import { BrowserApiError } from "@/lib/browser-api";
import { DesignSelector } from "./DesignSelector";

const mocks = vi.hoisted(() => ({ browserGet: vi.fn(), mutate: vi.fn() }));
vi.mock("@/lib/browser-api", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/browser-api")>(),
  browserGet: mocks.browserGet,
  mutate: mocks.mutate,
}));

const designs: AdminRestaurant["websiteDesigns"] = [
  { id: "legacy-current-v1", name: "Current design", contractVersion: "1", availability: "grandfathered" },
  { id: "quiet-elegance-v1", name: "Quiet Elegance", contractVersion: "1", availability: "available" },
  { id: "nightfall-v1", name: "Nightfall", contractVersion: "1", availability: "available" },
  { id: "broadsheet-v1", name: "Broadsheet", contractVersion: "1", availability: "available" },
  { id: "sunroom-v1", name: "Sunroom", contractVersion: "1", availability: "available" },
];

const initial: AdminRestaurant = {
  id: "restaurant",
  name: "Prairie Table",
  description: "Seasonal",
  phoneE164: null,
  phoneDisplay: null,
  email: null,
  timeZone: "America/Winnipeg",
  address: null,
  regularHours: [],
  specialHours: [],
  socialLinks: [],
  mainImage: null,
  draftDesignId: "legacy-current-v1",
  publishedDesignId: "legacy-current-v1",
  websiteDesigns: designs,
  draftVersion: "3",
  eTag: '"draft-3"',
  publicationStatus: null,
};

describe("DesignSelector", () => {
  beforeEach(() => {
    mocks.browserGet.mockReset();
    mocks.mutate.mockReset();
    const restaurant = {
      ...initial,
      draftDesignId: "nightfall-v1" as const,
      draftVersion: "4",
      eTag: '"draft-4"',
    };
    const publication = {
      operationId: "operation",
      status: "pending",
      draftVersion: "4",
      attemptCount: 0,
      errorCode: null,
      updatedAt: "2026-08-20T12:00:00Z",
    };
    mocks.mutate.mockResolvedValue({ restaurant, publication } satisfies AdminMutation);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps selection transient until explicit confirmation and exposes four designs", async () => {
    const user = userEvent.setup();
    const { container } = render(<DesignSelector initial={initial} />);

    for (const name of ["Quiet Elegance", "Nightfall", "Broadsheet", "Sunroom"]) {
      expect(screen.getAllByRole("heading", { name }).length).toBeGreaterThanOrEqual(1);
    }
    expect(screen.getAllByText("Current design").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTitle("Quiet Elegance home draft preview")).toHaveAttribute(
      "src",
      "/admin/design-preview/quiet-elegance-v1/home",
    );

    await user.click(screen.getByRole("button", { name: "Select Nightfall" }));
    expect(screen.getByTitle("Nightfall home draft preview")).toHaveAttribute(
      "src",
      "/admin/design-preview/nightfall-v1/home",
    );
    expect(mocks.mutate).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Menu" }));
    expect(screen.getByTitle("Nightfall menu draft preview")).toHaveAttribute(
      "src",
      "/admin/design-preview/nightfall-v1/menu",
    );
    await user.click(screen.getByRole("button", { name: "Mobile" }));
    expect(mocks.mutate).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Use this design" }));
    expect(screen.getByRole("alertdialog", { name: "Publish Nightfall?" })).toBeVisible();
    expect(mocks.mutate).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Confirm and publish" }));

    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith(
      "/api/v1/admin/restaurant/design",
      "PUT",
      { designId: "nightfall-v1" },
      '"draft-3"',
    ));
    expect(await screen.findByText(/current website stays unchanged/)).toBeVisible();
    container.querySelector("iframe")?.remove();
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it("cancels confirmation without mutating", async () => {
    const user = userEvent.setup();
    render(<DesignSelector initial={initial} />);
    await user.click(screen.getByRole("button", { name: "Use this design" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it("retries the existing failed publication without creating another design mutation", async () => {
    const user = userEvent.setup();
    const failed: AdminRestaurant = {
      ...initial,
      draftDesignId: "nightfall-v1",
      publicationStatus: {
        operationId: "failed-operation",
        status: "failed",
        draftVersion: "4",
        attemptCount: 1,
        errorCode: "publication_dispatch_failed",
        updatedAt: "2026-08-20T12:00:00Z",
      },
    };
    mocks.mutate.mockResolvedValueOnce({
      ...failed.publicationStatus!,
      status: "succeeded",
      attemptCount: 2,
      errorCode: null,
    });
    render(<DesignSelector initial={failed} />);

    await user.click(screen.getByRole("button", { name: "Retry publish" }));
    expect(screen.getByRole("alertdialog", { name: "Retry publication for Nightfall?" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Retry publication" }));

    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith(
      "/api/v1/admin/publication-status/failed-operation/retry",
      "POST",
      {},
    ));
    expect(mocks.mutate).not.toHaveBeenCalledWith(
      "/api/v1/admin/restaurant/design",
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
    expect(await screen.findByText("Nightfall is now published.")).toBeVisible();
    expect(screen.getByText("Published:").parentElement).toHaveTextContent("Nightfall");
  });

  it("keeps the last published design and gives reload guidance when retry was superseded", async () => {
    const user = userEvent.setup();
    const failed: AdminRestaurant = {
      ...initial,
      draftDesignId: "nightfall-v1",
      draftVersion: "4",
      publicationStatus: {
        operationId: "superseded-operation",
        status: "failed",
        draftVersion: "4",
        attemptCount: 1,
        errorCode: "publication_dispatch_failed",
        updatedAt: "2026-08-20T12:00:00Z",
      },
    };
    mocks.mutate.mockRejectedValueOnce(new BrowserApiError(409, {
      code: "publication_retry_superseded",
      title: "Superseded",
    }));
    render(<DesignSelector initial={failed} />);

    await user.click(screen.getByRole("button", { name: "Retry publish" }));
    await user.click(screen.getByRole("button", { name: "Retry publication" }));

    expect(await screen.findByText(/superseded by newer restaurant changes/i)).toBeVisible();
    expect(screen.getByText("Published:").parentElement).toHaveTextContent("Current design");
    expect(mocks.mutate).toHaveBeenCalledWith(
      "/api/v1/admin/publication-status/superseded-operation/retry",
      "POST",
      {},
    );
    expect(mocks.mutate).not.toHaveBeenCalledWith(
      "/api/v1/admin/restaurant/design",
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it("polls pending through processing to success and locks every design change in flight", async () => {
    vi.useFakeTimers();
    const pending: AdminRestaurant = {
      ...initial,
      draftDesignId: "nightfall-v1",
      draftVersion: "4",
      publicationStatus: {
        operationId: "polled-operation",
        status: "pending",
        draftVersion: "4",
        attemptCount: 0,
        errorCode: null,
        updatedAt: "2026-08-20T12:00:00Z",
      },
    };
    const processing = {
      ...pending.publicationStatus!,
      status: "processing",
      attemptCount: 1,
      updatedAt: "2026-08-20T12:00:01Z",
    };
    const succeeded = {
      ...processing,
      status: "succeeded",
      updatedAt: "2026-08-20T12:00:02Z",
    };
    mocks.browserGet
      .mockResolvedValueOnce(processing)
      .mockResolvedValueOnce(succeeded);

    render(<DesignSelector initial={pending} />);

    expect(screen.getByText("Publication status:").parentElement).toHaveTextContent("Pending");
    expect(screen.getByRole("button", { name: "Select Quiet Elegance" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Publication pending" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reset selection" })).toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(mocks.browserGet).toHaveBeenLastCalledWith(
      "/api/v1/admin/publication-status/polled-operation",
    );
    expect(screen.getByText("Publication status:").parentElement).toHaveTextContent("Processing");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(screen.getByText("Publication status:").parentElement).toHaveTextContent("Succeeded");
    expect(screen.getByText("Published:").parentElement).toHaveTextContent("Nightfall");
    expect(screen.getByRole("button", { name: "Select Quiet Elegance" })).toBeEnabled();
    expect(mocks.browserGet).toHaveBeenCalledTimes(2);
  });

  it("announces the matching legacy draft rather than the transient selectable candidate", async () => {
    vi.useFakeTimers();
    const pendingLegacy: AdminRestaurant = {
      ...initial,
      publicationStatus: {
        operationId: "legacy-operation",
        status: "pending",
        draftVersion: "3",
        attemptCount: 1,
        errorCode: null,
        updatedAt: "2026-08-20T12:00:00Z",
      },
    };
    mocks.browserGet.mockResolvedValueOnce({
      ...pendingLegacy.publicationStatus!,
      status: "succeeded",
      updatedAt: "2026-08-20T12:00:01Z",
    });

    render(<DesignSelector initial={pendingLegacy} />);
    expect(screen.getByTitle("Quiet Elegance home draft preview")).toBeVisible();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });

    expect(screen.getByText("Current design is now published.")).toBeVisible();
    expect(screen.queryByText("Quiet Elegance is now published.")).not.toBeInTheDocument();
    expect(screen.getByText("Published:").parentElement).toHaveTextContent("Current design");
  });

  it("polls pending to failure and safely retries the same operation without another design PUT", async () => {
    vi.useFakeTimers();
    const pending: AdminRestaurant = {
      ...initial,
      draftDesignId: "nightfall-v1",
      draftVersion: "4",
      publicationStatus: {
        operationId: "retry-polled-operation",
        status: "pending",
        draftVersion: "4",
        attemptCount: 1,
        errorCode: null,
        updatedAt: "2026-08-20T12:00:00Z",
      },
    };
    const failed = {
      ...pending.publicationStatus!,
      status: "failed",
      errorCode: "publication_dispatch_failed",
      updatedAt: "2026-08-20T12:00:01Z",
    };
    const retried = {
      ...failed,
      status: "processing",
      attemptCount: 2,
      errorCode: null,
      updatedAt: "2026-08-20T12:00:02Z",
    };
    mocks.browserGet.mockResolvedValueOnce(failed);
    mocks.mutate.mockResolvedValueOnce(retried);

    render(<DesignSelector initial={pending} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });

    expect(screen.getByText("Publication status:").parentElement).toHaveTextContent("Failed");
    expect(screen.getByText(/last successful design remains public/i)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Retry publish" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Retry publication" }));
      await Promise.resolve();
    });

    expect(mocks.mutate).toHaveBeenCalledWith(
      "/api/v1/admin/publication-status/retry-polled-operation/retry",
      "POST",
      {},
    );
    expect(mocks.mutate).not.toHaveBeenCalledWith(
      "/api/v1/admin/restaurant/design",
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
    expect(screen.getByText("Publication status:").parentElement).toHaveTextContent("Processing");
    expect(screen.getByRole("button", { name: "Publication pending" })).toBeDisabled();
  });
});
