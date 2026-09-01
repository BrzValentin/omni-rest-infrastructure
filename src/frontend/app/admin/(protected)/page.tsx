import Link from "next/link";
import { readAdminRestaurant } from "@/lib/admin-data";
import styles from "../admin.module.css";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const restaurant = await readAdminRestaurant();
  return (
    <main id="main-content" className={styles.adminMain}>
      <p className={styles.eyebrow}>Owner Portal</p>
      <h1>{restaurant ? restaurant.name : "Owner Dashboard"}</h1>
      <p>Manage this restaurant&apos;s information and review publication status.</p>
      <Link className={styles.primaryLink} href="/admin/restaurant">Edit My Restaurant</Link>
    </main>
  );
}
