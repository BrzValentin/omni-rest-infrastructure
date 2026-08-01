import Link from "next/link";
import styles from "../admin.module.css";

export default function AdminPage() {
  return (
    <main id="main-content" className={styles.adminMain}>
      <p className={styles.eyebrow}>Owner Portal</p>
      <h1>Owner Dashboard</h1>
      <p>Manage restaurant information and review publication status.</p>
      <Link className={styles.primaryLink} href="/admin/restaurant">Edit Restaurant</Link>
    </main>
  );
}
