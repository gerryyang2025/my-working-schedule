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

export function formatSettledAt(settledAt: string): string {
  const date = new Date(settledAt);

  if (Number.isNaN(date.getTime())) {
    return settledAt;
  }

  const parts = Object.fromEntries(
    SHANGHAI_DATE_TIME_FORMATTER.formatToParts(date).map((part) => [part.type, part.value])
  );
  const { day, hour, minute, month, year } = parts;

  if (!year || !month || !day || !hour || !minute) {
    return SHANGHAI_DATE_TIME_FORMATTER.format(date).replace(/\//g, "-");
  }

  return `${year}-${month}-${day} ${hour}:${minute}`;
}
