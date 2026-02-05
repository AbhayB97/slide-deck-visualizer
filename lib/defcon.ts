import type { CheckpointRecord } from "@/lib/checkpointHistory";

export type DefconLevel =
  | "DEFCON_1"
  | "DEFCON_2"
  | "DEFCON_3"
  | "DEFCON_4"
  | "DEFCON_5"
  | "DEFCON_6";

export type UserDefconState = {
  defcon: DefconLevel;
  incompleteSessionCount: number;
  oldestSessionConsecutiveCheckpoints: number;
  averageSessionConsecutiveCheckpoints: number;
  firstCheckpointSeen: string; // checkpointDate of oldest session
  oldestSessionId: string;
};

function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function rank(defcon: DefconLevel): number {
  switch (defcon) {
    case "DEFCON_1":
      return 1;
    case "DEFCON_2":
      return 2;
    case "DEFCON_3":
      return 3;
    case "DEFCON_4":
      return 4;
    case "DEFCON_5":
      return 5;
    case "DEFCON_6":
      return 6;
  }
}

function scoreFromMetrics(params: {
  oldest: number;
  avg: number;
  count: number;
}): number {
  const { oldest, avg, count } = params;
  const countBoost = count > 0 ? Math.log2(1 + count) : 0;
  // Oldest is the dominant factor, but not the only factor.
  return 2 * oldest + 1 * avg + 0.5 * countBoost;
}

function defconFromScore(score: number, hasAny: boolean): DefconLevel {
  if (!hasAny) return "DEFCON_6";
  // Thresholds are in "checkpoint units" (weekly cadence).
  if (score >= 12) return "DEFCON_1";
  if (score >= 9) return "DEFCON_2";
  if (score >= 7) return "DEFCON_3";
  if (score >= 5) return "DEFCON_4";
  return "DEFCON_5";
}

function sessionsForEmailAt(record: CheckpointRecord, email: string): string[] {
  const byEmail = record.sessionsByEmail;
  if (!byEmail || typeof byEmail !== "object") return [];
  const sessions = byEmail[normalizeEmail(email)];
  return Array.isArray(sessions) ? sessions.filter((s) => typeof s === "string" && s) : [];
}

function isPresent(record: CheckpointRecord, email: string, sessionId: string): boolean {
  return sessionsForEmailAt(record, email).includes(sessionId);
}

function consecutiveEndingAt(recordsAsc: CheckpointRecord[], endIdx: number, email: string, sessionId: string): number {
  let count = 0;
  for (let i = endIdx; i >= 0; i -= 1) {
    if (!isPresent(recordsAsc[i], email, sessionId)) break;
    count += 1;
  }
  return count;
}

function firstSeen(recordsAsc: CheckpointRecord[], endIdx: number, email: string, sessionId: string): string | null {
  for (let i = 0; i <= endIdx; i += 1) {
    if (isPresent(recordsAsc[i], email, sessionId)) return recordsAsc[i].checkpointDate;
  }
  return null;
}

export function deriveUserDefconAtCheckpoint(params: {
  recordsAsc: CheckpointRecord[];
  email: string;
  currentCheckpointId: string;
}): UserDefconState | null {
  const { recordsAsc, email, currentCheckpointId } = params;
  const idx = recordsAsc.findIndex((r) => r.checkpointId === currentCheckpointId);
  if (idx < 0) return null;

  const current = recordsAsc[idx];
  const sessionIds = Array.from(new Set(sessionsForEmailAt(current, email)));
  const incompleteSessionCount = sessionIds.length;
  if (!incompleteSessionCount) {
    return {
      defcon: "DEFCON_6",
      incompleteSessionCount: 0,
      oldestSessionConsecutiveCheckpoints: 0,
      averageSessionConsecutiveCheckpoints: 0,
      firstCheckpointSeen: "",
      oldestSessionId: "",
    };
  }

  const streaks = sessionIds.map((sid) => ({
    sessionId: sid,
    consecutive: consecutiveEndingAt(recordsAsc, idx, email, sid),
    first: firstSeen(recordsAsc, idx, email, sid) ?? "",
  }));

  streaks.sort((a, b) => b.consecutive - a.consecutive || a.sessionId.localeCompare(b.sessionId));
  const oldest = streaks[0];
  const oldestConsecutive = oldest.consecutive;
  const avg = streaks.reduce((sum, s) => sum + s.consecutive, 0) / streaks.length;

  const score = scoreFromMetrics({ oldest: oldestConsecutive, avg, count: incompleteSessionCount });
  const defcon = defconFromScore(score, true);

  return {
    defcon,
    incompleteSessionCount,
    oldestSessionConsecutiveCheckpoints: oldestConsecutive,
    averageSessionConsecutiveCheckpoints: Number.isFinite(avg) ? avg : 0,
    firstCheckpointSeen: oldest.first,
    oldestSessionId: oldest.sessionId,
  };
}

export function actionDueNow(params: { current: DefconLevel; previous: DefconLevel | null }): boolean {
  const { current, previous } = params;
  if (!previous) return current !== "DEFCON_6";
  return rank(current) < rank(previous);
}

export function findNextEscalationDate(params: {
  currentCheckpointDate: string;
  currentState: UserDefconState;
}): string {
  const { currentCheckpointDate, currentState } = params;
  if (!currentState || currentState.defcon === "DEFCON_1" || currentState.defcon === "DEFCON_6") return "";

  const parse = /^(\d{4})-(\d{2})-(\d{2})$/.exec(currentCheckpointDate);
  if (!parse) return "";
  const base = new Date(Date.UTC(Number(parse[1]), Number(parse[2]) - 1, Number(parse[3])));
  if (Number.isNaN(base.getTime())) return "";

  // Approximate: next checkpoint (7 days) with same sessions still incomplete increases streaks by 1.
  // We check when the defcon would worsen.
  const currentRank = rank(currentState.defcon);
  const oldest0 = currentState.oldestSessionConsecutiveCheckpoints;
  const avg0 = currentState.averageSessionConsecutiveCheckpoints;
  const count = currentState.incompleteSessionCount;

  for (let weeks = 1; weeks <= 12; weeks += 1) {
    const oldest = oldest0 + weeks;
    const avg = avg0 + weeks;
    const score = scoreFromMetrics({ oldest, avg, count });
    const next = defconFromScore(score, count > 0);
    if (rank(next) < currentRank) {
      const d = new Date(base.getTime());
      d.setUTCDate(d.getUTCDate() + 7 * weeks);
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    }
  }
  return "";
}

