import { PublicShell } from "@/components/PublicShell";
import { StateCard } from "@/components/state/StateCard";
import { message } from "@/lib/menu-messages";

/**
 * Shown when this address resolves to no public restaurant at all — a different statement from the
 * root 404, which only says the path is unknown. Retrying cannot change either answer, so neither
 * card offers it.
 */
export default function RestaurantNotFound() {
  return (
    <PublicShell>
      <main className="publicMenuMain" id="main-content">
        <StateCard
          variant="notFound"
          title={message("unknownRestaurantTitle")}
          body={message("unknownRestaurantBody")}
        />
      </main>
    </PublicShell>
  );
}
