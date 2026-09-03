import Link from "next/link";
import { formatTenantName } from "@/lib/tenant/tenant";
import styles from "./AppHeader.module.css";

type AppHeaderProps = {
  tenant: string;
};

export function AppHeader({ tenant }: AppHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.brandBlock}>
        <Link href={`/${tenant}`} className={styles.brand}>
          <span className={styles.brandMark}>運</span>
          <span>運用管理</span>
        </Link>
        <span className={styles.environment}>STEP 1 / モック環境</span>
      </div>
      <div className={styles.context}>
        <div className={styles.contextItem}>
          <span className={styles.label}>テナント</span>
          <strong>{formatTenantName(tenant)}</strong>
        </div>
        <div className={styles.contextItem}>
          <span className={styles.label}>ユーザー</span>
          <strong>山田 太郎</strong>
        </div>
        <div className={styles.contextItem}>
          <span className={styles.label}>所属事業所</span>
          <strong>大阪事業所</strong>
        </div>
      </div>
    </header>
  );
}
