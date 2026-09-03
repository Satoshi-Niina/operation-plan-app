import { PageShell } from "@/components/layout/PageShell";
import { ModuleHeader } from "@/components/layout/ModuleHeader";
import { ActualsTable } from "@/components/actuals/ActualsTable";
import { getTenantOperations } from "@/lib/data/operations";

type ActualsPageProps = { params: Promise<{ tenant: string }> };

export default async function ActualsPage({ params }: ActualsPageProps) {
  const { tenant } = await params;
  const data = await getTenantOperations(tenant);
  return <PageShell tenant={tenant}><ModuleHeader tenant={tenant} eyebrow="ACTUALS MANAGEMENT" title="運用実績管理" description="運用計画をもとに、保守用車の留置場所と検修実績を管理します。" /><ActualsTable plans={data.plans} offices={data.offices} bases={data.bases} officeBases={data.officeBases} vehicles={data.vehicles} inspectionMasters={data.inspectionMasters} inspectionRules={data.inspectionRules} inspectionActuals={data.inspectionActuals} /></PageShell>;
}
