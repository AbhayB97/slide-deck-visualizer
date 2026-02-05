import type { CheckpointRecord } from "@/lib/checkpointHistory";

export type EscalationLevel =
  | "DEFCON_1"
  | "DEFCON_2"
  | "DEFCON_3"
  | "DEFCON_4"
  | "DEFCON_5"
  | "DEFCON_6";

export type DerivedEscalationState = {
  firstCheckpointSeen: string; // YYYY-MM-DD (Thursday)
  consecutiveCheckpointCount: number;
  escalationLevel: EscalationLevel;
};

export function escalationLevelFromCount(count: number): EscalationLevel {
  // DEFCON 1 is highest severity/critical.
  // Count is consecutive checkpoints on list for this (user, session).
  if (count >= 5) return "DEFCON_1";
  if (count === 4) return "DEFCON_2";
  if (count === 3) return "DEFCON_3";
  if (count === 2) return "DEFCON_4";
  if (count === 1) return "DEFCON_5";
  return "DEFCON_6";
}

function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

export function buildSessionKey(sentDate: string, title: string): string {
  return `${(sentDate ?? "").trim()}::${(title ?? "").trim()}`;
}

function isPresent(record: CheckpointRecord, email: string, sessionKey: string): boolean {
  const byEmail = record.sessionsByEmail;
  if (byEmail && typeof byEmail === "object") {
    const sessions = byEmail[normalizeEmail(email)];
    return Array.isArray(sessions) && sessions.includes(sessionKey);
  }
  // Back-compat: if we only have highRiskEmails, we can only tell "user on list", not per-session.
  return Array.isArray(record.highRiskEmails) && record.highRiskEmails.includes(normalizeEmail(email));
}

/**
 * Derives escalation state for a specific (user, session) at a given checkpoint.
 * `recordsAsc` must be sorted by checkpointOrdinal ascending.
 */
export function deriveEscalationStateForSession(params: {
  recordsAsc: CheckpointRecord[];
  email: string;
  sessionKey: string;
  currentCheckpointId: string;
}): DerivedEscalationState | null {
  const { recordsAsc, email, sessionKey, currentCheckpointId } = params;
  const idx = recordsAsc.findIndex((r) => r.checkpointId === currentCheckpointId);
  if (idx < 0) return null;

  let first: string | null = null;
  for (let i = 0; i <= idx; i += 1) {
    if (isPresent(recordsAsc[i], email, sessionKey)) {
      first = recordsAsc[i].checkpointDate;
      break;
    }
  }
  if (!first) return null;

  // consecutive streak ending at current checkpoint
  let count = 0;
  for (let i = idx; i >= 0; i -= 1) {
    if (!isPresent(recordsAsc[i], email, sessionKey)) break;
    count += 1;
  }

  return {
    firstCheckpointSeen: first,
    consecutiveCheckpointCount: count,
    escalationLevel: escalationLevelFromCount(count),
  };
}
