import Link from "next/link";
import { formatTenantName } from "@/lib/tenant/tenant";
import { getAppSession } from "@/lib/auth/session";
import styles from "./AppHeader.module.css";

type AppHeaderProps = {
  tenant: string;
};

export async function AppHeader({ tenant }: AppHeaderProps) {
  const session = await getAppSession();
  const userName = session?.displayName || session?.username || "未認証";
  const isSuperAdmin = Boolean(
    session?.isSuperAdmin === true ||
    session?.role === "system_admin"
  );

  const isDbConfigured = Boolean(process.env.DATABASE_URL || process.env.DB_CONNECTION_URL || process.env[`TENANT_DB_${tenant.toUpperCase()}_URL`]);
  const envLabel = isDbConfigured ? "Cloud SQL 連携中" : "モック環境";

  return (
    <header className={styles.header}>
      <div className={styles.brandBlock}>
        <Link href={`/${tenant}`} className={styles.brand}>
          <span className={styles.brandMark}>運</span>
          <span>仕業計画・運用管理</span>
        </Link>
        <span className={styles.environment} style={{
          backgroundColor: isDbConfigured ? "#059669" : "#475569",
          color: "#ffffff",
          padding: "2px 8px",
          borderRadius: "4px",
          fontSize: "0.75rem"
        }}>
          {envLabel}
        </span>
      </div>
      <div className={styles.context}>
        <div className={styles.contextItem}>
          <span className={styles.label}>テナント</span>
          <strong>{formatTenantName(tenant)}</strong>
        </div>
        <div className={styles.contextItem}>
          <span className={styles.label}>ユーザー</span>
          <strong>
            {userName}
            {isSuperAdmin && (
              <span style={{
                marginLeft: "6px",
                fontSize: "0.7rem",
                backgroundColor: "#dc2626",
                color: "#ffffff",
                padding: "1px 5px",
                borderRadius: "3px"
              }}>
                管理者
              </span>
            )}
          </strong>
        </div>
        <div className={styles.contextItem}>
          <span className={styles.label}>権限</span>
          <strong>{session?.role || "operator"}</strong>
        </div>
      </div>
    </header>
  );
}

