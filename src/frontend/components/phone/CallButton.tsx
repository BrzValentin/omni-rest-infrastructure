import { PhoneLink } from "./PhoneLink";
import styles from "./phone.module.css";

type CallButtonProps = {
  e164: string | null | undefined;
  display: string;
  variant?: "primary" | "compact";
};

export function CallButton({ e164, display, variant = "primary" }: CallButtonProps) {
  return (
    <PhoneLink
      e164={e164}
      className={variant === "compact" ? styles.compact : styles.primary}
      ariaLabel={`Call ${display}`}
    >
      <span aria-hidden="true">☎</span>
      <span>{variant === "compact" ? display : `Call ${display}`}</span>
    </PhoneLink>
  );
}
