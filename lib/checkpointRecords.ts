import type { CheckpointRecord as StoredCheckpointRecord } from "@/lib/checkpointHistory";

// Dashboard backing "history" record (computed).
export type CheckpointHistoryRecord = {
  checkpointDate: string; // Thursday YYYY-MM-DD (Toronto)
  userEmail: string;
  sessionId: string;
  completed: boolean;
};

function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function getSessionsForEmail(record: StoredCheckpointRecord, email: string): string[] {
  const e = normalizeEmail(email);
  const byEmail = record.sessionsByEmail;
  if (byEmail && typeof byEmail === "object") {
    const sessions = byEmail[e];
    return Array.isArray(sessions) ? sessions.filter((s) => typeof s === "string" && s) : [];
  }
  // Back-compat: if session granularity isn't available, return empty (cannot derive per-session completion).
  return [];
}

/**
 * Compute checkpoint history records from stored checkpoint records.
 *
 * Semantics:
 * - For each checkpoint, we emit `completed:false` records for sessions present (still incomplete).
 * - We also emit `completed:true` records at the first checkpoint where a previously-present session disappears.
 *   (i.e., it was present in prior checkpoint, but not present now).
 *
 * `recordsAsc` must be sorted by checkpointOrdinal ascending.
 */
export function computeCheckpointHistory(recordsAsc: StoredCheckpointRecord[]): CheckpointHistoryRecord[] {
  const out: CheckpointHistoryRecord[] = [];

  const prevByEmail = new Map<string, Set<string>>();

  for (const record of recordsAsc) {
    const curByEmail = new Map<string, Set<string>>();

    const byEmail = record.sessionsByEmail;
    if (!byEmail || typeof byEmail !== "object") {
      // If we don't have session-level data, we cannot compute per-session history.
      prevByEmail.clear();
      continue;
    }

    for (const [emailRaw, sessionsRaw] of Object.entries(byEmail)) {
      const email = normalizeEmail(emailRaw);
      if (!email) continue;
      const sessions = Array.isArray(sessionsRaw) ? sessionsRaw.filter((s) => typeof s === "string" && s) : [];
      const set = new Set(sessions);
      curByEmail.set(email, set);

      for (const sessionId of set) {
        out.push({
          checkpointDate: record.checkpointDate,
          userEmail: email,
          sessionId,
          completed: false,
        });
      }
    }

    // Completed sessions: present previously but missing now
    for (const [email, prevSet] of prevByEmail.entries()) {
      const curSet = curByEmail.get(email) ?? new Set<string>();
      for (const sessionId of prevSet) {
        if (curSet.has(sessionId)) continue;
        out.push({
          checkpointDate: record.checkpointDate,
          userEmail: email,
          sessionId,
          completed: true,
        });
      }
    }

    prevByEmail.clear();
    for (const [email, set] of curByEmail.entries()) {
      prevByEmail.set(email, set);
    }
  }

  return out;
}

