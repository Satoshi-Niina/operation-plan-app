import { InspectionActual, InspectionRule, OperationActual, OperationPlan, VehicleInspectionMaster, VehicleMaster } from "@/types/operation";

export const operationPlans: OperationPlan[] = [
  {
    id: "plan-001",
    date: "2026/09/03",
    office: "大阪事業所",
    model: "軌道モーターカー",
    machineNumber: "MC-042",
    work: "定期点検・整備",
    operator: "山田 太郎",
    startTime: "08:30",
    endTime: "12:00",
    status: "planned",
    note: "部品交換あり",
  },
  {
    id: "plan-002",
    date: "2026/09/03",
    office: "京都事業所",
    model: "高所作業車",
    machineNumber: "AW-018",
    work: "架線設備点検",
    operator: "佐藤 花子",
    startTime: "09:00",
    endTime: "16:30",
    status: "in-progress",
    note: "雨天時は延期",
  },
  {
    id: "plan-003",
    date: "2026/09/04",
    office: "大阪事業所",
    model: "バラストスイーパー",
    machineNumber: "BS-007",
    work: "道床清掃",
    operator: "鈴木 一郎",
    startTime: "22:00",
    endTime: "翌02:00",
    status: "planned",
    note: "夜間作業",
  },
];

export const vehicleInspectionMasters: VehicleInspectionMaster[] = [
  { machineNumber: "MC-042", model: "軌道モーターカー", category: "軌道モーターカー", inspectionBase: "大阪保守基地" },
  { machineNumber: "BS-007", model: "バラストスイーパー", category: "鉄製トロ", inspectionBase: "吹田保守基地" },
];

export const maintenanceOffices = ["大阪事業所", "京都事業所"];
export const maintenanceBases = ["大阪保守基地", "吹田保守基地", "京都保守基地", "神戸保守基地"];
export const officeBases: Record<string, string[]> = {
  "大阪事業所": ["大阪保守基地", "吹田保守基地", "神戸保守基地"],
  "京都事業所": ["京都保守基地"],
};
export const vehicleMasters: VehicleMaster[] = [
  { machineNumber: "MC-042", model: "軌道モーターカー", office: "大阪事業所", homeBase: "大阪保守基地" },
  { machineNumber: "AW-018", model: "高所作業車", office: "京都事業所", homeBase: "京都保守基地" },
  { machineNumber: "BS-007", model: "バラストスイーパー", office: "大阪事業所", homeBase: "吹田保守基地" },
];

export const inspectionRules: InspectionRule[] = [
  { category: "軌道モーターカー", inspectionType: "定期点検", phaseMonths: 6, intervalMonths: 6, inspectionDays: 1 },
  { category: "軌道モーターカー", inspectionType: "乙A検査", phaseMonths: 12, intervalMonths: 12, inspectionDays: 3 },
  { category: "軌道モーターカー", inspectionType: "乙B検査", phaseMonths: 24, intervalMonths: 24, inspectionDays: 5 },
  { category: "軌道モーターカー", inspectionType: "甲A検査", phaseMonths: 48, intervalMonths: 48, inspectionDays: 20 },
  { category: "軌道モーターカー", inspectionType: "甲B検査", phaseMonths: 96, intervalMonths: 96, inspectionDays: 30 },
  { category: "鉄製トロ", inspectionType: "全般検査", phaseMonths: 12, intervalMonths: 12, inspectionDays: 3 },
  { category: "鉄製トロ", inspectionType: "細密検査", phaseMonths: 36, intervalMonths: 36, inspectionDays: 15 },
];

export const inspectionActuals: InspectionActual[] = [
  { id: "inspection-001", machineNumber: "MC-042", completedDate: "2026/03/10", phaseMonths: 90 },
  { id: "inspection-002", machineNumber: "BS-007", completedDate: "2025/09/12", phaseMonths: 24 },
];

export const operationActuals: OperationActual[] = [
  {
    id: "actual-001",
    date: "2026/09/02",
    office: "大阪事業所",
    model: "軌道モーターカー",
    machineNumber: "MC-042",
    work: "定期点検・整備",
    operator: "山田 太郎",
    actualStartTime: "08:35",
    actualEndTime: "11:50",
    operatingHours: "3.25時間",
    status: "confirmed",
    note: "予定どおり完了",
  },
  {
    id: "actual-002",
    date: "2026/09/02",
    office: "京都事業所",
    model: "高所作業車",
    machineNumber: "AW-018",
    work: "架線設備点検",
    operator: "佐藤 花子",
    actualStartTime: "09:10",
    actualEndTime: "16:45",
    operatingHours: "7.58時間",
    status: "registered",
    note: "一部再点検",
  },
  {
    id: "actual-003",
    date: "2026/09/02",
    office: "大阪事業所",
    model: "バラストスイーパー",
    machineNumber: "BS-007",
    work: "道床清掃",
    operator: "鈴木 一郎",
    actualStartTime: "22:05",
    actualEndTime: "翌02:10",
    operatingHours: "4.08時間",
    status: "unregistered",
    note: "",
  },
];
