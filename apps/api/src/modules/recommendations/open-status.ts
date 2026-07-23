import type { OpenStatus } from '@pitstop/contracts';
import type {
  DatabasePublicOperatingHour,
  DatabasePublicOperatingHourException,
} from '@pitstop/database';

const jakartaTimeZone = 'Asia/Jakarta';
const weekdayNumbers: Readonly<Record<string, number>> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

interface LocalTime {
  readonly date: string;
  readonly dayOfWeek: number;
  readonly minutes: number;
}

interface Interval {
  readonly opensAt: string | null;
  readonly closesAt: string | null;
  readonly is24Hours: boolean;
}

export function resolveOpenStatus(
  hours: readonly DatabasePublicOperatingHour[],
  exceptions: readonly DatabasePublicOperatingHourException[],
  now: Date,
): OpenStatus {
  const local = localTime(now);
  const previousDate = addDays(local.date, -1);
  const previousDay = (local.dayOfWeek + 6) % 7;
  const currentExceptions = exceptions.filter((entry) => entry.exceptionDate === local.date);
  const previousExceptions = exceptions.filter((entry) => entry.exceptionDate === previousDate);
  const currentIntervals =
    currentExceptions.length > 0
      ? exceptionIntervals(currentExceptions)
      : scheduleIntervals(hours.filter((entry) => entry.dayOfWeek === local.dayOfWeek));
  const previousIntervals =
    previousExceptions.length > 0
      ? exceptionIntervals(previousExceptions)
      : scheduleIntervals(hours.filter((entry) => entry.dayOfWeek === previousDay));

  const remaining = [
    ...currentIntervals.map((interval) => remainingMinutes(interval, local.minutes, false)),
    ...previousIntervals.map((interval) => remainingMinutes(interval, local.minutes, true)),
  ].filter((value): value is number => value !== null);
  if (remaining.length > 0) {
    return Math.min(...remaining) <= 60 ? 'CLOSING_SOON' : 'OPEN';
  }
  return hours.length === 0 && exceptions.length === 0 ? 'UNKNOWN' : 'CLOSED';
}

function localTime(date: Date): LocalTime {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: jakartaTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  const dayOfWeek = weekdayNumbers[parts.weekday ?? ''];
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  if (
    dayOfWeek === undefined ||
    !parts.year ||
    !parts.month ||
    !parts.day ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute)
  ) {
    throw new TypeError('Unable to resolve Asia/Jakarta local time');
  }
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    dayOfWeek,
    minutes: hour * 60 + minute,
  };
}

function scheduleIntervals(entries: readonly DatabasePublicOperatingHour[]): readonly Interval[] {
  return entries.map((entry) => ({
    opensAt: entry.opensAt,
    closesAt: entry.closesAt,
    is24Hours: entry.is24Hours,
  }));
}

function exceptionIntervals(
  entries: readonly DatabasePublicOperatingHourException[],
): readonly Interval[] {
  return entries
    .filter((entry) => !entry.isClosed)
    .map((entry) => ({
      opensAt: entry.opensAt,
      closesAt: entry.closesAt,
      is24Hours: false,
    }));
}

function remainingMinutes(
  interval: Interval,
  nowMinutes: number,
  fromPreviousDay: boolean,
): number | null {
  if (interval.is24Hours) return fromPreviousDay ? null : 24 * 60;
  if (interval.opensAt === null || interval.closesAt === null) return null;
  const opens = parseTime(interval.opensAt);
  const closes = parseTime(interval.closesAt);
  if (opens === closes) return null;
  if (opens < closes) {
    return !fromPreviousDay && nowMinutes >= opens && nowMinutes < closes
      ? closes - nowMinutes
      : null;
  }
  if (fromPreviousDay) return nowMinutes < closes ? closes - nowMinutes : null;
  return nowMinutes >= opens ? 24 * 60 - nowMinutes + closes : null;
}

function parseTime(value: string): number {
  const [hourText, minuteText] = value.split(':');
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    throw new TypeError(`Invalid operating time: ${value}`);
  }
  return hour * 60 + minute;
}

function addDays(date: string, days: number): string {
  const [yearText, monthText, dayText] = date.split('-');
  const value = new Date(Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText) + days));
  return value.toISOString().slice(0, 10);
}
