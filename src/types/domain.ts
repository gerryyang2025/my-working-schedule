export type StaffType = "nurse" | "clerk" | "head_nurse";

export interface StaffMember {
  id: string;
  jobId: string;
  name: string;
  type: StaffType;
  isAdmin: boolean;
  enabled: boolean;
  sortOrder: number;
}

export interface Shift {
  id: string;
  name: string;
  shortName: string;
  color: string;
  countsAttendance: boolean;
  coefficient: number;
  enabled: boolean;
  sortOrder: number;
}

export interface Holiday {
  id: string;
  date: string;
  name: string;
  affectsRequiredAttendance: boolean;
}

export interface ScheduleEntry {
  id: string;
  date: string;
  staffId: string;
  shiftIds: string[];
  note: string;
}

export interface Settings {
  defaultRequiredShiftsPerWeek: number;
  version: number;
}

export interface AppData {
  staff: StaffMember[];
  shifts: Shift[];
  holidays: Holiday[];
  scheduleEntries: ScheduleEntry[];
  settings: Settings;
}

export interface WeeklyStaffSummary {
  staffId: string;
  staffName: string;
  staffType: StaffType;
  attendanceShifts: number;
  requiredShifts: number;
  overtimeShifts: number;
  coefficientTotal: number | null;
  coefficientExcludedReason: string;
}

export interface WeeklySummary {
  weekStart: string;
  weekEnd: string;
  requiredShifts: number;
  holidayDeduction: number;
  holidayNames: string[];
  rows: WeeklyStaffSummary[];
}

export interface MonthlyStaffSummary {
  staffId: string;
  staffName: string;
  staffType: StaffType;
  attendanceShifts: number;
  coefficientTotal: number | null;
  coefficientExcludedReason: string;
}

export interface MonthlySummary {
  monthStart: string;
  monthEnd: string;
  totalDays: number;
  holidayNames: string[];
  rows: MonthlyStaffSummary[];
}
