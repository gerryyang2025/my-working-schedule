export interface CalendarDay {
  key: string;
  dayOfMonth: number;
  weekday: number;
  weekdayName: string;
  isWeekend: boolean;
}

const WEEKDAY_NAMES = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDateKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function addDays(key: string, offset: number): string {
  const date = parseDateKey(key);
  date.setDate(date.getDate() + offset);
  return toDateKey(date);
}

export function getMonthDays(year: number, month: number): CalendarDay[] {
  const lastDay = new Date(year, month, 0).getDate();
  return Array.from({ length: lastDay }, (_, index) => {
    const date = new Date(year, month - 1, index + 1);
    const weekday = date.getDay();
    return {
      key: toDateKey(date),
      dayOfMonth: index + 1,
      weekday,
      weekdayName: WEEKDAY_NAMES[weekday],
      isWeekend: weekday === 0 || weekday === 6
    };
  });
}

export function getWeekRange(dateKey: string): { start: string; end: string } {
  const date = parseDateKey(dateKey);
  const weekday = date.getDay();
  const offsetToMonday = weekday === 0 ? -6 : 1 - weekday;
  const monday = new Date(date);
  monday.setDate(date.getDate() + offsetToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: toDateKey(monday),
    end: toDateKey(sunday)
  };
}

export function listDateKeys(start: string, end: string): string[] {
  const keys: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    keys.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return keys;
}
