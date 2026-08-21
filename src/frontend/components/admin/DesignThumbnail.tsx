import type { DesignPreviewTone } from "@/components/designs/catalog";
import styles from "@/app/admin/admin.module.css";

export function DesignThumbnail({ tone }: Readonly<{ tone: DesignPreviewTone }>) {
  return (
    <div className={`${styles.designThumbnail} ${styles[`designThumbnail_${tone}`]}`} aria-hidden="true">
      <span className={styles.thumbnailMasthead} />
      <span className={styles.thumbnailTitle} />
      <span className={styles.thumbnailRule} />
      <span className={styles.thumbnailCopy} />
      <span className={styles.thumbnailImage} />
      <span className={styles.thumbnailButton} />
    </div>
  );
}
