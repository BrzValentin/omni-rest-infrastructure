"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

import styles from "@/app/admin/admin.module.css";
import {
  selectableWebsiteDesignIds,
  websiteDesignMetadata,
  type SelectableWebsiteDesignId,
} from "@/components/designs/catalog";
import { BrowserApiError, browserGet, mutate } from "@/lib/browser-api";
import type {
  AdminMutation,
  AdminRestaurant,
  PublicationStatus,
} from "@/lib/restaurant-contract";
import { DesignThumbnail } from "./DesignThumbnail";

type PreviewPage = "home" | "menu";
type PreviewWidth = "desktop" | "mobile";
const publicationPollDelay = 2500;
const publicationPollRetryDelay = 5000;

function isPublicationInFlight(status: PublicationStatus | null): boolean {
  return status?.status === "pending" || status?.status === "processing";
}

function publicationStatusLabel(status: string): string {
  return status.length === 0 ? "Unknown" : `${status[0].toUpperCase()}${status.slice(1)}`;
}

export function DesignSelector({ initial }: Readonly<{ initial: AdminRestaurant }>) {
  const [restaurant, setRestaurant] = useState(initial);
  const availableDesignIds = initial.websiteDesigns.flatMap((design) =>
    design.availability === "available" &&
    selectableWebsiteDesignIds.includes(design.id as SelectableWebsiteDesignId)
      ? [design.id as SelectableWebsiteDesignId]
      : [],
  );
  const initialCandidate = availableDesignIds.includes(
    initial.draftDesignId as SelectableWebsiteDesignId,
  )
    ? initial.draftDesignId as SelectableWebsiteDesignId
    : availableDesignIds[0] ?? selectableWebsiteDesignIds[0];
  const [candidate, setCandidate] = useState<SelectableWebsiteDesignId>(initialCandidate);
  const [previewPage, setPreviewPage] = useState<PreviewPage>("home");
  const [previewWidth, setPreviewWidth] = useState<PreviewWidth>("desktop");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [pollNotice, setPollNotice] = useState<string | null>(null);
  const candidateMetadata = websiteDesignMetadata[candidate];
  const publishedMetadata = websiteDesignMetadata[restaurant.publishedDesignId];
  const unpublishedCandidate =
    candidate === restaurant.draftDesignId &&
    candidate !== restaurant.publishedDesignId;
  const confirmationMode =
    unpublishedCandidate && restaurant.publicationStatus?.status === "failed"
      ? "retry"
      : "publish";
  const publicationInFlight = isPublicationInFlight(restaurant.publicationStatus);
  const publicationDraftName = websiteDesignMetadata[restaurant.draftDesignId].name;
  const noChange =
    candidate === restaurant.draftDesignId &&
    candidate === restaurant.publishedDesignId;

  useEffect(() => {
    const operationId = restaurant.publicationStatus?.operationId;
    if (!operationId || !publicationInFlight) return;

    let stopped = false;
    let timer: number | undefined;
    const schedule = (delay: number) => {
      timer = window.setTimeout(() => void poll(), delay);
    };
    const poll = async () => {
      try {
        const status = await browserGet<PublicationStatus>(
          `/api/v1/admin/publication-status/${encodeURIComponent(operationId)}`,
        );
        if (stopped) return;
        setPollNotice(null);
        setRestaurant((current) => {
          if (current.publicationStatus?.operationId !== operationId) return current;
          const publishesCurrentDraft =
            status.status === "succeeded" &&
            status.draftVersion === current.draftVersion;
          return {
            ...current,
            publishedDesignId: publishesCurrentDraft
              ? current.draftDesignId
              : current.publishedDesignId,
            publicationStatus: status,
          };
        });
        if (status.status === "succeeded") {
          setNotice(
            status.draftVersion === restaurant.draftVersion
              ? `${publicationDraftName} is now published.`
              : "An older publication completed. Reload this page to see the latest design status.",
          );
        } else if (status.status === "failed") {
          setNotice("Publication failed. The last successful design remains public, and retry is safe.");
        } else if (isPublicationInFlight(status)) {
          schedule(publicationPollDelay);
        }
      } catch {
        if (stopped) return;
        setPollNotice("Publication status is temporarily unavailable. Checking again automatically.");
        schedule(publicationPollRetryDelay);
      }
    };

    schedule(publicationPollDelay);
    return () => {
      stopped = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [
    publicationInFlight,
    publicationDraftName,
    restaurant.draftVersion,
    restaurant.publicationStatus?.operationId,
  ]);

  async function applyDesign() {
    if (publicationInFlight) return;
    setBusy(true);
    setNotice(null);
    setPollNotice(null);
    try {
      if (confirmationMode === "retry") {
        const operationId = restaurant.publicationStatus?.operationId;
        if (!operationId) {
          setNotice("The failed publication could not be identified. Reload this page before trying again.");
          setConfirming(false);
          return;
        }
        const status = await mutate<PublicationStatus>(
          `/api/v1/admin/publication-status/${encodeURIComponent(operationId)}/retry`,
          "POST",
          {},
        );
        if (status) {
          setRestaurant((current) => ({
            ...current,
            publishedDesignId:
              status.status === "succeeded"
                ? current.draftDesignId
                : current.publishedDesignId,
            publicationStatus: status,
          }));
          setNotice(
            status.status === "succeeded"
              ? `${websiteDesignMetadata[restaurant.draftDesignId].name} is now published.`
              : `Publication is ${status.status}. The last successful design remains public while it completes.`,
          );
        }
        setConfirming(false);
        return;
      }
      const result = await mutate<AdminMutation>(
        "/api/v1/admin/restaurant/design",
        "PUT",
        { designId: candidate },
        restaurant.eTag,
      );
      if (result) {
        setRestaurant({
          ...result.restaurant,
          publishedDesignId:
            result.publication.status === "succeeded"
              ? result.restaurant.draftDesignId
              : result.restaurant.publishedDesignId,
          publicationStatus: result.publication,
        });
        setNotice(
          `${candidateMetadata.name} saved as the draft design. Publication is ${result.publication.status}; the current website stays unchanged until publication succeeds.`,
        );
      }
      setConfirming(false);
    } catch (error) {
      if (
        error instanceof BrowserApiError &&
        error.status === 409 &&
        error.problem.code === "publication_retry_superseded"
      ) {
        setNotice(
          "This publication was superseded by newer restaurant changes. Reload this page before publishing again; the last successful design is still public.",
        );
      } else if (error instanceof BrowserApiError && error.status === 409) {
        setNotice("The restaurant changed elsewhere. Reload this page before trying again.");
      } else {
        setNotice("The design could not be published. Your selection is still here, and the current website is unchanged. Try again.");
      }
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.designMain} id="main-content">
      <header className={styles.designHeading}>
        <div>
          <p className={styles.eyebrow}>Website appearance</p>
          <h1>Choose a design</h1>
          <p>Select and preview with your draft restaurant and menu content. Nothing changes publicly until you confirm and publication succeeds.</p>
        </div>
        <a className={styles.secondaryButton} href="/" target="_blank" rel="noreferrer">View website</a>
      </header>

      <section className={styles.designStatus} aria-label="Design status">
        <p><strong>Published:</strong> {publishedMetadata.name}</p>
        <p><strong>Draft:</strong> {websiteDesignMetadata[restaurant.draftDesignId].name}</p>
        {restaurant.draftDesignId !== restaurant.publishedDesignId ? (
          <p>The draft and public website differ. A failed or pending publication never replaces the last successful design.</p>
        ) : null}
        {restaurant.publicationStatus ? (
          <p role="status" aria-live="polite">
            <strong>Publication status:</strong>{" "}
            {publicationStatusLabel(restaurant.publicationStatus.status)}.
            {" "}Attempts: {restaurant.publicationStatus.attemptCount}.
          </p>
        ) : null}
        {pollNotice ? <p role="status" aria-live="polite">{pollNotice}</p> : null}
        {notice ? <p role="status" aria-live="polite">{notice}</p> : null}
      </section>

      <div className={styles.designWorkspace}>
        <section aria-labelledby="design-list-title">
          <h2 id="design-list-title">Designs</h2>
          <div className={styles.designGrid}>
            {availableDesignIds.map((designId) => {
              const metadata = websiteDesignMetadata[designId];
              const selected = designId === candidate;
              const published = designId === restaurant.publishedDesignId;
              return (
                <article className={styles.designCard} data-selected={selected ? "true" : "false"} key={designId}>
                  <DesignThumbnail tone={metadata.tone} />
                  <div className={styles.designCardBody}>
                    <div className={styles.designCardTitle}>
                      <h3>{metadata.name}</h3>
                      {published ? <span className={styles.publishedBadge}>Published</span> : null}
                    </div>
                    <p>{metadata.description}</p>
                    <button
                      className={selected ? styles.primaryButton : styles.secondaryButton}
                      type="button"
                      aria-pressed={selected}
                      disabled={busy || publicationInFlight}
                      onClick={() => {
                        setCandidate(designId);
                        setNotice(null);
                      }}
                    >
                      {selected ? "Selected" : `Select ${metadata.name}`}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className={styles.designPreviewSection} aria-labelledby="design-preview-title">
          <div className={styles.designPreviewToolbar}>
            <div>
              <p className={styles.eyebrow}>Draft preview</p>
              <h2 id="design-preview-title">{candidateMetadata.name}</h2>
            </div>
            <fieldset>
              <legend>Page</legend>
              <button type="button" aria-pressed={previewPage === "home"} onClick={() => setPreviewPage("home")}>Home</button>
              <button type="button" aria-pressed={previewPage === "menu"} onClick={() => setPreviewPage("menu")}>Menu</button>
            </fieldset>
            <fieldset>
              <legend>Viewport</legend>
              <button type="button" aria-pressed={previewWidth === "desktop"} onClick={() => setPreviewWidth("desktop")}>Desktop</button>
              <button type="button" aria-pressed={previewWidth === "mobile"} onClick={() => setPreviewWidth("mobile")}>Mobile</button>
            </fieldset>
          </div>
          <div className={`${styles.designPreviewFrame} ${previewWidth === "mobile" ? styles.designPreviewMobile : styles.designPreviewDesktop}`}>
            <iframe
              key={`${candidate}-${previewPage}`}
              src={`/admin/design-preview/${encodeURIComponent(candidate)}/${previewPage}`}
              title={`${candidateMetadata.name} ${previewPage} draft preview`}
            />
          </div>
          <div className={styles.designActionRow}>
            <button
              className={styles.primaryButton}
              type="button"
              disabled={busy || noChange || publicationInFlight}
              onClick={() => setConfirming(true)}
            >
              {confirmationMode === "retry"
                ? "Retry publish"
                : publicationInFlight
                  ? "Publication pending"
                  : "Use this design"}
            </button>
            <button
              className={styles.secondaryButton}
              type="button"
              disabled={busy || publicationInFlight}
              onClick={() => {
                setCandidate(initialCandidate);
                setNotice("Selection reset. No public change was made.");
              }}
            >
              Reset selection
            </button>
          </div>
        </section>
      </div>

      {confirming ? (
        <ConfirmDesignDialog
          designName={candidateMetadata.name}
          mode={confirmationMode}
          busy={busy}
          onCancel={() => setConfirming(false)}
          onConfirm={() => void applyDesign()}
        />
      ) : null}
    </main>
  );
}

function ConfirmDesignDialog({
  designName,
  mode,
  busy,
  onCancel,
  onConfirm,
}: Readonly<{
  designName: string;
  mode: "publish" | "retry";
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}>) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const background = Array.from(document.body.children)
      .filter((element) => !element.contains(dialog))
      .map((element) => ({
        element: element as HTMLElement,
        inert: element.hasAttribute("inert"),
        ariaHidden: element.getAttribute("aria-hidden"),
      }));
    for (const item of background) {
      item.element.setAttribute("inert", "");
      item.element.setAttribute("aria-hidden", "true");
    }
    cancelRef.current?.focus();
    return () => {
      for (const item of background) {
        if (!item.inert) item.element.removeAttribute("inert");
        if (item.ariaHidden === null) item.element.removeAttribute("aria-hidden");
        else item.element.setAttribute("aria-hidden", item.ariaHidden);
      }
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && !busy) {
      event.preventDefault();
      onCancel();
    }
    if (event.key !== "Tab") return;
    const buttons = Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? []);
    if (buttons.length === 0) return;
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.shiftKey
      ? (index <= 0 ? buttons.length - 1 : index - 1)
      : (index < 0 || index === buttons.length - 1 ? 0 : index + 1);
    event.preventDefault();
    buttons[next].focus();
  }

  return createPortal(
    <div className={styles.modalBackdrop}>
      <div
        className={styles.confirmation}
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-design-title"
        aria-describedby="confirm-design-description"
        onKeyDown={onKeyDown}
      >
        <h2 id="confirm-design-title">
          {mode === "retry" ? `Retry publication for ${designName}?` : `Publish ${designName}?`}
        </h2>
        <p id="confirm-design-description">
          {mode === "retry"
            ? "This safely retries the existing publication without creating another design change. The last successful website remains public if it fails again."
            : "This starts publication. The last successful website remains public if publication fails, and you can safely retry."}
        </p>
        <div className={styles.buttonRow}>
          <button ref={cancelRef} className={styles.secondaryButton} type="button" disabled={busy} onClick={onCancel}>Cancel</button>
          <button className={styles.primaryButton} type="button" disabled={busy} onClick={onConfirm}>
            {busy ? "Publishing…" : mode === "retry" ? "Retry publication" : "Confirm and publish"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
