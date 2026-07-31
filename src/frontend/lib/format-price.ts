import { message } from "./menu-messages";

const canonicalPrice = /^(?:0|[1-9]\d*)\.(\d{2})$/;

export function formatPrice(price: string, locale: string, currency: string): string {
  const match = canonicalPrice.exec(price);
  if (!match) {
    console.error("Public menu supplied an invalid price string.");
    return message("priceUnavailable");
  }

  try {
    const [major, minor] = price.split(".") as [string, string];
    const formatter = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return formatter
      .formatToParts(BigInt(major))
      .map((part) => (part.type === "fraction" ? minor : part.value))
      .join("");
  } catch {
    console.error("Public menu supplied invalid locale or currency price context.");
    return message("priceUnavailable");
  }
}
