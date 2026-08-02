"use client";

import type { MouseEvent } from "react";
import { useEffect, useSyncExternalStore } from "react";

import type { PublicCategory } from "@/lib/menu-contract";
import { message } from "@/lib/menu-messages";

import { DishCard } from "./DishCard";
import styles from "./menu.module.css";

type CategoryBrowserProps = Readonly<{
  categories: readonly PublicCategory[];
  locale: string;
  currency: string;
}>;

const selectionEvent = "menu-selection";
const subscribeToHydration = () => () => undefined;
const hydratedSnapshot = () => true;
const serverHydratedSnapshot = () => false;

function subscribeToLocation(callback: () => void) {
  window.addEventListener("hashchange", callback);
  window.addEventListener("popstate", callback);
  window.addEventListener(selectionEvent, callback);
  return () => {
    window.removeEventListener("hashchange", callback);
    window.removeEventListener("popstate", callback);
    window.removeEventListener(selectionEvent, callback);
  };
}

const locationSnapshot = () => window.location.hash;
const serverLocationSnapshot = () => "";

export function CategoryBrowser({ categories, locale, currency }: CategoryBrowserProps) {
  const enhanced = useSyncExternalStore(subscribeToHydration, hydratedSnapshot, serverHydratedSnapshot);
  const hash = useSyncExternalStore(subscribeToLocation, locationSnapshot, serverLocationSnapshot);
  const firstSlug = categories[0]?.slug ?? null;
  const requestedSlug = hash.startsWith("#") ? hash.slice(1) : "";
  const selectedSlug = categories.some((category) => category.slug === requestedSlug) ? requestedSlug : firstSlug;
  const invalidHash = requestedSlug.length > 0 && requestedSlug !== selectedSlug;

  useEffect(() => {
    if (!invalidHash) return;
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);
  }, [invalidHash]);

  function selectCategory(event: MouseEvent<HTMLAnchorElement>, slug: string) {
    event.preventDefault();
    if (window.location.hash !== `#${slug}`) {
      window.history.pushState({ category: slug }, "", `#${slug}`);
      window.dispatchEvent(new Event(selectionEvent));
    }
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    event.currentTarget.scrollIntoView({ behavior, block: "nearest", inline: "center" });
  }

  return (
    <div className={styles.categoryBrowser} data-enhanced={enhanced ? "true" : "false"}>
      {categories.length > 1 ? (
        <nav className={styles.categoryNav} aria-label={message("categories")}>
          <div className={styles.categoryStrip}>
            {categories.map((category) => {
              const selected = selectedSlug === category.slug;
              return (
                <a
                  className={styles.categoryLink}
                  data-selected={enhanced && selected ? "true" : "false"}
                  aria-current={enhanced && selected ? "true" : undefined}
                  aria-controls={`category-panel-${category.id}`}
                  href={`#${category.slug}`}
                  key={category.id}
                  onClick={(event) => selectCategory(event, category.slug)}
                >
                  {category.name}
                </a>
              );
            })}
          </div>
        </nav>
      ) : null}

      <div className={styles.categoryPanels}>
        {categories.map((category, categoryIndex) => (
          <section
            className={styles.categoryPanel}
            id={`category-panel-${category.id}`}
            key={category.id}
            aria-labelledby={`category-heading-${category.id}`}
            hidden={enhanced && selectedSlug !== category.slug}
          >
            <div className={styles.categoryHeading} id={category.slug}>
              <h2 id={`category-heading-${category.id}`}>{category.name}</h2>
              {category.description ? <p>{category.description}</p> : null}
            </div>
            {category.dishes.length === 0 ? (
              <p className={styles.emptyCategory} role="status">
                {message("emptyCategory")}
              </p>
            ) : (
              <div className={styles.dishGrid}>
                {category.dishes.map((dish, dishIndex) => (
                  <DishCard
                    currency={currency}
                    dish={dish}
                    key={dish.id}
                    locale={locale}
                    priority={categoryIndex === 0 && dishIndex === 0}
                  />
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
