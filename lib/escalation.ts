import type { CheckpointRecord } from "@/lib/checkpointHistory";

export type EscalationLevel =
  | "CP0_GRACE"
  | "CP1_AWARENESS"
  | "CP2_SUPPORT"
  | "CP3_HR"
  | "CP4_ENFORCEMENT";

export type DerivedEscalationState = {
  firstCheckpointSeen: string; // YYYY-MM-DD (Thursday)
  consecutiveCheckpointCount: number;
  escalationLevel: EscalationLevel;
};

export function escalationLevelFromCount(count: number): EscalationLevel {
  if (count <= 1) return "CP0_GRACE";
  if (count === 2) return "CP1_AWARENESS";
  if (count === 3) return "CP2_SUPPORT";
  if (count === 4) return "CP3_HR";
  return "CP4_ENFORCEMENT";
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

