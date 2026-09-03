import { PageShell } from "@/components/layout/PageShell";
import { ModuleHeader } from "@/components/layout/ModuleHeader";
import { PlanningTable } from "@/components/planning/PlanningTable";
import { getTenantOperations } from "@/lib/data/operations";

type PlanningPageProps = { params: Promise<{ tenant: string }> };

export default async function PlanningPage({ params }: PlanningPageProps) {
  const { tenant } = await params;
  const data = await getTenantOperations(tenant);
  return <PageShell tenant={tenant}><ModuleHeader tenant={tenant} eyebrow="PLANNING" title="運用計画" description="保守用車の運用予定と検修実績に基づく検修周期を確認します。" /><PlanningTable tenant={tenant} rows={data.plans} offices={data.offices} bases={data.bases} officeBases={data.officeBases} vehicles={data.vehicles} inspectionMasters={data.inspectionMasters} inspectionRules={data.inspectionRules} inspectionActuals={data.inspectionActuals} /></PageShell>;
}
