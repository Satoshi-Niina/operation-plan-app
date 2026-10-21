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

async function verifyGatewayHmac(authHeader: string, secret: string): Promise<boolean> {
  try {
    const raw = Buffer.from(authHeader, "base64").toString("utf8");
    const parsed = JSON.parse(raw);
    const { payload, hmac } = parsed;
    if (!payload || !hmac) return false;

    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signature = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
    const expectedHmac = Array.from(new Uint8Array(signature))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return expectedHmac.toLowerCase() === String(hmac).toLowerCase();
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const isApiRoute = pathname.startsWith("/api/");
  const tenant = extractTenantFromPath(pathname);

  // 1. Gateway 内部HMAC署名検証 (x-internal-device-auth)
  const internalGatewaySecret = process.env.INTERNAL_GATEWAY_SECRET;
  const authHeader = request.headers.get("x-internal-device-auth");
  let isGatewayAuthorized = false;

  if (internalGatewaySecret && authHeader) {
    isGatewayAuthorized = await verifyGatewayHmac(authHeader, internalGatewaySecret);
  }

  const isProduction = process.env.NODE_ENV === "production";
  const allowDirect = !isProduction || process.env.ALLOW_DIRECT_INTERNAL === "true";

  if (!isGatewayAuthorized && !allowDirect) {
    logAuthzDenied(request, {
      targetResource: pathname,
      reason: "direct_access_blocked_no_gateway_token",
    });
    if (isApiRoute) {
      return NextResponse.json(
        { error: "DirectAccessForbidden", message: "内部ポートへの直接アクセスは禁止されています。" },
        { status: 403 }
      );
    }
    const deniedUrl = request.nextUrl.clone();
    deniedUrl.pathname = "/access-denied";
    deniedUrl.searchParams.set("reason", "direct-access-forbidden");
    return NextResponse.redirect(deniedUrl);
  }

  // 2. URL パラメータ (auth_token または token) の受取処理（後方互換・URL起動用）
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
        isSuperAdmin: decoded.isSuperAdmin,
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
        secure: isProduction,
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

  // 3. テナントルートの認証・認可チェック
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
        { status: 401 }
      );
    }
    const authUrl = request.nextUrl.clone();
    authUrl.pathname = "/authenticating";
    authUrl.search = "";
    authUrl.searchParams.set("tenant", tenant);
    authUrl.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(authUrl);
  }

  // スーパー管理者（niina / system_admin / isSuperAdmin）は全テナントへのアクセスを認可
  const isSuperAdmin = Boolean(
    session.isSuperAdmin ||
    session.role === "system_admin" ||
    String(session.username || "").toLowerCase() === "niina"
  );

  const isTenantMatch = String(session.tenantKey || "").toLowerCase() === tenant.toLowerCase();

  if (!isSuperAdmin && !isTenantMatch) {
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
