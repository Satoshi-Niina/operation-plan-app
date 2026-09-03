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
