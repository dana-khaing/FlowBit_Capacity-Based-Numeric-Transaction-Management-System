import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/auth";

const guestOnlyRoutes = new Set(["/login", "/login-help", "/sign-in", "/forgot-password", "/sign-up"]);
const sharedAccessRoutes = new Set(["/reset-password", "/reset-override-code", "/verify-email"]);

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(AUTH_COOKIE_NAME)?.value);
  const isGuestOnlyRoute = guestOnlyRoutes.has(pathname);
  const isSharedAccessRoute = sharedAccessRoutes.has(pathname);

  if (!hasSession && !isGuestOnlyRoute && !isSharedAccessRoute) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  if (hasSession && isGuestOnlyRoute) {
    const homeUrl = new URL("/", request.url);
    return NextResponse.redirect(homeUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
