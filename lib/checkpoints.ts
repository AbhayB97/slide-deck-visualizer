const CHECKPOINT_START_DATE_ISO = "2026-02-01"; // Start calculation from Feb 1 (inclusive, Toronto civil date)
const CHECKPOINT_TIMEZONE = "America/Toronto";
const CHECKPOINT_WEEKDAY = 4; // Thursday (Sun=0 ... Sat=6) in Toronto

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

type CivilDate = { year: number; month: number; day: number }; // month: 1-12

function parseIsoDateOnly(value: string): CivilDate {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) throw new Error(`Invalid ISO date-only string: ${value}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

function formatIsoDateOnly(date: CivilDate): string {
  return `${date.year}-${pad2(date.month)}-${pad2(date.day)}`;
}

function compareCivilDate(a: CivilDate, b: CivilDate): number {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  return a.day - b.day;
}

// Sakamoto's algorithm: 0=Sunday ... 6=Saturday
function dayOfWeek({ year, month, day }: CivilDate): number {
  const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  let y = year;
  if (month < 3) y -= 1;
  return (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + t[month - 1] + day) % 7;
}

// Convert between CivilDate and Julian Day Number (JDN) for safe date arithmetic without timezone/DST.
function toJdn({ year, month, day }: CivilDate): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return (
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  );
}

function fromJdn(jdn: number): CivilDate {
  const a = jdn + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  const day = e - Math.floor((153 * m + 2) / 5) + 1;
  const month = m + 3 - 12 * Math.floor(m / 10);
  const year = 100 * b + d - 4800 + Math.floor(m / 10);
  return { year, month, day };
}

function addDays(date: CivilDate, days: number): CivilDate {
  return fromJdn(toJdn(date) + days);
}

function nextOrSameWeekday(date: CivilDate, weekday: number): CivilDate {
  const diff = (weekday - dayOfWeek(date) + 7) % 7;
  return addDays(date, diff);
}

function getCivilDateInTimeZone(date: Date, timeZone: string): CivilDate {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    throw new Error(`Failed to compute civil date for timezone: ${timeZone}`);
  }
  return { year, month, day };
}

export type CheckpointInfo = {
  checkpointId: string; // e.g. "checkpoint-2026-02-05"
  checkpointDate: string; // "YYYY-MM-DD" (Toronto Thursday)
  checkpointOrdinal: number; // 1-based ordinal since first checkpoint >= start date
};

export function getCheckpointInfo(date: Date = new Date()): CheckpointInfo | null {
  const start = parseIsoDateOnly(CHECKPOINT_START_DATE_ISO);
  const localDate = getCivilDateInTimeZone(date, CHECKPOINT_TIMEZONE);
  if (compareCivilDate(localDate, start) < 0) return null;

  const firstCheckpoint = nextOrSameWeekday(start, CHECKPOINT_WEEKDAY);
  const checkpointDateLocal = nextOrSameWeekday(localDate, CHECKPOINT_WEEKDAY);

  const daysSinceFirst = toJdn(checkpointDateLocal) - toJdn(firstCheckpoint);
  const weeksSinceFirst = Math.floor(daysSinceFirst / 7);
  const checkpointOrdinal = weeksSinceFirst + 1;
  const checkpointDate = formatIsoDateOnly(checkpointDateLocal);
  const checkpointId = `checkpoint-${checkpointDate}`;

  return { checkpointId, checkpointDate, checkpointOrdinal };
}
