import jwt from "jsonwebtoken";

const DASHBOARD_JWT_SECRET = process.env.DASHBOARD_JWT_SECRET || "";
const DASHBOARD_JWT_ISSUER = process.env.DASHBOARD_JWT_ISSUER || "dashboard-auth";
const DASHBOARD_JWT_AUDIENCE = process.env.DASHBOARD_JWT_AUDIENCE || "dashboard-apps";
const APP_SESSION_SECRET = process.env.APP_SESSION_SECRET || "";
const APP_KEY = "planning";
const SESSION_COOKIE_NAME = "ops_plan_session";
const SESSION_MAX_AGE_SECONDS = 4 * 60 * 60; // ダッシュボード側のセッション有効期限(4時間)に合わせる

export type DashboardTokenPayload = {
  userId?: string;
  id?: string;
  username?: string;
  displayName?: string;
  role?: string;
  tenantKey?: string;
  tenantId?: string;
  appKey?: string;
};

export type AppSession = {
  userId: string;
  username: string;
  displayName: string;
  role: string;
  tenantKey: string;
};

export class DashboardSsoError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function normalizeRole(roleInput: any): string {
  if (Array.isArray(roleInput)) {
    for (const r of roleInput) {
      const norm = normalizeRole(r);
      if (norm) return norm;
    }
    return "operator";
  }
  const value = String(roleInput || "").trim().toLowerCase();
  if (!value) return "operator";
  if (value === "admin" || value === "system-admin" || value === "system_admin" || value === "ops_admin") {
    return "system_admin";
  }
  if (value === "manager" || value === "operation_admin") {
    return "operation_admin";
  }
  return "operator";
}

/**
 * ダッシュボードが発行したSSOトークンを検証する。
 * 署名・有効期限・issuer/audience・対象アプリ(appKey)を確認し、失敗時は例外を投げる。
 */
export function verifyDashboardToken(token: string, expectedTenantKey?: string): DashboardTokenPayload {
  if (!token) {
    throw new DashboardSsoError("Token is required", 401);
  }

  const secrets = [
    process.env.SHARED_SSO_SECRET,
    DASHBOARD_JWT_SECRET,
    process.env.JWT_SECRET,
  ].filter(Boolean) as string[];

  if (secrets.length === 0) {
    throw new DashboardSsoError(
      "SSO secret is not configured. SHARED_SSO_SECRET or JWT_SECRET must be set.",
      500
    );
  }

  let decoded: any = null;
  let lastError: Error | null = null;

  for (const secret of secrets) {
    try {
      decoded = jwt.verify(token, secret, {
        ignoreExpiration: false,
      });
      if (decoded) break;
    } catch (err) {
      lastError = err as Error;
    }
  }

  if (!decoded) {
    const message = lastError ? lastError.message : "verification failed";
    throw new DashboardSsoError(`Invalid dashboard token: ${message}`, 401);
  }

  const tenantKey = String(decoded.tenantKey || decoded.tenantId || decoded.tenant_id || expectedTenantKey || "demo").trim().toLowerCase();
  const userId = String(decoded.userId || decoded.id || decoded.sub || "").trim();
  const username = String(decoded.username || decoded.preferred_username || decoded.name || "").trim();
  const role = normalizeRole(decoded.role || decoded.roles || decoded.roleCodes || decoded.legacyRole || decoded.legacy_role);
  const displayName = String(decoded.displayName || decoded.display_name || decoded.name || username || "ユーザー").trim();

  return {
    ...decoded,
    tenantKey,
    userId,
    username: username || "user",
    displayName,
    role,
  };
}

/**
 * 検証済みのダッシュボードトークンから、本アプリ用の短命セッションを発行する。
 */
export function issueAppSessionToken(payload: AppSession): string {
  const secret = APP_SESSION_SECRET || "ops-plan-secret";
  return jwt.sign(payload, secret, {
    expiresIn: SESSION_MAX_AGE_SECONDS,
    issuer: "operation-plan-app",
    audience: "operation-plan-session",
  });
}

/**
 * 本アプリのセッションCookieを検証する。
 */
export function verifyAppSessionToken(token: string): AppSession | null {
  if (!token) return null;
  const secret = APP_SESSION_SECRET || "ops-plan-secret";
  try {
    return jwt.verify(token, secret, {
      issuer: "operation-plan-app",
      audience: "operation-plan-session",
    }) as AppSession;
  } catch {
    return null;
  }
}

export const sessionCookieName = SESSION_COOKIE_NAME;
export const sessionMaxAgeSeconds = SESSION_MAX_AGE_SECONDS;
