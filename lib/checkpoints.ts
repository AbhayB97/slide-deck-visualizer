const CHECKPOINT_START_DATE_ISO = "2026-02-01"; // Start calculation from Feb 1 (inclusive)
const CHECKPOINT_WEEKDAY_UTC = 4; // Thursday (Sun=0 ... Sat=6) in UTC

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toUtcDateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function parseIsoDateOnly(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) throw new Error(`Invalid ISO date-only string: ${value}`);
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  return new Date(Date.UTC(year, month, day));
}

function formatIsoDateOnlyUtc(date: Date): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function nextOrSameUtcWeekday(dateUtc: Date, weekday: number): Date {
  const d = toUtcDateOnly(dateUtc);
  const diff = (weekday - d.getUTCDay() + 7) % 7;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

export type CheckpointInfo = {
  checkpointId: string; // e.g. "checkpoint-2026-02-05"
  checkpointDate: string; // "YYYY-MM-DD" (UTC Thursday)
  checkpointOrdinal: number; // 1-based ordinal since first checkpoint >= start date
};

export function getCheckpointInfo(date: Date = new Date()): CheckpointInfo | null {
  const start = parseIsoDateOnly(CHECKPOINT_START_DATE_ISO);
  const dateUtc = toUtcDateOnly(date);
  if (dateUtc.getTime() < start.getTime()) return null;

  const firstCheckpoint = nextOrSameUtcWeekday(start, CHECKPOINT_WEEKDAY_UTC);
  const checkpointDateUtc = nextOrSameUtcWeekday(dateUtc, CHECKPOINT_WEEKDAY_UTC);

  const weeksSinceFirst = Math.floor((checkpointDateUtc.getTime() - firstCheckpoint.getTime()) / (7 * 86400000));
  const checkpointOrdinal = weeksSinceFirst + 1;
  const checkpointDate = formatIsoDateOnlyUtc(checkpointDateUtc);
  const checkpointId = `checkpoint-${checkpointDate}`;

  return { checkpointId, checkpointDate, checkpointOrdinal };
}

