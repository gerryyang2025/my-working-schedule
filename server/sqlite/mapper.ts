import type Database from "better-sqlite3";
import { assertAppData } from "../app-data";
import type { AppData, Holiday, MonthlySettlement, ScheduleEntry, Settings, Shift, StaffMember } from "../types";

const defaultSettings: Settings = {
  defaultRequiredShiftsPerWeek: 5,
  version: 1
};

type UserStaffBindingRow = {
  id: string;
  staff_id: string;
};

type UserManagedStaffRelationRow = {
  user_id: string;
  staff_id: string;
  created_at: string;
  created_by: string | null;
};

export function replaceAppDataInSqlite(db: Database.Database, data: AppData): void {
  assertAppData(data);
  const replace = db.transaction((next: AppData) => {
    const userStaffBindings = db
      .prepare("select id, staff_id from users where staff_id is not null")
      .all() as UserStaffBindingRow[];
    const userManagedStaffRelations = db
      .prepare("select user_id, staff_id, created_at, created_by from user_managed_staff")
      .all() as UserManagedStaffRelationRow[];
    if (userStaffBindings.length > 0) {
      db.prepare("update users set staff_id = null where staff_id is not null").run();
    }
    if (userManagedStaffRelations.length > 0) {
      db.prepare("delete from user_managed_staff").run();
    }

    db.exec(`
      delete from monthly_settlement_rows;
      delete from monthly_settlements;
      delete from schedule_entry_shifts;
      delete from schedule_entries;
      delete from holidays;
      delete from shifts;
      delete from staff;
      delete from app_settings;
    `);

    const insertStaff = db.prepare(`
      insert into staff (id, job_id, name, type, is_admin, enabled, sort_order)
      values (@id, @jobId, @name, @type, @isAdmin, @enabled, @sortOrder)
    `);
    for (const staff of next.staff) {
      insertStaff.run({ ...staff, isAdmin: staff.isAdmin ? 1 : 0, enabled: staff.enabled ? 1 : 0 });
    }

    if (userStaffBindings.length > 0) {
      const nextStaffIds = new Set(next.staff.map((staff) => staff.id));
      const restoreUserStaffBinding = db.prepare("update users set staff_id = ? where id = ?");
      for (const binding of userStaffBindings) {
        if (nextStaffIds.has(binding.staff_id)) {
          restoreUserStaffBinding.run(binding.staff_id, binding.id);
        }
      }
    }

    if (userManagedStaffRelations.length > 0) {
      const nextStaffIds = new Set(next.staff.map((staff) => staff.id));
      const restoreUserManagedStaffRelation = db.prepare(
        "insert into user_managed_staff (user_id, staff_id, created_at, created_by) values (?, ?, ?, ?)"
      );
      for (const relation of userManagedStaffRelations) {
        if (nextStaffIds.has(relation.staff_id)) {
          restoreUserManagedStaffRelation.run(
            relation.user_id,
            relation.staff_id,
            relation.created_at,
            relation.created_by
          );
        }
      }
    }

    const insertShift = db.prepare(`
      insert into shifts (id, name, short_name, color, counts_attendance, coefficient, enabled, sort_order)
      values (@id, @name, @shortName, @color, @countsAttendance, @coefficient, @enabled, @sortOrder)
    `);
    for (const shift of next.shifts) {
      insertShift.run({
        ...shift,
        countsAttendance: shift.countsAttendance ? 1 : 0,
        enabled: shift.enabled ? 1 : 0
      });
    }

    const insertHoliday = db.prepare(`
      insert into holidays (id, date, name, affects_required_attendance)
      values (@id, @date, @name, @affectsRequiredAttendance)
    `);
    for (const holiday of next.holidays) {
      insertHoliday.run({
        ...holiday,
        affectsRequiredAttendance: holiday.affectsRequiredAttendance ? 1 : 0
      });
    }

    const insertEntry = db.prepare("insert into schedule_entries (id, date, staff_id, note) values (?, ?, ?, ?)");
    const insertEntryShift = db.prepare(
      "insert into schedule_entry_shifts (entry_id, shift_id, position) values (?, ?, ?)"
    );
    for (const entry of next.scheduleEntries) {
      insertEntry.run(entry.id, entry.date, entry.staffId, entry.note);
      entry.shiftIds.forEach((shiftId, index) => insertEntryShift.run(entry.id, shiftId, index));
    }

    const insertSettlement = db.prepare(`
      insert into monthly_settlements (id, month, month_start, month_end, total_days, bonus_pool, coefficient_total, settled_at)
      values (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertSettlementRow = db.prepare(`
      insert into monthly_settlement_rows (
        settlement_id, position, staff_id, staff_name, staff_job_id, staff_type, attendance_shifts, required_shifts,
        attendance_balance, overtime_shifts, coefficient_total, coefficient_excluded_reason, bonus_amount, bonus_excluded_reason
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const settlement of next.monthlySettlements) {
      insertSettlement.run(
        settlement.id,
        settlement.month,
        settlement.monthStart,
        settlement.monthEnd,
        settlement.totalDays,
        settlement.bonusPool,
        settlement.coefficientTotal,
        settlement.settledAt
      );
      settlement.rows.forEach((row, index) => {
        insertSettlementRow.run(
          settlement.id,
          index,
          row.staffId,
          row.staffName,
          row.staffJobId,
          row.staffType,
          row.attendanceShifts,
          row.requiredShifts,
          row.attendanceBalance,
          row.overtimeShifts,
          row.coefficientTotal,
          row.coefficientExcludedReason,
          row.bonusAmount,
          row.bonusExcludedReason
        );
      });
    }

    db.prepare("insert into app_settings (key, value) values (?, ?)").run(
      "defaultRequiredShiftsPerWeek",
      String(next.settings.defaultRequiredShiftsPerWeek)
    );
    db.prepare("insert into app_settings (key, value) values (?, ?)").run("version", String(next.settings.version));
  });

  replace(data);
}

export function readAppDataFromSqlite(db: Database.Database): AppData {
  const staff = readStaff(db);
  const shifts = readShifts(db);
  const holidays = readHolidays(db);
  const scheduleEntries = readScheduleEntries(db);
  const monthlySettlements = readMonthlySettlements(db);
  const settings = readSettings(db);
  const data: AppData = { staff, shifts, holidays, scheduleEntries, monthlySettlements, settings };
  assertAppData(data);
  return data;
}

type StaffRow = {
  id: string;
  job_id: string;
  name: string;
  type: StaffMember["type"];
  is_admin: number;
  enabled: number;
  sort_order: number;
};

function readStaff(db: Database.Database): StaffMember[] {
  const rows = db
    .prepare("select id, job_id, name, type, is_admin, enabled, sort_order from staff order by sort_order asc, id asc")
    .all() as StaffRow[];

  return rows.map((row) => ({
    id: row.id,
    jobId: row.job_id,
    name: row.name,
    type: row.type,
    isAdmin: row.is_admin === 1,
    enabled: row.enabled === 1,
    sortOrder: row.sort_order
  }));
}

type ShiftRow = {
  id: string;
  name: string;
  short_name: string;
  color: string;
  counts_attendance: number;
  coefficient: number;
  enabled: number;
  sort_order: number;
};

function readShifts(db: Database.Database): Shift[] {
  const rows = db
    .prepare(
      "select id, name, short_name, color, counts_attendance, coefficient, enabled, sort_order from shifts order by sort_order asc, id asc"
    )
    .all() as ShiftRow[];

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    shortName: row.short_name,
    color: row.color,
    countsAttendance: row.counts_attendance === 1,
    coefficient: row.coefficient,
    enabled: row.enabled === 1,
    sortOrder: row.sort_order
  }));
}

type HolidayRow = {
  id: string;
  date: string;
  name: string;
  affects_required_attendance: number;
};

function readHolidays(db: Database.Database): Holiday[] {
  const rows = db
    .prepare("select id, date, name, affects_required_attendance from holidays order by date asc, id asc")
    .all() as HolidayRow[];

  return rows.map((row) => ({
    id: row.id,
    date: row.date,
    name: row.name,
    affectsRequiredAttendance: row.affects_required_attendance === 1
  }));
}

type ScheduleEntryRow = {
  id: string;
  date: string;
  staff_id: string;
  note: string;
};

type ScheduleEntryShiftRow = {
  shift_id: string;
};

function readScheduleEntries(db: Database.Database): ScheduleEntry[] {
  const entries = db
    .prepare("select id, date, staff_id, note from schedule_entries order by date asc, staff_id asc")
    .all() as ScheduleEntryRow[];
  const readShiftIds = db.prepare(
    "select shift_id from schedule_entry_shifts where entry_id = ? order by position asc"
  );

  return entries.map((entry) => {
    const shiftRows = readShiftIds.all(entry.id) as ScheduleEntryShiftRow[];
    return {
      id: entry.id,
      date: entry.date,
      staffId: entry.staff_id,
      shiftIds: shiftRows.map((row) => row.shift_id),
      note: entry.note
    };
  });
}

type MonthlySettlementRecordRow = Omit<MonthlySettlement, "rows">;

type MonthlySettlementDataRow = {
  staff_id: string;
  staff_name: string;
  staff_job_id: string;
  staff_type: MonthlySettlement["rows"][number]["staffType"];
  attendance_shifts: number;
  required_shifts: number;
  attendance_balance: number;
  overtime_shifts: number;
  coefficient_total: number | null;
  coefficient_excluded_reason: string;
  bonus_amount: number;
  bonus_excluded_reason: string;
};

function readMonthlySettlements(db: Database.Database): MonthlySettlement[] {
  const rows = db
    .prepare(
      `
        select
          id,
          month,
          month_start as monthStart,
          month_end as monthEnd,
          total_days as totalDays,
          bonus_pool as bonusPool,
          coefficient_total as coefficientTotal,
          settled_at as settledAt
        from monthly_settlements
        order by month asc
      `
    )
    .all() as MonthlySettlementRecordRow[];
  const readSettlementRows = db.prepare(`
    select
      staff_id,
      staff_name,
      staff_job_id,
      staff_type,
      attendance_shifts,
      required_shifts,
      attendance_balance,
      overtime_shifts,
      coefficient_total,
      coefficient_excluded_reason,
      bonus_amount,
      bonus_excluded_reason
    from monthly_settlement_rows
    where settlement_id = ?
    order by position asc
  `);

  return rows.map((row) => {
    const settlementRows = readSettlementRows.all(row.id) as MonthlySettlementDataRow[];
    return {
      ...row,
      rows: settlementRows.map((settlementRow) => ({
        staffId: settlementRow.staff_id,
        staffName: settlementRow.staff_name,
        staffJobId: settlementRow.staff_job_id,
        staffType: settlementRow.staff_type,
        attendanceShifts: settlementRow.attendance_shifts,
        requiredShifts: settlementRow.required_shifts,
        attendanceBalance: settlementRow.attendance_balance,
        overtimeShifts: settlementRow.overtime_shifts,
        coefficientTotal: settlementRow.coefficient_total,
        coefficientExcludedReason: settlementRow.coefficient_excluded_reason,
        bonusAmount: settlementRow.bonus_amount,
        bonusExcludedReason: settlementRow.bonus_excluded_reason
      }))
    };
  });
}

type SettingRow = {
  key: string;
  value: string;
};

function readSettings(db: Database.Database): Settings {
  const rows = db.prepare("select key, value from app_settings").all() as SettingRow[];
  if (rows.length === 0) {
    return { ...defaultSettings };
  }

  const values = new Map(rows.map((row) => [row.key, row.value]));
  return {
    defaultRequiredShiftsPerWeek: Number(
      values.get("defaultRequiredShiftsPerWeek") ?? defaultSettings.defaultRequiredShiftsPerWeek
    ),
    version: Number(values.get("version") ?? defaultSettings.version)
  };
}
