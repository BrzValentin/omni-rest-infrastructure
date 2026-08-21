"use client";

import Image from "next/image";
import type { MouseEvent } from "react";
import { useEffect, useState, useSyncExternalStore } from "react";

import { formatPrice } from "@/lib/format-price";
import type { PublicBadge, PublicCategory, PublicDish, PublicMedia } from "@/lib/menu-contract";
import { message } from "@/lib/menu-messages";

export type DesignMenuClasses = Readonly<{
  browser: string;
  categoryNav: string;
  categoryStrip: string;
  categoryLink: string;
  panels: string;
  panel: string;
  categoryHeading: string;
  emptyCategory: string;
  dishGrid: string;
  dishCard: string;
  unavailableCard: string;
  mediaFrame: string;
  mediaPlaceholder: string;
  dishBody: string;
  dishHeading: string;
  price: string;
  unavailable: string;
  description: string;
  badges: string;
  badge: string;
  allergenBadge: string;
}>;

type DesignMenuBrowserProps = Readonly<{
  categories: readonly PublicCategory[];
  locale: string;
  currency: string;
  classes: DesignMenuClasses;
}>;

const selectionEvent = "menu-selection";
const subscribeToHydration = () => () => undefined;
const hydratedSnapshot = () => true;
const serverHydratedSnapshot = () => false;
const locationSnapshot = () => window.location.hash;
const serverLocationSnapshot = () => "";

const badgeRegistry: Readonly<Record<string, string>> = {
  vegetarian: "menu.badge.vegetarian",
  vegan: "menu.badge.vegan",
  gluten_free: "menu.badge.glutenFree",
  dairy_free: "menu.badge.dairyFree",
  halal: "menu.badge.halal",
  spicy: "menu.badge.spicy",
  contains_nuts: "menu.badge.containsNuts",
  popular: "menu.badge.popular",
  new: "menu.badge.new",
};

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

export function DesignMenuBrowser({ categories, locale, currency, classes }: DesignMenuBrowserProps) {
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
    <div className={classes.browser} data-enhanced={enhanced ? "true" : "false"}>
      {categories.length > 1 ? (
        <nav className={classes.categoryNav} aria-label={message("categories")}>
          <div className={classes.categoryStrip}>
            {categories.map((category) => {
              const selected = selectedSlug === category.slug;
              return (
                <a
                  className={classes.categoryLink}
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

      <div className={classes.panels}>
        {categories.map((category, categoryIndex) => (
          <section
            className={classes.panel}
            id={`category-panel-${category.id}`}
            key={category.id}
            aria-labelledby={`category-heading-${category.id}`}
            hidden={enhanced && selectedSlug !== category.slug}
          >
            <div className={classes.categoryHeading} id={category.slug}>
              <h2 id={`category-heading-${category.id}`}>{category.name}</h2>
              {category.description ? <p>{category.description}</p> : null}
            </div>
            {category.dishes.length === 0 ? (
              <p className={classes.emptyCategory} role="status">{message("emptyCategory")}</p>
            ) : (
              <div className={classes.dishGrid}>
                {category.dishes.map((dish, dishIndex) => (
                  <DesignDish
                    classes={classes}
                    currency={currency}
                    dish={dish}
                    key={dish.id}
                    locale={locale}
                    eager={categoryIndex === 0 && dishIndex === 0}
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

function DesignDish({
  dish,
  locale,
  currency,
  classes,
  eager,
}: Readonly<{
  dish: PublicDish;
  locale: string;
  currency: string;
  classes: DesignMenuClasses;
  eager: boolean;
}>) {
  const unavailable = dish.availability === "unavailable";
  const headingId = `dish-${dish.id}`;
  const unavailableId = `dish-status-${dish.id}`;
  return (
    <article
      className={`${classes.dishCard} ${unavailable ? classes.unavailableCard : ""}`}
      aria-labelledby={headingId}
      aria-describedby={unavailable ? unavailableId : undefined}
    >
      <DesignDishMedia classes={classes} dishName={dish.name} media={dish.media} eager={eager} />
      <div className={classes.dishBody}>
        <div className={classes.dishHeading}>
          <h3 id={headingId}>{dish.name}</h3>
          <p className={classes.price}>{formatPrice(dish.price, locale, currency)}</p>
        </div>
        {unavailable ? <p className={classes.unavailable} id={unavailableId} role="status">{message("unavailable")}</p> : null}
        {dish.description ? <p className={classes.description}>{dish.description}</p> : null}
        <DesignBadges badges={dish.badges} classes={classes} />
      </div>
    </article>
  );
}

function DesignDishMedia({
  media,
  dishName,
  classes,
  eager,
}: Readonly<{
  media: PublicMedia | null;
  dishName: string;
  classes: DesignMenuClasses;
  eager: boolean;
}>) {
  const [failed, setFailed] = useState(false);
  const variant = media?.variants.reduce<PublicMedia["variants"][number] | null>(
    (largest, item) => (!largest || item.width > largest.width ? item : largest),
    null,
  );
  if (!variant || failed) {
    return <div className={classes.mediaPlaceholder} role="img" aria-label={`${dishName}: ${message("imageUnavailable")}`}><span aria-hidden="true">◇</span></div>;
  }
  return (
    <div className={classes.mediaFrame} style={{ aspectRatio: `${variant.width} / ${variant.height}` }}>
      <Image
        src={variant.url}
        alt={media?.altText ?? ""}
        width={variant.width}
        height={variant.height}
        sizes="(max-width: 48rem) calc(100vw - 2rem), 36rem"
        priority={eager}
        loading={eager ? "eager" : "lazy"}
        onError={() => setFailed(true)}
      />
    </div>
  );
}

function DesignBadges({ badges, classes }: Readonly<{ badges: readonly PublicBadge[]; classes: DesignMenuClasses }>) {
  const known = badges.flatMap((badge) => {
    const expectedKey = badgeRegistry[badge.code];
    return expectedKey && badge.labelKey === expectedKey ? [{ ...badge, label: message(expectedKey) }] : [];
  });
  if (known.length === 0) return null;
  return (
    <ul className={classes.badges} aria-label="Dish information">
      {known.map((badge) => (
        <li className={`${classes.badge} ${badge.category === "allergen" ? classes.allergenBadge : ""}`} key={badge.code}>
          {badge.label}
        </li>
      ))}
    </ul>
  );
}
