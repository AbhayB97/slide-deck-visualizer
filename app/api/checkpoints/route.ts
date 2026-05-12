import { NextResponse } from "next/server";
import { getCheckpointInfo } from "@/lib/checkpoints";
import { fetchHistoryIndex } from "@/lib/history";
import { fetchMasterUsers } from "@/lib/lists";
import { fetchSnapshotByWeek } from "@/lib/snapshots";

export const runtime = "nodejs";

type UserAggregate = {
  key: string;
  email: string;
  name: string;
  checkpointsOnList: number;
  firstSeenCheckpointDate: string | null;
  firstSeenCheckpointId: string | null;
  lastSeenCheckpointDate: string | null;
  lastSeenCheckpointId: string | null;
};

type CheckpointAggregate = {
  checkpointId: string;
  checkpointDate: string;
  checkpointOrdinal: number;
  latestWeekId: string;
  latestUploadedAt: string;
  users: Map<string, { key: string; email: string; name: string }>;
};

function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function normalizeName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ");
}

function normalizeNameKey(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").replace(/[.,]/g, "").toLowerCase();
}

function toDate(value: unknown): Date | null {
  const parsed =
    value instanceof Date
      ? value
      : typeof value === "string" || typeof value === "number"
        ? new Date(value)
        : null;
  return parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? parsed : null;
}

function buildCheckpointUserSet(
  snapshot: Awaited<ReturnType<typeof fetchSnapshotByWeek>>,
  nameByEmail: Map<string, string>
): Map<string, { key: string; email: string; name: string }> {
  const users = new Map<string, { key: string; email: string; name: string }>();

  const parsedRows = Array.isArray(snapshot?.parsedRows) ? snapshot.parsedRows : [];
  parsedRows.forEach((row) => {
    const email = normalizeEmail(row?.email);
    const rowName = normalizeName(row?.fullName);
    if (email) {
      users.set(`email:${email}`, {
        key: `email:${email}`,
        email,
        name: rowName || nameByEmail.get(email) || email,
      });
      return;
    }
    const nameKey = normalizeNameKey(rowName);
    if (!nameKey) return;
    users.set(`name:${nameKey}`, {
      key: `name:${nameKey}`,
      email: "",
      name: rowName,
    });
  });

  if (users.size > 0) return users;

  const highRiskEmails = Array.isArray(snapshot?.highRiskEmails) ? snapshot.highRiskEmails : [];
  highRiskEmails.forEach((value) => {
    const email = normalizeEmail(value);
    if (!email) return;
    users.set(`email:${email}`, {
      key: `email:${email}`,
      email,
      name: nameByEmail.get(email) || email,
    });
  });

  if (users.size > 0) return users;

  const offenderList = Array.isArray(snapshot?.offenderList) ? snapshot.offenderList : [];
  offenderList.forEach((value) => {
    const name = normalizeName(value);
    const nameKey = normalizeNameKey(name);
    if (!nameKey) return;
    users.set(`name:${nameKey}`, {
      key: `name:${nameKey}`,
      email: "",
      name,
    });
  });

  return users;
}

export async function GET() {
  try {
    const [history, masterUsers] = await Promise.all([
      fetchHistoryIndex(),
      fetchMasterUsers(),
    ]);

    const nameByEmail = new Map(
      masterUsers.map((user) => [normalizeEmail(user.email), normalizeName(user.name)])
    );

    const weeks = (history.weeks ?? [])
      .map((week) => week.weekId)
      .filter((weekId): weekId is string => typeof weekId === "string" && Boolean(weekId));

    const snapshots = (
      await Promise.all(weeks.map((weekId) => fetchSnapshotByWeek(weekId)))
    ).filter(Boolean);

    const checkpointMap = new Map<string, CheckpointAggregate>();

    for (const snapshot of snapshots) {
      if (!snapshot) continue;
      const uploadedAt = toDate(snapshot.uploadedAt);
      const checkpointInfo =
        snapshot.checkpointId && snapshot.checkpointDate && Number.isFinite(snapshot.checkpointOrdinal)
          ? {
              checkpointId: snapshot.checkpointId,
              checkpointDate: snapshot.checkpointDate,
              checkpointOrdinal: Number(snapshot.checkpointOrdinal),
            }
          : uploadedAt
            ? getCheckpointInfo(uploadedAt)
            : null;

      if (!checkpointInfo) continue;

      const users = buildCheckpointUserSet(snapshot, nameByEmail);
      const existing = checkpointMap.get(checkpointInfo.checkpointId);

      if (!existing) {
        checkpointMap.set(checkpointInfo.checkpointId, {
          checkpointId: checkpointInfo.checkpointId,
          checkpointDate: checkpointInfo.checkpointDate,
          checkpointOrdinal: checkpointInfo.checkpointOrdinal,
          latestWeekId: snapshot.weekId ?? "",
          latestUploadedAt: snapshot.uploadedAt ?? "",
          users,
        });
        continue;
      }

      const existingTime = toDate(existing.latestUploadedAt)?.getTime() ?? 0;
      const nextTime = uploadedAt?.getTime() ?? 0;
      if (nextTime >= existingTime) {
        checkpointMap.set(checkpointInfo.checkpointId, {
          checkpointId: checkpointInfo.checkpointId,
          checkpointDate: checkpointInfo.checkpointDate,
          checkpointOrdinal: checkpointInfo.checkpointOrdinal,
          latestWeekId: snapshot.weekId ?? existing.latestWeekId,
          latestUploadedAt: snapshot.uploadedAt ?? existing.latestUploadedAt,
          users,
        });
      }
    }

    const checkpoints = Array.from(checkpointMap.values()).sort(
      (a, b) => a.checkpointOrdinal - b.checkpointOrdinal
    );

    const userMap = new Map<string, UserAggregate>();
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

    for (const checkpoint of checkpoints) {
      const currentUsers = Array.from(checkpoint.users.values());
      let repeatUserCount = 0;
      let newUserCount = 0;

      currentUsers.forEach((user) => {
        if (seenEver.has(user.key)) {
          repeatUserCount += 1;
        } else {
          newUserCount += 1;
          seenEver.add(user.key);
        }

        const existing = userMap.get(user.key);
        if (!existing) {
          userMap.set(user.key, {
            key: user.key,
            email: user.email,
            name: user.name || user.email,
            checkpointsOnList: 1,
            firstSeenCheckpointDate: checkpoint.checkpointDate,
            firstSeenCheckpointId: checkpoint.checkpointId,
            lastSeenCheckpointDate: checkpoint.checkpointDate,
            lastSeenCheckpointId: checkpoint.checkpointId,
          });
          return;
        }

        existing.checkpointsOnList += 1;
        existing.lastSeenCheckpointDate = checkpoint.checkpointDate;
        existing.lastSeenCheckpointId = checkpoint.checkpointId;
      });

      timeline.push({
        checkpointId: checkpoint.checkpointId,
        checkpointDate: checkpoint.checkpointDate,
        checkpointOrdinal: checkpoint.checkpointOrdinal,
        latestWeekId: checkpoint.latestWeekId,
        userCount: currentUsers.length,
        repeatUserCount,
        newUserCount,
      });
    }

    const users = Array.from(userMap.values())
      .map((user) => ({
        email: user.email,
        name: user.name || user.email,
        displayName: user.name || user.email,
        checkpointsOnList: user.checkpointsOnList,
        firstSeenCheckpointDate: user.firstSeenCheckpointDate,
        firstSeenCheckpointId: user.firstSeenCheckpointId,
        lastSeenCheckpointDate: user.lastSeenCheckpointDate,
        lastSeenCheckpointId: user.lastSeenCheckpointId,
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
      checkpoints: checkpoints
        .slice()
        .reverse()
        .map((checkpoint) => ({
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
