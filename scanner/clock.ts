// Europe/London clock. The strategy's data times are UK times.

export type LondonClock = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** 0 Sunday through 6 Saturday. */
  weekday: number;
  date: string;
  label: string;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function londonClock(now: Date): LondonClock {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(now);
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  let hour = Number(read("hour"));
  if (hour === 24) hour = 0;
  const minute = Number(read("minute"));
  const year = Number(read("year"));
  const month = Number(read("month"));
  const day = Number(read("day"));
  const weekdayName = read("weekday").slice(0, 3);
  const weekday = Math.max(0, WEEKDAYS.indexOf(weekdayName));
  return {
    year,
    month,
    day,
    hour,
    minute,
    weekday,
    date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    label: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
}

export function londonDate(timeMs: number): string {
  return londonClock(new Date(timeMs)).date;
}

export function minutesOfDay(clock: LondonClock): number {
  return clock.hour * 60 + clock.minute;
}

/** Standing UK blackouts the price feed can apply without a news model. */
export function timingBlock(clock: LondonClock): string | null {
  if (clock.weekday === 0 || clock.weekday === 6) return "weekend, flatten and do not open";
  const mins = minutesOfDay(clock);
  if (clock.weekday === 5 && mins >= 20 * 60) return "Friday after 20:00 UK, close before the weekend";
  if (mins >= 13 * 60 + 15 && mins < 13 * 60 + 45) return "15 minutes either side of 13:30 UK US data";
  if (mins >= 14 * 60 + 15 && mins < 15 * 60 + 15) {
    return "US open is 14:30 UK: no entries 15 minutes before it, through the 30 minute wait, and through 15:00 UK ISM";
  }
  return null;
}
