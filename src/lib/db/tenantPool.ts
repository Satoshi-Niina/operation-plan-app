import { Pool } from "pg";
import { logSystemError } from "@/lib/auditLogger";

// 許可されたテナントと対応するデータベース名のマッピング（ホワイトリスト）
export const TENANT_DB_MAP: Record<string, string> = {
  daitetsu: "daitetsu_db",
  kosei: "kosei_db",
  kintetsu: "kintetsu_db",
  demo: "demo_db",
};

export const ALLOWED_TENANT_KEYS = Object.keys(TENANT_DB_MAP);

export function isAllowedTenant(tenantKey: string): boolean {
  const norm = String(tenantKey || "").trim().toLowerCase();
  return Boolean(norm && TENANT_DB_MAP[norm]);
}

export function resolveTenantDatabaseName(tenantKey: string): string | null {
  const norm = String(tenantKey || "").trim().toLowerCase();
  return TENANT_DB_MAP[norm] || null;
}

// テナントごとの接続プールキャッシュ
const tenantPoolCache = new Map<string, { pool: Pool; connectionString: string }>();

/**
 * 基準となるDB接続文字列から、指定したDB名への接続URLを安全に生成する。
 * Cloud SQL Unix socket形式（?host=/cloudsql/...）および標準TCP形式の両方に対応。
 */
export function buildDatabaseUrlForDatabase(baseDatabaseUrl: string, targetDbName: string): string {
  if (!baseDatabaseUrl || !targetDbName) return "";
  const encodedDbName = encodeURIComponent(targetDbName.trim());

  const baseIsSocketStyle = baseDatabaseUrl.includes("?host=") || /@\//u.test(baseDatabaseUrl);

  if (baseIsSocketStyle) {
    // Cloud SQL socket形式: postgresql://user:pass@/dbname?host=/cloudsql/...
    return baseDatabaseUrl.replace(
      /(postgres(?:ql)?:\/\/[^@]+@\/?)([^?]*)(\?.*)?$/u,
      (_match, prefix, _dbName, suffix = "") => `${prefix}${encodedDbName}${suffix}`,
    );
  }

  // 標準TCP形式: postgresql://user:pass@host:5432/dbname?...
  return baseDatabaseUrl.replace(
    /(postgres(?:ql)?:\/\/[^/]+\/)([^?]*)(\?.*)?$/u,
    (_match, prefix, _dbName, suffix = "") => `${prefix}${encodedDbName}${suffix}`,
  );
}

/**
 * 指定テナント用のDB接続URLを決定する。
 * 1. TENANT_DB_<TENANT>_URL 環境変数（完全URL指定）
 * 2. DATABASE_URL または DB_CONNECTION_URL のDB名を置換
 */
export function getTenantDatabaseUrl(tenantKey: string): string | null {
  const dbName = resolveTenantDatabaseName(tenantKey);
  if (!dbName) return null;

  const envKey = `TENANT_DB_${tenantKey.trim().toUpperCase()}_URL`;
  const envUrl = process.env[envKey];
  if (envUrl && envUrl.trim()) {
    return envUrl.trim();
  }

  const baseUrl = process.env.DATABASE_URL || process.env.DB_CONNECTION_URL;
  if (!baseUrl || !baseUrl.trim()) {
    return null;
  }

  return buildDatabaseUrlForDatabase(baseUrl.trim(), dbName);
}

/**
 * 指定テナントに対応するPostgreSQL接続プールを取得する。
 * - ユーザーによる任意DB指定を遮断（ホワイトリスト検証）
 * - テナントごとに接続プールを分離・キャッシュ
 * - 接続失敗時は他テナントへ絶対にフォールバックせずエラーとして監査ログを出力
 * - DB未設定時は null（モックデータフォールバック）を返す
 */
export async function getTenantPool(tenantKey: string): Promise<Pool | null> {
  const normKey = String(tenantKey || "").trim().toLowerCase();

  // 1. テナント妥当性検証（未登録テナントは拒否）
  if (!isAllowedTenant(normKey)) {
    throw new Error(`[tenantPool] 不正なテナントです: "${tenantKey}"。許可されたテナントではありません。`);
  }

  // 2. 接続URLの解決
  const connectionString = getTenantDatabaseUrl(normKey);
  if (!connectionString) {
    // DB接続設定がない場合はモックモードとして安全に null を返す
    return null;
  }

  // 3. キャッシュ確認
  const cached = tenantPoolCache.get(normKey);
  if (cached && cached.connectionString === connectionString) {
    return cached.pool;
  }

  // 古い接続プールがあれば安全に閉じる
  if (cached) {
    await cached.pool.end().catch((err) => {
      console.warn(`[tenantPool] 古い接続プールの解放に失敗しました (${normKey}):`, err);
    });
  }

  // 4. 新規接続プールの作成
  const ssl = process.env.DATABASE_SSL === "true" || process.env.PGSSL === "true"
    ? { rejectUnauthorized: false }
    : undefined;

  const pool = new Pool({
    connectionString,
    ssl,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  pool.on("error", (err) => {
    console.error(`[tenantPool] 接続プールエラー (${normKey}):`, err);
    logSystemError(null, err, {
      errorCode: "TENANT_DB_POOL_ERROR",
      tenant: normKey,
      targetDb: resolveTenantDatabaseName(normKey),
    });
  });

  tenantPoolCache.set(normKey, { pool, connectionString });
  return pool;
}
