import { NextResponse } from "next/server";
import { fetchCheckpointIndex, fetchCheckpointRecord } from "@/lib/checkpointHistory";
import { fetchMasterUsers } from "@/lib/lists";

export const runtime = "nodejs";

type UserAggregate = {
  email: string;
  name: string;
  checkpointsOnList: number;
  firstSeenCheckpointDate: string | null;
  firstSeenCheckpointId: string | null;
  lastSeenCheckpointDate: string | null;
  lastSeenCheckpointId: string | null;
};

function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

export async function GET() {
  try {
    const [index, masterUsers] = await Promise.all([
      fetchCheckpointIndex(),
      fetchMasterUsers(),
    ]);

    const checkpoints = (index.checkpoints ?? [])
      .slice()
      .sort((a, b) => b.checkpointOrdinal - a.checkpointOrdinal);
    const nameByEmail = new Map(
      masterUsers.map((user) => [normalizeEmail(user.email), user.name.trim()])
    );
    const userMap = new Map<string, UserAggregate>();
    const repeatTracker = new Set<string>();
    const seenEver = new Set<string>();
    const timeline: Array<{
      checkpointId: string;
      checkpointDate: string;
      checkpointOrdinal: number;
      latestWeekId: string;
      userCount: number;
      repeatUserCount: number;
      newUserCount: number;
    }> = [];

    for (const checkpoint of checkpoints.slice().reverse()) {
      const record = await fetchCheckpointRecord(checkpoint.checkpointId);
      if (!record) continue;

      const currentEmails = Array.from(
        new Set((record.highRiskEmails ?? []).map(normalizeEmail).filter(Boolean))
      );

      let repeatUserCount = 0;
      let newUserCount = 0;
      currentEmails.forEach((email) => {
        if (repeatTracker.has(email)) {
          repeatUserCount += 1;
        }
        if (!seenEver.has(email)) {
          newUserCount += 1;
          seenEver.add(email);
        }
        repeatTracker.add(email);

        const existing = userMap.get(email);
        if (!existing) {
          userMap.set(email, {
            email,
            name: nameByEmail.get(email) ?? email,
            checkpointsOnList: 1,
            firstSeenCheckpointDate: record.checkpointDate,
            firstSeenCheckpointId: record.checkpointId,
            lastSeenCheckpointDate: record.checkpointDate,
            lastSeenCheckpointId: record.checkpointId,
          });
          return;
        }
        existing.checkpointsOnList += 1;
        existing.lastSeenCheckpointDate = record.checkpointDate;
        existing.lastSeenCheckpointId = record.checkpointId;
      });

      timeline.push({
        checkpointId: checkpoint.checkpointId,
        checkpointDate: checkpoint.checkpointDate,
        checkpointOrdinal: checkpoint.checkpointOrdinal,
        latestWeekId: checkpoint.latestWeekId,
        userCount: currentEmails.length,
        repeatUserCount,
        newUserCount,
      });
    }

    const users = Array.from(userMap.values())
      .map((user) => ({
        ...user,
        displayName: user.name || user.email,
      }))
      .sort(
        (a, b) =>
          b.checkpointsOnList - a.checkpointsOnList ||
          a.displayName.localeCompare(b.displayName)
      );

    const summary = {
      recurringUsers: users.filter((user) => user.checkpointsOnList >= 2).length,
      persistentUsers: users.filter((user) => user.checkpointsOnList >= 3).length,
      highestPersistence: users[0]?.checkpointsOnList ?? 0,
      latestCheckpoint: timeline[timeline.length - 1] ?? null,
    };

    return NextResponse.json({
      success: true,
      totalCheckpoints: checkpoints.length,
      checkpoints: checkpoints.map((checkpoint) => ({
        checkpointId: checkpoint.checkpointId,
        checkpointDate: checkpoint.checkpointDate,
        checkpointOrdinal: checkpoint.checkpointOrdinal,
        latestWeekId: checkpoint.latestWeekId,
        latestUploadedAt: checkpoint.latestUploadedAt,
      })),
      timeline,
      summary,
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
