import type { PublicDish } from "@/lib/menu-contract";
import { formatPrice } from "@/lib/format-price";
import { message } from "@/lib/menu-messages";

import { BadgeList } from "./BadgeList";
import { DishMedia } from "./DishMedia";
import styles from "./menu.module.css";

type DishCardProps = Readonly<{
  dish: PublicDish;
  locale: string;
  currency: string;
  priority?: boolean;
}>;

export function DishCard({ dish, locale, currency, priority = false }: DishCardProps) {
  const headingId = `dish-${dish.id}`;
  const unavailableId = `dish-status-${dish.id}`;
  const unavailable = dish.availability === "unavailable";

  return (
    <article
      className={`${styles.dishCard} ${unavailable ? styles.unavailableCard : ""}`}
      aria-describedby={unavailable ? unavailableId : undefined}
      aria-labelledby={headingId}
    >
      <DishMedia dishName={dish.name} media={dish.media} priority={priority} />
      <div className={styles.dishBody}>
        <div className={styles.dishHeadingRow}>
          <h3 id={headingId}>{dish.name}</h3>
          <p className={styles.price}>{formatPrice(dish.price, locale, currency)}</p>
        </div>
        {unavailable ? (
          <p className={styles.unavailable} id={unavailableId} role="status">
            {message("unavailable")}
          </p>
        ) : null}
        {dish.description ? <p className={styles.description}>{dish.description}</p> : null}
        <BadgeList badges={dish.badges} />
      </div>
    </article>
  );
}
