export type OperationStatus = "planned" | "in-progress" | "completed";
export type ActualStatus = "unregistered" | "registered" | "confirmed";

export type OperationPlan = {
  id: string;
  date: string;
  office: string;
  model: string;
  machineNumber: string;
  work: string;
  operator: string;
  startTime: string;
  endTime: string;
  status: OperationStatus;
  note: string;
};

export type VehicleCategory = "軌道モーターカー" | "鉄製トロ";

export type VehicleMaster = {
  machineNumber: string;
  model: string;
  office: string;
  homeBase: string;
};

export type VehicleInspectionMaster = {
  machineNumber: string;
  model: string;
  category: VehicleCategory;
  inspectionBase: string;
};

export type InspectionRule = {
  category: VehicleCategory;
  inspectionType: string;
  phaseMonths: number;
  intervalMonths: number;
  inspectionDays: number;
};

export type InspectionActual = {
  id: string;
  machineNumber: string;
  completedDate: string;
  phaseMonths: number;
};

export type OperationActual = {
  id: string;
  date: string;
  office: string;
  model: string;
  machineNumber: string;
  work: string;
  operator: string;
  actualStartTime: string;
  actualEndTime: string;
  operatingHours: string;
  status: ActualStatus;
  note: string;
};
