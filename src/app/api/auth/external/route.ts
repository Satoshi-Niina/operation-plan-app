import { NextRequest, NextResponse } from "next/server";
import {
  DashboardSsoError,
  issueAppSessionToken,
  sessionCookieName,
  sessionMaxAgeSeconds,
  verifyDashboardToken,
} from "@/lib/auth/dashboardSso";
import {
  logAuthSuccess,
  logAuthFailure,
  logSystemError,
} from "@/lib/auditLogger";

export async function POST(request: NextRequest) {
  let body: { token?: string; tenantKey?: string; tenantId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "リクエストボディが不正です" }, { status: 400 });
  }

  const token = String(body?.token || "").trim();
  const requestedTenantKey = String(body?.tenantKey || body?.tenantId || "").trim();

  if (!token) {
    logAuthFailure(request, {
      method: "dashboard_sso_exchange",
      failureDetail: "token_missing",
    });
    return NextResponse.json({ success: false, message: "トークンが必要です" }, { status: 401 });
  }

  try {
    const decoded = verifyDashboardToken(token, requestedTenantKey || undefined);

    const sessionToken = issueAppSessionToken({
      userId: decoded.userId || "",
      username: decoded.username || "",
      displayName: decoded.displayName || decoded.username || "",
      role: decoded.role || "operator",
      tenantKey: decoded.tenantKey || "",
      isSuperAdmin: decoded.isSuperAdmin,
    });

    logAuthSuccess(request, {
      userId: decoded.userId,
      username: decoded.username,
      tenantKey: decoded.tenantKey,
      role: decoded.role,
      method: "dashboard_sso_exchange",
    });

    const response = NextResponse.json({ success: true, tenantKey: decoded.tenantKey });
    response.cookies.set(sessionCookieName, sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: sessionMaxAgeSeconds,
      path: "/",
    });
    return response;
  } catch (error) {
    if (error instanceof DashboardSsoError) {
      logAuthFailure(request, {
        method: "dashboard_sso_exchange",
        failureDetail: error.message,
      });
      console.warn("[auth/external] Rejected:", error.message);
      return NextResponse.json({ success: false, message: error.message }, { status: error.status });
    }
    logSystemError(request, error, { errorCode: "AUTH_EXCHANGE_FAILED" });
    console.error("[auth/external] Unexpected error:", error);
    return NextResponse.json({ success: false, message: "認証処理に失敗しました" }, { status: 500 });
  }
}
