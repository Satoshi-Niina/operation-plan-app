import Link from "next/link";
import { PageShell } from "@/components/layout/PageShell";
import { formatTenantName } from "@/lib/tenant/tenant";
import styles from "./page.module.css";

type TenantPageProps = { params: Promise<{ tenant: string }> };

export default async function TenantPage({ params }: TenantPageProps) {
  const { tenant } = await params;
  const tenantName = formatTenantName(tenant);

  return <PageShell tenant={tenant}>
    <section className={styles.intro}><p className={styles.kicker}>OPERATIONS DESK / {tenant.toUpperCase()}</p><h1>{tenantName} 運用管理</h1><p>保守用車の計画と実績を、ひとつの画面で確実に管理します。</p></section>
    <section className={styles.moduleGrid} aria-label="機能選択">
      <Link href={`/${tenant}/planning`} className={`${styles.moduleCard} ${styles.planning}`}><span className={styles.icon}>計</span><span><strong>運用計画</strong><small>日々の運用予定を登録・管理</small></span><span className={styles.arrow}>→</span></Link>
      <Link href={`/${tenant}/actuals`} className={`${styles.moduleCard} ${styles.actuals}`}><span className={styles.icon}>実</span><span><strong>運用実績管理</strong><small>実績の登録と確定状況を管理</small></span><span className={styles.arrow}>→</span></Link>
    </section>
    <section className={styles.infoStrip}><div><span>利用者</span><strong>山田 太郎</strong></div><div><span>所属事業所</span><strong>大阪事業所</strong></div><div><span>本日の状態</span><strong><i />計画 2件 / 実績 1件</strong></div></section>
  </PageShell>;
}
