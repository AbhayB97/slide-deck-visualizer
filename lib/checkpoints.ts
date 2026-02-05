// Hardcoded checkpoint constants (Toronto time).
export const TIMEZONE = "America/Toronto";
export const CUTOFF_DATE = "2026-02-12T09:00:00-05:00"; // Toronto time (offset provided)

const CHECKPOINT_WEEKDAY = 4; // Thursday (Sun=0 ... Sat=6)
const CHECKPOINT_HOUR = 9;
const CHECKPOINT_MINUTE = 0;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

type CivilDate = { year: number; month: number; day: number }; // month: 1-12
type CivilDateTime = CivilDate & { hour: number; minute: number; second: number };

function formatIsoDateOnly(date: CivilDate): string {
  return `${date.year}-${pad2(date.month)}-${pad2(date.day)}`;
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

function getCivilDateTimeInTimeZone(date: Date, timeZone: string): CivilDateTime {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(date);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const minute = Number(parts.find((p) => p.type === "minute")?.value);
  const second = Number(parts.find((p) => p.type === "second")?.value);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    !Number.isFinite(second)
  ) {
    throw new Error(`Failed to compute civil datetime for timezone: ${timeZone}`);
  }
  return { year, month, day, hour, minute, second };
}

function diffMinutes(a: CivilDateTime, b: CivilDateTime): number {
  const aDays = toJdn(a);
  const bDays = toJdn(b);
  return (
    (aDays - bDays) * 1440 +
    (a.hour - b.hour) * 60 +
    (a.minute - b.minute)
  );
}

// Convert a Toronto civil datetime to a UTC Date by iteratively correcting the offset using Intl.
function zonedTimeToUtc(target: CivilDateTime, timeZone: string): Date {
  // Initial guess: treat the civil datetime as if it were UTC.
  let utcMs = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute, target.second, 0);
  for (let i = 0; i < 4; i += 1) {
    const guess = new Date(utcMs);
    const actualLocal = getCivilDateTimeInTimeZone(guess, timeZone);
    const delta = diffMinutes(target, actualLocal);
    if (delta === 0) return guess;
    utcMs += delta * 60000;
  }
  return new Date(utcMs);
}

export type CheckpointInfo = {
  checkpointId: string; // e.g. "checkpoint-2026-02-05"
  checkpointDate: string; // "YYYY-MM-DD" (Toronto Thursday)
  checkpointOrdinal: number; // 1-based ordinal since first checkpoint >= start date
};

export function getCheckpointInfo(date: Date = new Date()): CheckpointInfo | null {
  const cutoff = new Date(CUTOFF_DATE);
  if (Number.isNaN(cutoff.getTime())) {
    throw new Error(`Invalid CUTOFF_DATE: ${CUTOFF_DATE}`);
  }

  // Guardrail: no checkpoints in prod before cutover.
  const forceEnabled = String(process.env.CHECKPOINTS_FORCE_ENABLED || "").toLowerCase() === "true";
  if (!forceEnabled && date.getTime() < cutoff.getTime()) {
    return null;
  }
  // In test mode, treat "now" as the effective cutoff so we can exercise the model without retroactive escalation.
  const effectiveCutoff = forceEnabled && date.getTime() < cutoff.getTime() ? date : cutoff;

  const localNow = getCivilDateTimeInTimeZone(date, TIMEZONE);
  const localDate: CivilDate = { year: localNow.year, month: localNow.month, day: localNow.day };

  // Compute the Thursday of the current local week (next-or-same Thursday).
  const dow = dayOfWeek(localDate);
  const toThursday = (CHECKPOINT_WEEKDAY - dow + 7) % 7;
  const thursday = addDays(localDate, toThursday);

  // Candidate checkpoint is this Thursday at 09:00 Toronto.
  const candidateLocal: CivilDateTime = {
    year: thursday.year,
    month: thursday.month,
    day: thursday.day,
    hour: CHECKPOINT_HOUR,
    minute: CHECKPOINT_MINUTE,
    second: 0,
  };
  const candidateUtc = zonedTimeToUtc(candidateLocal, TIMEZONE);

  // If now is before the candidate checkpoint (including Thursday before 09:00), use previous Thursday.
  const checkpointCivilDate = date.getTime() < candidateUtc.getTime() ? addDays(thursday, -7) : thursday;

  // Ordinal: weeks since the first checkpoint at/after cutoff.
  const cutoffLocal = getCivilDateTimeInTimeZone(effectiveCutoff, TIMEZONE);
  const firstCheckpointDate: CivilDate = { year: cutoffLocal.year, month: cutoffLocal.month, day: cutoffLocal.day };
  const daysSinceFirst = toJdn(checkpointCivilDate) - toJdn(firstCheckpointDate);
  const weeksSinceFirst = Math.floor(daysSinceFirst / 7);
  const checkpointOrdinal = Math.max(1, weeksSinceFirst + 1);

  const checkpointDate = formatIsoDateOnly(checkpointCivilDate);
  const checkpointId = `checkpoint-${checkpointDate}`;

  return { checkpointId, checkpointDate, checkpointOrdinal };
}
