import { NextResponse } from "next/server";
import {
  fetchCheckpointIndex,
  fetchCheckpointRecord,
  upsertCheckpointFromSnapshot,
} from "@/lib/checkpointHistory";
import { fetchHistoryIndex } from "@/lib/history";
import { fetchSnapshotByWeek } from "@/lib/snapshots";

export const runtime = "nodejs";

type UserCheckpointStat = {
  email: string;
  checkpointsOnList: number;
  lastSeenCheckpointDate: string | null;
  lastSeenCheckpointId: string | null;
};

function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
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

    const userMap = new Map<string, { checkpoints: number; lastDate: string; lastId: string }>();

    for (const cp of checkpoints) {
      const record = await fetchCheckpointRecord(cp.checkpointId);
      if (!record) continue;

      const set = new Set(
        (record.highRiskEmails ?? []).map(normalizeEmail).filter(Boolean)
      );
      for (const email of set) {
        const prev = userMap.get(email);
        if (!prev) {
          userMap.set(email, {
            checkpoints: 1,
            lastDate: record.checkpointDate,
            lastId: record.checkpointId,
          });
          continue;
        }
        prev.checkpoints += 1;
        // Since we iterate in ascending ordinal order, last write wins.
        prev.lastDate = record.checkpointDate;
        prev.lastId = record.checkpointId;
      }
    }

    const users: UserCheckpointStat[] = Array.from(userMap.entries())
      .map(([email, v]) => ({
        email,
        checkpointsOnList: v.checkpoints,
        lastSeenCheckpointDate: v.lastDate ?? null,
        lastSeenCheckpointId: v.lastId ?? null,
      }))
      .sort((a, b) => b.checkpointsOnList - a.checkpointsOnList || a.email.localeCompare(b.email));

    return NextResponse.json({
      success: true,
      totalCheckpoints: checkpoints.length,
      checkpoints: checkpoints.map((c) => ({
        checkpointId: c.checkpointId,
        checkpointDate: c.checkpointDate,
        checkpointOrdinal: c.checkpointOrdinal,
        latestWeekId: c.latestWeekId,
        latestUploadedAt: c.latestUploadedAt,
      })),
      users,
    });
  } catch (error) {
    console.error("[checkpoints]", error);
    return NextResponse.json(
      { success: false, error: "Failed to load checkpoint stats" },
      { status: 500 }
    );
  }
}
