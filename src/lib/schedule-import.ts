import type { AppData, ScheduleEntry, Shift, StaffMember, StaffType } from "@/types/domain";
import type { CalendarDay } from "./date";
import { getScheduleWeekNumber, listDateKeys, parseDateKey, toDateKey } from "./date";

export const DEFAULT_SCHEDULE_IMPORT_ALIASES: Record<string, string> = {
  "常班": "常",
  "办公班": "办公",
  "备班1": "备1"
};

export type ScheduleImportErrorScope = "period" | "header" | "row" | "cell";
export type ScheduleImportResolveMode = "exact-name" | "exact-short-name" | "alias";
export type ScheduleImportCellStatus = "import" | "skip-existing";

export interface ScheduleImportValidationError {
  scope: ScheduleImportErrorScope;
  rowNumber?: number;
  columnLabel?: string;
  value?: string;
  message: string;
}

export interface ScheduleImportDay extends CalendarDay {
  columnLabel: string;
}

export interface ScheduleImportPeriod {
  start: string;
  end: string;
  weekNumber: number;
  days: ScheduleImportDay[];
}

export interface ScheduleImportCellPreview {
  date: string;
  columnLabel: string;
  rawValue: string;
  shiftId: string;
  shiftName: string;
  shiftShortName: string;
  shiftColor: string;
  resolvedBy: ScheduleImportResolveMode;
  aliasTarget: string;
  status: ScheduleImportCellStatus;
  existingShiftIds: string[];
  existingShiftLabels: string[];
}

export interface ScheduleImportRowPreview {
  rowNumber: number;
  staffId: string;
  staffName: string;
  staffJobId: string;
  staffType: StaffType;
  cells: ScheduleImportCellPreview[];
}

export interface ScheduleImportPreviewSummary {
  staffCount: number;
  importableCells: number;
  skippedExistingCells: number;
  aliasMappedCells: number;
}

export interface ScheduleImportPreview {
  ok: true;
  period: ScheduleImportPeriod;
  rows: ScheduleImportRowPreview[];
  summary: ScheduleImportPreviewSummary;
  noImportableCells: boolean;
}

export interface ScheduleImportFailure {
  ok: false;
  errors: ScheduleImportValidationError[];
}

export type ScheduleImportValidationResult = ScheduleImportPreview | ScheduleImportFailure;

export interface ScheduleImportValidationInput {
  rawText: string;
  data: AppData;
  aliases?: Record<string, string>;
}

export interface ScheduleImportApplyResult {
  data: AppData;
  imported: number;
  skipped: number;
  aliasMapped: number;
  staffCount: number;
  periodStart: string;
  periodEnd: string;
}

const WEEKDAY_NAMES = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const EXPECTED_HEADER_WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const PERIOD_PATTERN =
  /当前排班周期为\s*(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日\s*[（(](周[一二三四五六日])[）)]\s*至\s*(?:(\d{4})年\s*)?(\d{1,2})月\s*(\d{1,2})日\s*[（(](周[一二三四五六日])[）)]/;
const HEADER_DAY_PATTERN = /^(周[一二三四五六日])\((\d{1,2})\/(\d{1,2})\)$/;

type ParsedPeriod = Omit<ScheduleImportPeriod, "days">;

export function validateScheduleImportText(input: ScheduleImportValidationInput): ScheduleImportValidationResult {
  const rawText = input.rawText.trim();
  if (!rawText) {
    return failure([{ scope: "period", message: "导入内容不能为空" }]);
  }

  const aliases = input.aliases ?? DEFAULT_SCHEDULE_IMPORT_ALIASES;
  const errors: ScheduleImportValidationError[] = [];
  const lines = rawText
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 3) {
    return failure([{ scope: "period", message: "导入内容不完整，请粘贴周期说明和排班表格" }]);
  }

  const period = parsePeriodLine(lines[0], errors);
  const tableRows = parseImportTableRows(lines.slice(1));
  const header = tableRows[0] ?? [];
  const days = period ? parseHeader(header, period, errors) : [];
  const bodyRows = tableRows.slice(1);

  const staffByName = buildStaffByName(input.data.staff, errors);
  const shiftResolver = createShiftResolver(input.data.shifts, aliases, errors);
  const entryByKey = new Map(input.data.scheduleEntries.map((entry) => [`${entry.date}__${entry.staffId}`, entry]));

  if (period) {
    for (const settlement of input.data.monthlySettlements) {
      if (dateRangesOverlap(period.start, period.end, settlement.monthStart, settlement.monthEnd)) {
        errors.push({ scope: "period", message: `${settlement.month} 已月结，不能导入排班` });
      }
    }
  }

  const seenImportNames = new Set<string>();
  const rows: ScheduleImportRowPreview[] = [];

  bodyRows.forEach((row, index) => {
    const rowNumber = index + 3;
    if (row.length !== 8) {
      errors.push({ scope: "row", rowNumber, message: `第${rowNumber}行列数不正确，应为 8 列` });
      return;
    }

    const staffName = row[0] ?? "";
    if (!staffName) {
      errors.push({ scope: "row", rowNumber, message: `第${rowNumber}行人员姓名不能为空` });
      return;
    }
    if (seenImportNames.has(staffName)) {
      errors.push({ scope: "row", rowNumber, value: staffName, message: `导入数据中人员重复：${staffName}` });
      return;
    }
    seenImportNames.add(staffName);

    const staff = staffByName.get(staffName);
    if (!staff) {
      errors.push({ scope: "row", rowNumber, value: staffName, message: `第${rowNumber}行人员不存在或未启用：${staffName}` });
      return;
    }

    const cells = days.map((day, dayIndex) => {
      const rawValue = row[dayIndex + 1] ?? "";
      if (!rawValue) {
        errors.push({ scope: "cell", rowNumber, columnLabel: day.columnLabel, message: `第${rowNumber}行 ${day.columnLabel} 班次不能为空` });
        return null;
      }

      const resolved = shiftResolver(rawValue, rowNumber, day.columnLabel);
      if (!resolved) {
        return null;
      }

      const existing = entryByKey.get(`${day.key}__${staff.id}`);
      return {
        date: day.key,
        columnLabel: day.columnLabel,
        rawValue,
        shiftId: resolved.shift.id,
        shiftName: resolved.shift.name,
        shiftShortName: resolved.shift.shortName,
        shiftColor: resolved.shift.color,
        resolvedBy: resolved.mode,
        aliasTarget: resolved.aliasTarget,
        status: existing && isOccupiedScheduleEntry(existing) ? "skip-existing" : "import",
        existingShiftIds: existing?.shiftIds ?? [],
        existingShiftLabels: existing?.shiftIds.map((shiftId) => shiftLabel(input.data.shifts, shiftId)) ?? []
      } satisfies ScheduleImportCellPreview;
    });

    if (cells.every(Boolean)) {
      rows.push({
        rowNumber,
        staffId: staff.id,
        staffName: staff.name,
        staffJobId: staff.jobId,
        staffType: staff.type,
        cells: cells.filter((cell): cell is ScheduleImportCellPreview => Boolean(cell))
      });
    }
  });

  if (errors.length > 0 || !period || days.length !== 7) {
    return failure(errors);
  }

  const flatCells = rows.flatMap((row) => row.cells);
  const summary: ScheduleImportPreviewSummary = {
    staffCount: rows.length,
    importableCells: flatCells.filter((cell) => cell.status === "import").length,
    skippedExistingCells: flatCells.filter((cell) => cell.status === "skip-existing").length,
    aliasMappedCells: flatCells.filter((cell) => cell.resolvedBy === "alias").length
  };

  return {
    ok: true,
    period: { ...period, days },
    rows,
    summary,
    noImportableCells: summary.importableCells === 0
  };
}

export function applyScheduleImportPreview(data: AppData, preview: ScheduleImportPreview): ScheduleImportApplyResult {
  const existingById = new Map(data.scheduleEntries.map((entry) => [`${entry.date}__${entry.staffId}`, entry]));
  const replacements = new Map<string, ScheduleEntry>();
  const additions: ScheduleEntry[] = [];
  let skipped = 0;
  let imported = 0;

  for (const row of preview.rows) {
    for (const cell of row.cells) {
      const id = `${cell.date}__${row.staffId}`;
      if (cell.status !== "import") {
        skipped += 1;
        continue;
      }
      const nextEntry = { id, date: cell.date, staffId: row.staffId, shiftIds: [cell.shiftId], note: "" };
      const existing = existingById.get(id);
      if (existing && isOccupiedScheduleEntry(existing)) {
        skipped += 1;
        continue;
      }
      if (existing) {
        replacements.set(id, nextEntry);
      } else {
        additions.push(nextEntry);
      }
      existingById.set(id, nextEntry);
      imported += 1;
    }
  }

  return {
    data: {
      ...data,
      scheduleEntries: [
        ...data.scheduleEntries.map((entry) => replacements.get(`${entry.date}__${entry.staffId}`) ?? entry),
        ...additions
      ]
    },
    imported,
    skipped,
    aliasMapped: preview.summary.aliasMappedCells,
    staffCount: preview.summary.staffCount,
    periodStart: preview.period.start,
    periodEnd: preview.period.end
  };
}

function isOccupiedScheduleEntry(entry: ScheduleEntry): boolean {
  return entry.shiftIds.length > 0 || entry.note.trim().length > 0;
}

function failure(errors: ScheduleImportValidationError[]): ScheduleImportFailure {
  return { ok: false, errors };
}

function parseImportTableRows(lines: string[]): string[][] {
  return lines
    .filter((line) => !isMarkdownSeparatorRow(line))
    .map((line) => {
      if (line.includes("\t")) {
        return line.split("\t").map((cell) => cell.trim());
      }

      if (line.includes("|")) {
        const cells = line.split("|").map((cell) => cell.trim());
        if (cells[0] === "") {
          cells.shift();
        }
        if (cells[cells.length - 1] === "") {
          cells.pop();
        }
        return cells;
      }

      return [line.trim()];
    });
}

function isMarkdownSeparatorRow(line: string): boolean {
  if (!line.includes("|")) {
    return false;
  }

  const cells = line
    .split("|")
    .map((cell) => cell.trim())
    .filter((cell) => cell.length > 0);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function parsePeriodLine(line: string, errors: ScheduleImportValidationError[]): ParsedPeriod | null {
  const match = line.match(PERIOD_PATTERN);
  if (!match) {
    errors.push({ scope: "period", message: "排班周期格式不正确" });
    return null;
  }

  const startYear = Number(match[1]);
  const startMonth = Number(match[2]);
  const startDay = Number(match[3]);
  const startWeekday = match[4];
  const explicitEndYear = match[5] ? Number(match[5]) : undefined;
  const endMonth = Number(match[6]);
  const endDay = Number(match[7]);
  const endWeekday = match[8];
  const endYear = explicitEndYear ?? (endMonth < startMonth || (endMonth === startMonth && endDay < startDay) ? startYear + 1 : startYear);

  const startDate = new Date(startYear, startMonth - 1, startDay);
  const endDate = new Date(endYear, endMonth - 1, endDay);
  const start = toDateKey(startDate);
  const end = toDateKey(endDate);

  if (start !== formatDateKey(startYear, startMonth, startDay)) {
    errors.push({ scope: "period", message: `周期开始日期不存在：${formatDateKey(startYear, startMonth, startDay)}` });
    return null;
  }
  if (end !== formatDateKey(endYear, endMonth, endDay)) {
    errors.push({ scope: "period", message: `周期结束日期不存在：${formatDateKey(endYear, endMonth, endDay)}` });
    return null;
  }

  if (WEEKDAY_NAMES[startDate.getDay()] !== startWeekday) {
    errors.push({ scope: "period", message: `周期开始日期与星期不一致：${start} 不是${startWeekday}` });
  }
  if (WEEKDAY_NAMES[endDate.getDay()] !== endWeekday) {
    errors.push({ scope: "period", message: `周期结束日期与星期不一致：${end} 不是${endWeekday}` });
  }

  const dateKeys = listDateKeys(start, end);
  if (dateKeys.length !== 7 || startDate.getDay() !== 1 || endDate.getDay() !== 0) {
    errors.push({ scope: "period", message: "排班周期必须为周一至周日的 7 天" });
  }

  return {
    start,
    end,
    weekNumber: getScheduleWeekNumber(start)
  };
}

function parseHeader(header: string[], period: ParsedPeriod, errors: ScheduleImportValidationError[]): ScheduleImportDay[] {
  if (header.length !== 8) {
    errors.push({ scope: "header", message: "表头列数不正确，应为 8 列" });
    return [];
  }
  if (header[0] !== "姓名") {
    errors.push({ scope: "header", columnLabel: header[0], message: "表头第一列必须为姓名" });
    return [];
  }

  const dateKeys = listDateKeys(period.start, period.end);
  if (dateKeys.length !== 7) {
    return [];
  }

  const days: ScheduleImportDay[] = [];
  header.slice(1).forEach((columnLabel, index) => {
    const match = columnLabel.match(HEADER_DAY_PATTERN);
    if (!match) {
      errors.push({ scope: "header", columnLabel, message: `表头日期格式不正确：${columnLabel}` });
      return;
    }

    const expectedWeekday = EXPECTED_HEADER_WEEKDAYS[index];
    const weekday = match[1];
    if (weekday !== expectedWeekday) {
      errors.push({ scope: "header", columnLabel, message: `表头星期顺序不正确：${columnLabel} 应为 ${expectedWeekday}` });
    }

    const dateKey = dateKeys[index];
    const date = parseDateKey(dateKey);
    const month = Number(match[2]);
    const dayOfMonth = Number(match[3]);
    if (date.getMonth() + 1 !== month || date.getDate() !== dayOfMonth) {
      errors.push({ scope: "header", columnLabel, message: `表头日期与周期不一致：${columnLabel}` });
    }

    days.push({
      key: dateKey,
      dayOfMonth: date.getDate(),
      weekday: date.getDay(),
      weekdayName: WEEKDAY_NAMES[date.getDay()],
      isWeekend: date.getDay() === 0 || date.getDay() === 6,
      columnLabel
    });
  });

  return days;
}

function buildStaffByName(staff: StaffMember[], errors: ScheduleImportValidationError[]): Map<string, StaffMember> {
  const staffByName = new Map<string, StaffMember>();
  const duplicateNames = new Set<string>();

  for (const member of staff) {
    if (!member.enabled) {
      continue;
    }
    if (staffByName.has(member.name)) {
      duplicateNames.add(member.name);
      continue;
    }
    staffByName.set(member.name, member);
  }

  for (const name of duplicateNames) {
    staffByName.delete(name);
    errors.push({ scope: "row", value: name, message: `系统中存在重复启用人员姓名：${name}` });
  }

  return staffByName;
}

function createShiftResolver(
  shifts: Shift[],
  aliases: Record<string, string>,
  errors: ScheduleImportValidationError[]
): (rawValue: string, rowNumber: number, columnLabel: string) => { shift: Shift; mode: ScheduleImportResolveMode; aliasTarget: string } | null {
  const exactByValue = new Map<string, Array<{ shift: Shift; mode: ScheduleImportResolveMode }>>();
  const ambiguousValues = new Set<string>();

  for (const shift of shifts) {
    if (!shift.enabled) {
      continue;
    }
    addExactShift(exactByValue, shift.name, shift, "exact-name");
    if (shift.shortName !== shift.name) {
      addExactShift(exactByValue, shift.shortName, shift, "exact-short-name");
    }
  }

  for (const [value, matches] of exactByValue) {
    const uniqueShiftIds = new Set(matches.map((match) => match.shift.id));
    if (uniqueShiftIds.size > 1) {
      ambiguousValues.add(value);
      errors.push({ scope: "cell", value, message: `系统中存在重复启用班次名称：${value}` });
    }
  }

  const resolveExact = (value: string) => {
    if (ambiguousValues.has(value)) {
      return null;
    }
    const matches = exactByValue.get(value) ?? [];
    return matches[0] ?? null;
  };

  return (rawValue: string, rowNumber: number, columnLabel: string) => {
    const exact = resolveExact(rawValue);
    if (exact) {
      return { ...exact, aliasTarget: "" };
    }

    const aliasTarget = aliases[rawValue];
    if (aliasTarget) {
      const aliasMatch = resolveExact(aliasTarget);
      if (aliasMatch) {
        return { shift: aliasMatch.shift, mode: "alias", aliasTarget };
      }
    }

    errors.push({ scope: "cell", rowNumber, columnLabel, value: rawValue, message: `第${rowNumber}行 ${columnLabel} 班次不存在或未启用：${rawValue}` });
    return null;
  };
}

function shiftLabel(shifts: Shift[], shiftId: string): string {
  const shift = shifts.find((candidate) => candidate.id === shiftId);
  return shift ? shift.shortName || shift.name : shiftId;
}

function dateRangesOverlap(leftStart: string, leftEnd: string, rightStart: string, rightEnd: string): boolean {
  const leftStartTime = parseDateKey(leftStart).getTime();
  const leftEndTime = parseDateKey(leftEnd).getTime();
  const rightStartTime = parseDateKey(rightStart).getTime();
  const rightEndTime = parseDateKey(rightEnd).getTime();
  return leftStartTime <= rightEndTime && rightStartTime <= leftEndTime;
}

function addExactShift(
  exactByValue: Map<string, Array<{ shift: Shift; mode: ScheduleImportResolveMode }>>,
  value: string,
  shift: Shift,
  mode: ScheduleImportResolveMode
): void {
  const matches = exactByValue.get(value) ?? [];
  matches.push({ shift, mode });
  exactByValue.set(value, matches);
}

function formatDateKey(year: number, month: number, day: number): string {
  return `${year}-${`${month}`.padStart(2, "0")}-${`${day}`.padStart(2, "0")}`;
}
