import type { AppData } from "./types";

export function createSeedData(): AppData {
  return {
    staff: [
      {
        id: "staff-head-001",
        jobId: "000228",
        name: "段鸿露",
        type: "head_nurse",
        isAdmin: true,
        enabled: true,
        sortOrder: 1
      },
      {
        id: "staff-nurse-001",
        jobId: "100001",
        name: "李护士",
        type: "nurse",
        isAdmin: false,
        enabled: true,
        sortOrder: 2
      },
      {
        id: "staff-clerk-001",
        jobId: "200001",
        name: "王文员",
        type: "clerk",
        isAdmin: false,
        enabled: true,
        sortOrder: 3
      }
    ],
    shifts: [
      {
        id: "shift-a1",
        name: "A1组长",
        shortName: "A1",
        color: "#2563EB",
        countsAttendance: true,
        coefficient: 1.5,
        enabled: true,
        sortOrder: 1
      },
      {
        id: "shift-p1",
        name: "P1",
        shortName: "P1",
        color: "#0F766E",
        countsAttendance: true,
        coefficient: 1.3,
        enabled: true,
        sortOrder: 2
      },
      {
        id: "shift-n1",
        name: "N1夜班",
        shortName: "N1",
        color: "#DC2626",
        countsAttendance: true,
        coefficient: 1.3,
        enabled: true,
        sortOrder: 3
      },
      {
        id: "shift-office",
        name: "办公班",
        shortName: "办公",
        color: "#7C3AED",
        countsAttendance: true,
        coefficient: 1.2,
        enabled: true,
        sortOrder: 4
      },
      {
        id: "shift-rest",
        name: "休息",
        shortName: "休",
        color: "#64748B",
        countsAttendance: false,
        coefficient: 0,
        enabled: true,
        sortOrder: 5
      }
    ],
    holidays: [
      {
        id: "holiday-2026-06-19",
        date: "2026-06-19",
        name: "端午节",
        affectsRequiredAttendance: true
      }
    ],
    scheduleEntries: [],
    monthlySettlements: [],
    settings: {
      defaultRequiredShiftsPerWeek: 5,
      version: 1
    }
  };
}
