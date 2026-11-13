// セキュリティ監視・監査用の構造化ログ（1行1JSON）。
// Google Cloud Logging は stdout/stderr の JSON 行を自動でパースし、severity / message / timestamp を認識する。
// 注意: ログ出力の失敗が業務処理へ波及しないよう、公開関数は例外を投げない。

export const APP_NAME = "operation_plan_app";

const MAX_DEPTH = 6;
const MAX_ARRAY_ITEMS = 50;
const MAX_STRING = 2000;
const MAX_STACK = 8000;
const MAX_IDENTIFIER = 128;
const REDACTED = "[REDACTED]";

// キー名に含まれていたら値を出力しない（認証クレデンシャル類）
const SENSITIVE_KEY = /(password|passwd|passphrase|pwd|secret|token|authorization|cookie|credential|api[-_]?key|private[-_]?key|jwt|signature)/iu;

type AuditLogSink = ((entry: Record<string, unknown>) => void) | null;
let sink: AuditLogSink = null;

export function setAuditLogSink(fn: AuditLogSink) {
  sink = typeof fn === "function" ? fn : null;
}

let streamGuardInstalled = false;
function installStreamGuard() {
  if (streamGuardInstalled) return;
  streamGuardInstalled = true;
  try {
    const proc = (globalThis as unknown as { process?: { stdout?: { on?: (event: string, handler: () => void) => void }, stderr?: { on?: (event: string, handler: () => void) => void } } }).process;
    if (proc?.stdout?.on) proc.stdout.on("error", () => { });
    if (proc?.stderr?.on) proc.stderr.on("error", () => { });
  } catch {
    // Edge Runtime 等では何もしない
  }
}

function redactString(value: unknown, max = MAX_STRING): string {
  const text = String(value ?? "")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/giu, "Bearer [REDACTED]")
    .replace(/eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/gu, "[REDACTED_JWT]")
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^/\s:@]+:[^@\s/]+@/giu, "$1[REDACTED]@")
    .replace(/((?:password|passwd|pwd|secret|token|api[-_]?key)\s*[=:]\s*)[^\s,;&"']+/giu, "$1[REDACTED]");
  return text.length > max ? `${text.slice(0, max)}...[truncated]` : text;
}

function maxLengthForKey(key: string): number {
  return key === "stack_trace" ? MAX_STACK : MAX_STRING;
}

function sanitize(value: unknown, depth = 0, seen = new WeakSet(), key = ""): unknown {
  if (value === null || value === undefined) return value === undefined ? undefined : null;

  switch (typeof value) {
    case "string":
      return redactString(value, maxLengthForKey(key));
    case "number":
      return Number.isFinite(value) ? value : String(value);
    case "boolean":
      return value;
    case "bigint":
      return value.toString();
    case "function":
    case "symbol":
      return undefined;
    default:
      break;
  }

  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (value instanceof Error) {
    return { name: value.name, message: redactString(value.message || ""), code: (value as unknown as { code?: unknown }).code ?? null };
  }
  if (depth >= MAX_DEPTH) return "[MaxDepth]";
  if (typeof value === "object" && value !== null) {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);

    if (Array.isArray(value)) {
      return value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitize(item, depth + 1, seen));
    }

    const output: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(childKey)) {
        output[childKey] = childValue === null || childValue === undefined ? null : REDACTED;
        continue;
      }
      const sanitized = sanitize(childValue, depth + 1, seen, childKey);
      if (sanitized !== undefined) output[childKey] = sanitized;
    }
    return output;
  }
  return String(value);
}

function cleanIdentifier(value: unknown, max = MAX_IDENTIFIER): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/[\u0000-\u001f\u007f]/gu, "").trim();
  return text ? text.slice(0, max) : null;
}

function normalizeIp(raw: unknown): string {
  let text = String(raw || "").trim();
  if (!text) return "";
  text = text.replace(/^\[|\]$/gu, "");
  if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/u.test(text)) text = text.slice(0, text.lastIndexOf(":"));
  return text.replace(/^::ffff:/iu, "");
}

type RequestLike = {
  headers?: { get?: (name: string) => string | null } | Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string };
  connection?: { remoteAddress?: string };
  user?: { userId?: string; id?: string; role?: string; roles?: string[] };
  method?: string;
  nextUrl?: { pathname?: string };
  originalUrl?: string;
  url?: string;
  body?: { deviceId?: string; device_id?: string };
};

export function extractClientIp(req: unknown): string | null {
  try {
    if (!req) return null;
    const r = req as RequestLike;
    const headerValue = typeof r.headers?.get === "function"
      ? r.headers.get("x-forwarded-for")
      : (r.headers as Record<string, unknown>)?.["x-forwarded-for"];
    const first = normalizeIp(String(Array.isArray(headerValue) ? headerValue[0] : headerValue || "").split(",")[0]);
    if (first) return first;

    const direct = r.ip || r.socket?.remoteAddress || r.connection?.remoteAddress;
    const directNorm = normalizeIp(direct);
    return directNorm || null;
  } catch {
    return null;
  }
}

export function extractDeviceId(req: unknown): string | null {
  try {
    if (!req) return null;
    const r = req as RequestLike;
    const header = typeof r.headers?.get === "function"
      ? r.headers.get("x-device-id")
      : (r.headers as Record<string, unknown>)?.["x-device-id"];
    return cleanIdentifier(header ?? r.body?.deviceId ?? r.body?.device_id);
  } catch {
    return null;
  }
}

export function describeRequestPath(req: unknown): string {
  try {
    if (!req) return "";
    const r = req as RequestLike;
    const raw = r.nextUrl?.pathname || r.originalUrl || r.url || "";
    return String(raw).split("?")[0].slice(0, 200);
  } catch {
    return "";
  }
}

function describeTarget(req: unknown): string | null {
  const r = req as RequestLike;
  const method = r?.method ? `${r.method} ` : "";
  return `${method}${describeRequestPath(req)}`.trim() || null;
}

function resolveUserRole(req: unknown): string | null {
  const r = req as RequestLike;
  const role = r?.user?.role || (Array.isArray(r?.user?.roles) ? r.user.roles[0] : null);
  return cleanIdentifier(role);
}

export interface AuditLogOptions {
  severity: "INFO" | "WARNING" | "ERROR";
  eventType: "auth" | "authz_denied" | "operation" | "system_error";
  message: string;
  details?: Record<string, unknown>;
  req?: unknown;
  userId?: string | null;
}

function buildEntry({ severity, eventType, message, details, req, userId }: AuditLogOptions) {
  const r = req as RequestLike;
  return {
    timestamp: new Date().toISOString(),
    severity,
    app_name: APP_NAME,
    event_type: eventType,
    client_ip: extractClientIp(req),
    user_id: userId !== undefined ? cleanIdentifier(userId) : cleanIdentifier(r?.user?.userId || r?.user?.id),
    device_id: extractDeviceId(req),
    message: redactString(message ?? "", 1000),
    details: sanitize(details ?? {}) || {},
  };
}

export function writeAuditLog(options: AuditLogOptions) {
  try {
    if (process.env.AUDIT_LOG_ENABLED === "false") return null;

    const entry = buildEntry(options);
    if (sink) {
      sink(entry as Record<string, unknown>);
      return entry;
    }

    installStreamGuard();
    let line: string;
    try {
      line = JSON.stringify(entry);
    } catch {
      line = JSON.stringify({
        timestamp: entry.timestamp,
        severity: entry.severity,
        app_name: APP_NAME,
        event_type: entry.event_type,
        message: "audit log serialization failed",
        details: {},
      });
    }

    if (entry.severity === "ERROR") {
      console.error(line);
    } else if (entry.severity === "WARNING") {
      console.warn(line);
    } else {
      console.log(line);
    }
    return entry;
  } catch {
    return null;
  }
}

// ① 認証イベント
export function logAuthSuccess(req: unknown, { userId, username, method = "sso", ...extra }: Record<string, unknown> = {}) {
  return writeAuditLog({
    severity: "INFO",
    eventType: "auth",
    message: "ログイン成功",
    req,
    userId: userId as string | undefined,
    details: { method, username, ...extra },
  });
}

export function logAuthFailure(req: unknown, { attemptedUserId = null, method = "sso", failureDetail, ...extra }: Record<string, unknown> = {}) {
  return writeAuditLog({
    severity: "WARNING",
    eventType: "auth",
    message: "ログイン失敗",
    req,
    userId: attemptedUserId as string | null,
    details: { reason: "invalid_credentials", method, failure_detail: failureDetail, ...extra },
  });
}

// ② 権限・認可イベント
export function logAuthzDenied(req: unknown, { targetResource, requiredRole = null, userRole, userId, ...extra }: Record<string, unknown> = {}) {
  return writeAuditLog({
    severity: "WARNING",
    eventType: "authz_denied",
    message: "権限拒否",
    req,
    userId: userId as string | undefined,
    details: {
      target_resource: targetResource ?? describeTarget(req),
      required_role: requiredRole,
      user_role: userRole !== undefined ? userRole : resolveUserRole(req),
      ...extra,
    },
  });
}

// ③ 主要操作イベント
export function logOperation(req: unknown, { action, targetId = null, status = "success", targetType, ...extra }: Record<string, unknown> = {}) {
  return writeAuditLog({
    severity: "INFO",
    eventType: "operation",
    message: "計画データ操作",
    req,
    details: {
      action,
      target_id: targetId === null || targetId === undefined ? null : String(targetId),
      status,
      target_type: targetType,
      ...extra,
    },
  });
}

// ④ システムエラー・例外
export function logSystemError(req: unknown, error: unknown, { errorCode, ...extra }: Record<string, unknown> = {}) {
  try {
    const isError = error instanceof Error;
    const errObj = error as { code?: unknown; name?: string };
    const r = req as RequestLike;
    return writeAuditLog({
      severity: "ERROR",
      eventType: "system_error",
      message: (isError ? error.message : String(error ?? "")) || "unknown error",
      req,
      details: {
        error_code: errorCode ?? errObj?.code ?? (isError ? error.name : null) ?? "UNKNOWN_ERROR",
        stack_trace: isError ? error.stack : null,
        method: r?.method ?? null,
        path: req ? describeRequestPath(req) : null,
        ...extra,
      },
    });
  } catch {
    return null;
  }
}

