import { NextResponse } from "next/server";
import {
  fetchCheckpointIndex,
  fetchCheckpointRecord,
  upsertCheckpointFromSnapshot,
} from "@/lib/checkpointHistory";
import { fetchHistoryIndex } from "@/lib/history";
import { fetchLatestSnapshot, fetchSnapshotByWeek } from "@/lib/snapshots";
import { getCheckpointInfo } from "@/lib/checkpoints";
import { buildSessionKey, deriveEscalationStateForSession, escalationLevelFromCount } from "@/lib/escalation";
import type { CheckpointRecord } from "@/lib/checkpointHistory";
import { getScopeLabel, isSentDateInScope } from "@/lib/scope";
import { fetchMasterUsers } from "@/lib/lists";

export const runtime = "nodejs";

function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function addDaysIsoDateOnly(iso: string, days: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso ?? "").trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  const d = new Date(Date.UTC(year, month, day));
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

export async function GET() {
  try {
    let index = await fetchCheckpointIndex();

    // Lazy backfill: if checkpoints haven't been recorded yet but history exists,
    // generate checkpoint records from historical snapshots.
    if ((index.checkpoints ?? []).length === 0) {
      const history = await fetchHistoryIndex();
      const weeks = Array.isArray(history?.weeks) ? history.weeks : [];
      for (const w of weeks) {
        const weekId = typeof w?.weekId === "string" ? w.weekId : "";
        if (!weekId) continue;
        const snapshot = await fetchSnapshotByWeek(weekId);
        if (!snapshot) continue;
        await upsertCheckpointFromSnapshot(snapshot);
      }
      index = await fetchCheckpointIndex();
    }

    const checkpoints = (index.checkpoints ?? [])
      .slice()
      .sort((a, b) => a.checkpointOrdinal - b.checkpointOrdinal);

    const latest = await fetchLatestSnapshot();
    if (!latest) {
      return NextResponse.json(
        { currentCheckpoint: "", scope: getScopeLabel(), users: [], levelCounts: {} },
        { status: 200 }
      );
    }

    const uploadedAt = latest.uploadedAt ? new Date(latest.uploadedAt) : new Date();
    const current = getCheckpointInfo(uploadedAt);
    if (!current) {
      return NextResponse.json({
        currentCheckpoint: "",
        scope: getScopeLabel(),
        users: [],
        levelCounts: {
          DEFCON_1: 0,
          DEFCON_2: 0,
          DEFCON_3: 0,
          DEFCON_4: 0,
          DEFCON_5: 0,
          DEFCON_6: 0,
        },
      });
    }

    // Ensure the current checkpoint record exists so consecutive derivation works.
    await upsertCheckpointFromSnapshot(latest);

    // Reload index now that we may have inserted the current checkpoint.
    index = await fetchCheckpointIndex();
    const checkpoints2 = (index.checkpoints ?? [])
      .slice()
      .sort((a, b) => a.checkpointOrdinal - b.checkpointOrdinal);

    const recordsAsc: CheckpointRecord[] = [];
    for (const c of checkpoints2) {
      const r = await fetchCheckpointRecord(c.checkpointId);
      if (r) recordsAsc.push(r);
    }

    const rows = Array.isArray(latest.parsedRows) ? latest.parsedRows : [];
    const eligibleRows = rows.filter((r: any) => isSentDateInScope(r?.sentDate));

    const levelCounts: Record<string, number> = {
      DEFCON_1: 0,
      DEFCON_2: 0,
      DEFCON_3: 0,
      DEFCON_4: 0,
      DEFCON_5: 0,
      DEFCON_6: 0,
    };

    const users = eligibleRows.map((r: any) => {
      const name = typeof r?.fullName === "string" ? r.fullName.trim() : "";
      const email = normalizeEmail(r?.email);
      const sessionTitle = typeof r?.title === "string" ? r.title.trim() : "";
      const sentDate = typeof r?.sentDate === "string" ? r.sentDate.trim() : "";
      const sessionId = buildSessionKey(sentDate, sessionTitle);

      const derived =
        email && sessionId
          ? deriveEscalationStateForSession({
              recordsAsc,
              email,
              sessionKey: sessionId,
              currentCheckpointId: current.checkpointId,
            })
          : null;

      const consecutiveCheckpointCount = derived?.consecutiveCheckpointCount ?? 0;
      const escalationLevel =
        derived?.escalationLevel ?? escalationLevelFromCount(consecutiveCheckpointCount);
      const nextEscalationCheckpoint =
        consecutiveCheckpointCount > 0 && consecutiveCheckpointCount < 5
          ? addDaysIsoDateOnly(current.checkpointDate, 7) ?? ""
          : "";
      const actionDueNow = Boolean(consecutiveCheckpointCount > 0 && consecutiveCheckpointCount <= 5);

      levelCounts[escalationLevel] = (levelCounts[escalationLevel] ?? 0) + 1;

      return {
        name,
        email,
        sessionTitle,
        sentDate,
        escalationLevel,
        consecutiveCheckpointCount,
        firstCheckpointSeen: derived?.firstCheckpointSeen ?? "",
        nextEscalationCheckpoint,
        actionDueNow,
      };
    });

    // DEFCON 6 (Clear) is the goal state: users not present in the escalation queue.
    // We approximate the population as the master list when available.
    const masterUsers = await fetchMasterUsers().catch(() => []);
    const totalPeople = Array.isArray(masterUsers) ? masterUsers.length : 0;
    const queuedEmails = new Set(users.map((u) => normalizeEmail(u.email)).filter(Boolean));
    const defcon6Count = totalPeople > 0 ? Math.max(0, totalPeople - queuedEmails.size) : 0;
    levelCounts.DEFCON_6 = defcon6Count;

    return NextResponse.json({
      currentCheckpoint: current.checkpointDate,
      scope: getScopeLabel(),
      users,
      levelCounts,
    });
  } catch (error) {
    console.error("[checkpoints]", error);
    return NextResponse.json(
      { error: "Failed to load checkpoint stats" },
      { status: 500 }
    );
  }
}
