import { type NextRequest, NextResponse } from "next/server";
import { safeAdminReturnPath } from "@/lib/auth-contract";

export function adminReturnPath(request: Pick<NextRequest, "nextUrl">): string {
  return safeAdminReturnPath(`${request.nextUrl.pathname}${request.nextUrl.search}`);
}

export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-omni-admin-return-path", adminReturnPath(request));
  // Marks the request as an owner-portal surface. `app/layout.tsx` reads it to keep the portal in the
  // language its own chrome is written in instead of adopting the tenant's, and to skip a public read
  // that admin routes have no use for. `set` overwrites any client-supplied value.
  requestHeaders.set("x-omni-admin-surface", "1");
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = { matcher: ["/admin/:path*"] };
