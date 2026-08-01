export type Membership = Readonly<{ restaurantId: string; role: string }>;
export type Session = Readonly<{
  userId: string;
  displayName: string;
  memberships: readonly Membership[];
  idleExpiresAt: string;
  absoluteExpiresAt: string;
  returnPath: string;
}>;

export function safeAdminReturnPath(value: string | null | undefined): string {
  if (!value || value.length > 2048 || !value.startsWith("/admin") || value.startsWith("//") || value.includes("\\")) return "/admin";
  let decoded: string;
  try { decoded = decodeURIComponent(value); } catch { return "/admin"; }
  if (!decoded.startsWith("/admin") || decoded.startsWith("//") || decoded.includes("\\")) return "/admin";
  const boundary = decoded.at(6);
  return boundary === undefined || boundary === "/" || boundary === "?" || boundary === "#" ? value : "/admin";
}

export type ApiProblem = Readonly<{ status?: number; code?: string; title?: string; detail?: string; errors?: Record<string, string[]> }>;
