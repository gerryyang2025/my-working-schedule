import type { CalendarDay } from "./date";
import { addDays, getWeekRange, parseDateKey, toDateKey } from "./date";

export interface ScheduleQueryWeekGroup {
  id: string;
  start: string;
  end: string;
  days: CalendarDay[];
}

export type ScheduleQueryRangeResult =
  | {
      ok: true;
      message: "";
      days: CalendarDay[];
      weekGroups: ScheduleQueryWeekGroup[];
      isLongRange: boolean;
    }
  | {
      ok: false;
      message: string;
      days: [];
      weekGroups: [];
      isLongRange: false;
    };

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const LONG_RANGE_WARNING_DAYS = 180;

function isValidDateKey(value: string): boolean {
  if (!DATE_KEY_PATTERN.test(value)) {
    return false;
  }

  const parsed = parseDateKey(value);
  return !Number.isNaN(parsed.getTime()) && toDateKey(parsed) === value;
}

function calendarDayFromKey(key: string): CalendarDay {
  const date = parseDateKey(key);
  const weekday = date.getDay();

  return {
    key,
    dayOfMonth: date.getDate(),
    weekday,
    weekdayName: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][weekday],
    isWeekend: weekday === 0 || weekday === 6
  };
}

function expandDateRange(startDate: string, endDate: string): CalendarDay[] {
  const days: CalendarDay[] = [];
  let cursor = startDate;

  while (cursor <= endDate) {
    days.push(calendarDayFromKey(cursor));
    cursor = addDays(cursor, 1);
  }

  return days;
}

function groupDaysByNaturalWeek(days: CalendarDay[]): ScheduleQueryWeekGroup[] {
  const groups: ScheduleQueryWeekGroup[] = [];

  for (const day of days) {
    const weekStart = getWeekRange(day.key).start;
    const lastGroup = groups[groups.length - 1];

    if (!lastGroup || lastGroup.id !== weekStart) {
      groups.push({
        id: weekStart,
        start: day.key,
        end: day.key,
        days: [day]
      });
      continue;
    }

    lastGroup.days.push(day);
    lastGroup.end = day.key;
  }

  return groups;
}

export function validateScheduleQueryRange(startDate: string, endDate: string): ScheduleQueryRangeResult {
  const normalizedStart = startDate.trim();
  const normalizedEnd = endDate.trim();

  if (!isValidDateKey(normalizedStart) || !isValidDateKey(normalizedEnd)) {
    return {
      ok: false,
      message: "请输入完整的开始日期和结束日期",
      days: [],
      weekGroups: [],
      isLongRange: false
    };
  }

  if (normalizedStart > normalizedEnd) {
    return {
      ok: false,
      message: "开始日期不能晚于结束日期",
      days: [],
      weekGroups: [],
      isLongRange: false
    };
  }

  const days = expandDateRange(normalizedStart, normalizedEnd);

  return {
    ok: true,
    message: "",
    days,
    weekGroups: groupDaysByNaturalWeek(days),
    isLongRange: days.length > LONG_RANGE_WARNING_DAYS
  };
}
