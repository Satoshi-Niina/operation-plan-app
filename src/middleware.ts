import { NextRequest, NextResponse } from "next/server";
import {
  issueAppSessionToken,
  sessionCookieName,
  sessionMaxAgeSeconds,
  verifyAppSessionToken,
  verifyDashboardToken,
} from "@/lib/auth/dashboardSso";
import {
  logAuthSuccess,
  logAuthFailure,
  logAuthzDenied,
} from "@/lib/auditLogger";

const KNOWN_ROUTE_SEGMENTS = new Set(["planning", "actuals"]);
const RESERVED_TOP_SEGMENTS = new Set(["access-denied", "authenticating", "favicon.ico", "_next"]);

function extractTenantFromPath(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return null;

  if (segments[0] === "api") {
    if (segments[1] === "tenants" && segments[2]) return segments[2];
    return null;
  }

  const [first] = segments;
  if (!first || KNOWN_ROUTE_SEGMENTS.has(first) || RESERVED_TOP_SEGMENTS.has(first)) return null;
  return first;
}

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const tenant = extractTenantFromPath(pathname);
  const isApiRoute = pathname.startsWith("/api/");

  // URL パラメータ (auth_token または token) の受取処理
  const urlToken = searchParams.get("auth_token") || searchParams.get("token");
  if (urlToken) {
    try {
      const decoded = verifyDashboardToken(urlToken, tenant || undefined);
      const sessionToken = issueAppSessionToken({
        userId: decoded.userId || "",
        username: decoded.username || "",
        displayName: decoded.displayName || decoded.username || "",
        role: decoded.role || "operator",
        tenantKey: decoded.tenantKey || tenant || "demo",
      });

      logAuthSuccess(request, {
        userId: decoded.userId,
        username: decoded.username,
        tenantKey: decoded.tenantKey || tenant,
        role: decoded.role,
        method: "url_token",
      });

      // トークンパラメータを除去した綺麗な URL へリダイレクト
      const cleanUrl = request.nextUrl.clone();
      cleanUrl.searchParams.delete("auth_token");
      cleanUrl.searchParams.delete("token");

      const response = NextResponse.redirect(cleanUrl);
      response.cookies.set(sessionCookieName, sessionToken, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: sessionMaxAgeSeconds,
        path: "/",
      });
      return response;
    } catch (err) {
      logAuthFailure(request, {
        method: "url_token",
        failureDetail: err instanceof Error ? err.message : String(err),
      });
      console.warn("[middleware] Failed to process URL token:", err);
    }
  }

  if (!tenant) return NextResponse.next();

  const sessionCookie = request.cookies.get(sessionCookieName)?.value;
  const session = sessionCookie ? verifyAppSessionToken(sessionCookie) : null;

  if (!session) {
    logAuthzDenied(request, {
      targetResource: pathname,
      reason: "missing_session",
    });
    if (isApiRoute) {
      return NextResponse.json(
        { error: "ダッシュボードからの認証情報がありません。ダッシュボードからアプリを起動してください。" },
        { status: 401 },
      );
    }
    const authUrl = request.nextUrl.clone();
    authUrl.pathname = "/authenticating";
    authUrl.search = "";
    authUrl.searchParams.set("tenant", tenant);
    authUrl.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(authUrl);
  }

  if (String(session.tenantKey || "").toLowerCase() !== tenant.toLowerCase()) {
    logAuthzDenied(request, {
      targetResource: pathname,
      reason: "tenant_mismatch",
      userId: session.userId,
      userRole: session.role,
      expectedTenant: tenant,
      actualTenant: session.tenantKey,
    });
    if (isApiRoute) {
      return NextResponse.json({ error: "テナントが一致しません" }, { status: 403 });
    }
    const deniedUrl = request.nextUrl.clone();
    deniedUrl.pathname = "/access-denied";
    deniedUrl.searchParams.set("reason", "tenant-mismatch");
    return NextResponse.redirect(deniedUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
