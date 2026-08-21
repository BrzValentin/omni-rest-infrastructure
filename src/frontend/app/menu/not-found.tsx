import { PublicShell } from "@/components/PublicShell";
import { message } from "@/lib/menu-messages";

export default function RestaurantNotFound() {
  return (
    <PublicShell>
      <main className="publicMenuMain" id="main-content">
        <section className="publicStateCard">
          <h1>{message("unknownRestaurantTitle")}</h1>
          <p>{message("unknownRestaurantBody")}</p>
        </section>
      </main>
    </PublicShell>
  );
}
