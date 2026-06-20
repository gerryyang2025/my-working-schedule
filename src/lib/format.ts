const SHANGHAI_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  hourCycle: "h23"
});

const SHANGHAI_AUDIT_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  hourCycle: "h23"
});

function formatShanghaiDateTime(value: string, formatter: Intl.DateTimeFormat, includeSeconds: boolean): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const { day, hour, minute, month, second, year } = parts;

  if (!year || !month || !day || !hour || !minute || (includeSeconds && !second)) {
    return formatter.format(date).replace(/\//g, "-");
  }

  return includeSeconds
    ? `${year}-${month}-${day} ${hour}:${minute}:${second}`
    : `${year}-${month}-${day} ${hour}:${minute}`;
}

export function formatSettledAt(settledAt: string): string {
  return formatShanghaiDateTime(settledAt, SHANGHAI_DATE_TIME_FORMATTER, false);
}

export function formatAuditOccurredAt(occurredAt: string): string {
  return formatShanghaiDateTime(occurredAt, SHANGHAI_AUDIT_DATE_TIME_FORMATTER, true);
}
