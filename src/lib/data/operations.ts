import { getTenantPool } from "@/lib/db/tenantPool";
import { inspectionActuals, inspectionRules, maintenanceBases, maintenanceOffices, officeBases as mockOfficeBases, operationPlans, vehicleInspectionMasters, vehicleMasters } from "@/lib/mock/operations";
import { InspectionActual, InspectionRule, OperationPlan, VehicleInspectionMaster, VehicleMaster } from "@/types/operation";

type StoredPlan = OperationPlan & { departureBase: string; arrivalBase: string; timeBand: "daytime" | "dayNight" | "night" };

export type TenantOperations = {
  plans: OperationPlan[];
  offices: string[];
  bases: string[];
  officeBases: Record<string, string[]>;
  vehicles: VehicleMaster[];
  inspectionMasters: VehicleInspectionMaster[];
  inspectionRules: InspectionRule[];
  inspectionActuals: InspectionActual[];
};

export async function getTenantOperations(tenant: string): Promise<TenantOperations> {
  const pool = await getTenantPool(tenant);
  if (!pool) {
    return {
      plans: operationPlans,
      offices: maintenanceOffices,
      bases: maintenanceBases,
      officeBases: mockOfficeBases,
      vehicles: vehicleMasters,
      inspectionMasters: vehicleInspectionMasters,
      inspectionRules,
      inspectionActuals,
    };
  }

  try {
    const [plansResult, officesResult, basesResult, officeBasesResult, vehiclesResult, mastersResult, rulesResult, actualsResult] = await Promise.all([
      pool.query<StoredPlan>("SELECT id, date, office, model, machine_number AS \"machineNumber\", work, operator, start_time AS \"startTime\", end_time AS \"endTime\", status, note, departure_base AS \"departureBase\", arrival_base AS \"arrivalBase\", time_band AS \"timeBand\" FROM operation_plans WHERE tenant_slug = $1 ORDER BY date, machine_number", [tenant]),
      pool.query<{ name: string }>("SELECT name FROM maintenance_offices WHERE tenant_slug = $1 ORDER BY name", [tenant]),
      pool.query<{ name: string }>("SELECT name FROM maintenance_bases WHERE tenant_slug = $1 ORDER BY name", [tenant]),
      pool.query<{ office: string; base: string }>("SELECT office_name AS office, base_name AS base FROM maintenance_office_bases WHERE tenant_slug = $1 ORDER BY office_name, base_name", [tenant]),
      pool.query<VehicleMaster>("SELECT machine_number AS \"machineNumber\", model, office, home_base AS \"homeBase\" FROM maintenance_vehicles WHERE tenant_slug = $1 ORDER BY machine_number", [tenant]),
      pool.query<VehicleInspectionMaster>("SELECT machine_number AS \"machineNumber\", model, category, inspection_base AS \"inspectionBase\" FROM vehicle_inspection_masters WHERE tenant_slug = $1 ORDER BY machine_number", [tenant]),
      pool.query<InspectionRule>("SELECT category, inspection_type AS \"inspectionType\", phase_months AS \"phaseMonths\", interval_months AS \"intervalMonths\", inspection_days AS \"inspectionDays\" FROM inspection_rules ORDER BY category, phase_months", []),
      pool.query<InspectionActual>("SELECT id, machine_number AS \"machineNumber\", completed_date AS \"completedDate\", phase_months AS \"phaseMonths\" FROM inspection_actuals WHERE tenant_slug = $1 ORDER BY completed_date DESC", [tenant]),
    ]);
    const officeBasesMap = officeBasesResult.rows.reduce<Record<string, string[]>>((assignments, item) => ({ ...assignments, [item.office]: [...(assignments[item.office] ?? []), item.base] }), {});

    const vehicles = vehiclesResult.rows.length > 0 ? vehiclesResult.rows : vehicleMasters;
    const offices = officesResult.rows.length > 0 ? officesResult.rows.map((office) => office.name) : maintenanceOffices;
    const bases = basesResult.rows.length > 0 ? basesResult.rows.map((base) => base.name) : maintenanceBases;
    const officeBases = Object.keys(officeBasesMap).length > 0 ? officeBasesMap : mockOfficeBases;
    const masters = mastersResult.rows.length > 0 ? mastersResult.rows : vehicleInspectionMasters;
    const rules = rulesResult.rows.length > 0 ? rulesResult.rows : inspectionRules;
    const actuals = actualsResult.rows.length > 0 ? actualsResult.rows : inspectionActuals;
    const plans = plansResult.rows.length > 0 ? plansResult.rows : operationPlans;

    return { plans, offices, bases, officeBases, vehicles, inspectionMasters: masters, inspectionRules: rules, inspectionActuals: actuals };
  } catch (dbErr) {
    console.warn(`[getTenantOperations] DB query failed, falling back to mock data for tenant=${tenant}:`, dbErr instanceof Error ? dbErr.message : String(dbErr));
    return {
      plans: operationPlans,
      offices: maintenanceOffices,
      bases: maintenanceBases,
      officeBases: mockOfficeBases,
      vehicles: vehicleMasters,
      inspectionMasters: vehicleInspectionMasters,
      inspectionRules,
      inspectionActuals,
    };
  }
}

export async function saveOperationPlan(tenant: string, plan: StoredPlan) {
  const pool = await getTenantPool(tenant);
  if (!pool) return plan;
  await pool.query(
    `INSERT INTO operation_plans (id, tenant_slug, date, office, model, machine_number, work, operator, start_time, end_time, status, note, departure_base, arrival_base, time_band)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     ON CONFLICT (id) DO UPDATE SET date = EXCLUDED.date, office = EXCLUDED.office, model = EXCLUDED.model, machine_number = EXCLUDED.machine_number, work = EXCLUDED.work, operator = EXCLUDED.operator, start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time, status = EXCLUDED.status, note = EXCLUDED.note, departure_base = EXCLUDED.departure_base, arrival_base = EXCLUDED.arrival_base, time_band = EXCLUDED.time_band, updated_at = NOW()`,
    [plan.id, tenant, plan.date, plan.office, plan.model, plan.machineNumber, plan.work, plan.operator, plan.startTime, plan.endTime, plan.status, plan.note, plan.departureBase, plan.arrivalBase, plan.timeBand],
  );
  return plan;
}

export async function deleteOperationPlan(tenant: string, id: string) {
  const pool = await getTenantPool(tenant);
  if (!pool) return;
  await pool.query("DELETE FROM operation_plans WHERE tenant_slug = $1 AND id = $2", [tenant, id]);
}