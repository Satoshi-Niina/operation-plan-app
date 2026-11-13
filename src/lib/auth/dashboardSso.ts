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
  isSuperAdmin?: boolean;
  [key: string]: unknown;
};

export type AppSession = {
  userId: string;
  username: string;
  displayName: string;
  role: string;
  tenantKey: string;
  isSuperAdmin?: boolean;
};

export class DashboardSsoError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function normalizeRole(roleInput: unknown): string {
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

function base64UrlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecodeToString(b64url: string): string {
  let base64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

function base64UrlToUint8Array(b64url: string): Uint8Array {
  let base64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * ダッシュボードが発行したSSOトークンを検証する（Edge Runtime / Node.js 両互換）。
 * 署名・有効期限・対象アプリ(appKey)を確認し、失敗時は例外を投げる。
 */
export async function verifyDashboardToken(
  token: string,
  expectedTenantKey?: string
): Promise<DashboardTokenPayload> {
  if (!token) {
    throw new DashboardSsoError("Token is required", 401);
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new DashboardSsoError("Invalid dashboard token: invalid format", 401);
  }

  const [headerB64, payloadB64, sigB64] = parts;
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(base64UrlDecodeToString(payloadB64));
  } catch {
    throw new DashboardSsoError("Invalid dashboard token: malformed payload", 401);
  }

  // 有効期限の検証
  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === "number" && payload.exp < nowSec) {
    throw new DashboardSsoError("Invalid dashboard token: jwt expired", 401);
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

  const enc = new TextEncoder();
  const sigBytes = base64UrlToUint8Array(sigB64);
  const dataBytes = enc.encode(`${headerB64}.${payloadB64}`);

  let isValidSignature = false;
  for (const secret of secrets) {
    try {
      const key = await crypto.subtle.importKey(
        "raw",
        enc.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"]
      );
      const verified = await crypto.subtle.verify("HMAC", key, sigBytes as unknown as BufferSource, dataBytes as unknown as BufferSource);
      if (verified) {
        isValidSignature = true;
        break;
      }
    } catch {}
  }

  if (!isValidSignature) {
    throw new DashboardSsoError("Invalid dashboard token: invalid signature", 401);
  }

  // 他アプリ向けトークンの誤用を防止（appKey が含まれている場合）
  const tokenAppKey = String(payload.appKey || payload.app_key || "").trim();
  if (tokenAppKey && tokenAppKey !== APP_KEY) {
    throw new DashboardSsoError(`Token is issued for app '${tokenAppKey}', not '${APP_KEY}'`, 403);
  }

  const tenantKey = String(payload.tenantKey || payload.tenantId || payload.tenant_id || expectedTenantKey || "demo").trim().toLowerCase();
  const userId = String(payload.userId || payload.id || payload.sub || "").trim();
  const username = String(payload.username || payload.preferred_username || payload.name || "").trim();
  const role = normalizeRole(payload.role || payload.roles || payload.roleCodes || payload.legacyRole || payload.legacy_role);
  const displayName = String(payload.displayName || payload.display_name || payload.name || username || "ユーザー").trim();
  const isSuperAdmin = Boolean(
    payload.is_super_admin === true ||
    payload.isSuperAdmin === true ||
    role === "system_admin"
  );

  return {
    ...payload,
    tenantKey,
    userId,
    username: username || "user",
    displayName,
    role,
    isSuperAdmin,
  };
}

/**
 * 検証済みのダッシュボードトークンから、本アプリ用の短命セッションを発行する（Edge Runtime / Node.js 両互換）。
 */
export async function issueAppSessionToken(payload: AppSession): Promise<string> {
  const secret = APP_SESSION_SECRET || "ops-plan-secret";
  const header = { alg: "HS256", typ: "JWT" };
  const nowSec = Math.floor(Date.now() / 1000);
  const body = {
    ...payload,
    iat: nowSec,
    exp: nowSec + SESSION_MAX_AGE_SECONDS,
    iss: "operation-plan-app",
    aud: "operation-plan-session",
  };

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(body));
  const data = `${headerB64}.${payloadB64}`;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sigBuffer = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  const sigBytes = new Uint8Array(sigBuffer);
  let sigBinary = "";
  for (let i = 0; i < sigBytes.byteLength; i++) {
    sigBinary += String.fromCharCode(sigBytes[i]);
  }
  const sigB64 = btoa(sigBinary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  return `${data}.${sigB64}`;
}

/**
 * 本アプリのセッションCookieを検証する（Edge Runtime / Node.js 両互換）。
 */
export async function verifyAppSessionToken(token: string): Promise<AppSession | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;

  try {
    const secret = APP_SESSION_SECRET || "ops-plan-secret";
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const sigBytes = base64UrlToUint8Array(sigB64);
    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes as unknown as BufferSource,
      enc.encode(`${headerB64}.${payloadB64}`) as unknown as BufferSource
    );
    if (!isValid) return null;

    const payload = JSON.parse(base64UrlDecodeToString(payloadB64));
    const nowSec = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < nowSec) return null;
    if (payload.iss && payload.iss !== "operation-plan-app") return null;

    return payload as AppSession;
  } catch (err) {
    console.error("[verifyAppSessionToken Error]:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

export const sessionCookieName = SESSION_COOKIE_NAME;
export const sessionMaxAgeSeconds = SESSION_MAX_AGE_SECONDS;
