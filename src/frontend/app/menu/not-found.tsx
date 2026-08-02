import { PublicShell } from "@/components/PublicShell";
import { message } from "@/lib/menu-messages";

import styles from "@/components/menu/menu.module.css";

export default function RestaurantNotFound() {
  return (
    <PublicShell>
      <main className={styles.menuMain} id="main-content">
        <section className={styles.stateCard}>
          <h1>{message("unknownRestaurantTitle")}</h1>
          <p>{message("unknownRestaurantBody")}</p>
        </section>
      </main>
    </PublicShell>
  );
}
