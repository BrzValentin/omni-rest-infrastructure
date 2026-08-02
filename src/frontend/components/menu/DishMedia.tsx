"use client";

import Image from "next/image";
import { useState } from "react";

import type { PublicMedia } from "@/lib/menu-contract";
import { message } from "@/lib/menu-messages";

import styles from "./menu.module.css";

type DishMediaProps = Readonly<{
  dishName: string;
  media: PublicMedia | null;
  priority?: boolean;
}>;

export function DishMedia({ dishName, media, priority = false }: DishMediaProps) {
  const [failed, setFailed] = useState(false);
  const variant = media?.variants.reduce<PublicMedia["variants"][number] | null>(
    (largest, item) => (!largest || item.width > largest.width ? item : largest),
    null,
  );

  if (!variant || failed) {
    return (
      <div className={styles.mediaPlaceholder} role="img" aria-label={`${dishName}: ${message("imageUnavailable")}`}>
        <span aria-hidden="true">◇</span>
      </div>
    );
  }

  return (
    <div className={styles.mediaFrame} style={{ aspectRatio: `${variant.width} / ${variant.height}` }}>
      <Image
        src={variant.url}
        alt={media?.altText ?? ""}
        width={variant.width}
        height={variant.height}
        sizes="(max-width: 47.99rem) calc(100vw - 3rem), (max-width: 74rem) 45vw, 34rem"
        priority={priority}
        loading={priority ? "eager" : "lazy"}
        onError={() => setFailed(true)}
      />
    </div>
  );
}
