"use client";

import type { PublicBadge } from "@/lib/menu-contract";
import { message } from "@/lib/menu-messages";

import styles from "./menu.module.css";

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

const warnedUnknownCodes = new Set<string>();

export function BadgeList({ badges }: Readonly<{ badges: readonly PublicBadge[] }>) {
  const known = badges.flatMap((badge) => {
    const expectedKey = badgeRegistry[badge.code];
    if (!expectedKey || badge.labelKey !== expectedKey) {
      if (typeof window !== "undefined" && !warnedUnknownCodes.has(badge.code)) {
        warnedUnknownCodes.add(badge.code);
        console.warn(`Unknown public menu badge omitted: ${badge.code}`);
      }
      return [];
    }
    return [{ ...badge, label: message(expectedKey) }];
  });

  if (known.length === 0) return null;
  return (
    <ul className={styles.badges} aria-label="Dish information">
      {known.map((badge) => (
        <li
          className={`${styles.badge} ${badge.category === "allergen" ? styles.allergenBadge : ""}`}
          key={badge.code}
        >
          {badge.label}
        </li>
      ))}
    </ul>
  );
}
