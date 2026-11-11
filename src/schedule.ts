export const TIME_ZONE = "Europe/Copenhagen";
export const SEND_HOUR = 7;

function localParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

export function localDate(now: Date): string {
  const { year, month, day } = localParts(now);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function isWeekend(date: string): boolean {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

export function utcOffsetHours(now: Date): number {
  const { year, month, day, hour, minute } = localParts(now);
  const local = Date.UTC(year, month - 1, day, hour, minute);
  return Math.round((local - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
    now.getUTCHours(), now.getUTCMinutes())) / 3_600_000);
}

/**
 * GitHub cron runs in UTC, so the workflow is scheduled for both possible UTC hours.
 * Only the cron whose UTC hour maps to SEND_HOUR in Copenhagen today should send.
 * Runs without a schedule (manual dispatch or local runs) are always due.
 */
export function isScheduleDue(schedule: string | undefined, now: Date): boolean {
  if (!schedule?.trim()) return true;
  const cronHour = Number(schedule.trim().split(/\s+/u)[1]);
  if (!Number.isInteger(cronHour)) throw new Error(`Unsupported cron schedule: ${schedule}`);
  return (cronHour + utcOffsetHours(now) + 24) % 24 === SEND_HOUR;
}
