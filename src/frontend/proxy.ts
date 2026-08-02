import { type NextRequest, NextResponse } from "next/server";
import { safeAdminReturnPath } from "@/lib/auth-contract";

export function adminReturnPath(request: Pick<NextRequest, "nextUrl">): string {
  return safeAdminReturnPath(`${request.nextUrl.pathname}${request.nextUrl.search}`);
}

export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-omni-admin-return-path", adminReturnPath(request));
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = { matcher: ["/admin/:path*"] };
