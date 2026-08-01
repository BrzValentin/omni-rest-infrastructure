const E164 = /^\+[1-9]\d{7,14}$/;

/** The only allowed construction point for telephone URIs in the frontend. */
export function buildTelUri(e164: string | null | undefined): string | null {
  if (!e164 || !E164.test(e164)) return null;
  return `tel:${e164}`;
}

export function isE164(value: string): boolean {
  return E164.test(value);
}
