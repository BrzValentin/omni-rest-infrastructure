import type { ReactNode } from "react";
import { buildTelUri } from "@/lib/phone";
import styles from "./phone.module.css";

type PhoneLinkProps = {
  e164: string | null | undefined;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
};

export function PhoneLink({ e164, children, className, ariaLabel }: PhoneLinkProps) {
  const href = buildTelUri(e164);
  if (!href) return null;
  return <a className={`${styles.phoneLink} ${className ?? ""}`} href={href} aria-label={ariaLabel}>{children}</a>;
}
