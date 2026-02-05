import { NextResponse } from "next/server";
import { fetchCheckpointIndex, fetchCheckpointRecord } from "@/lib/checkpointHistory";
import { fetchLatestSnapshot, fetchSnapshotByWeek } from "@/lib/snapshots";
import { getCheckpointInfo } from "@/lib/checkpoints";
import { buildSessionKey, deriveEscalationStateForSession } from "@/lib/escalation";

export const runtime = "nodejs";

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

function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function isEligibleForEscalation(sentDate: unknown): boolean {
  if (typeof sentDate !== "string") return false;
  const d = new Date(sentDate);
  if (Number.isNaN(d.getTime())) return false;
  return d.getFullYear() === 2026;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const weekId = searchParams.get("week");

    const snapshot = weekId ? await fetchSnapshotByWeek(weekId) : await fetchLatestSnapshot();
    if (!snapshot) {
      return NextResponse.json({ success: false, error: "Snapshot not found" }, { status: 404 });
    }

    const uploadedAt = snapshot.uploadedAt ? new Date(snapshot.uploadedAt) : new Date();
    const checkpoint = getCheckpointInfo(uploadedAt);
    if (!checkpoint) {
      return NextResponse.json({
        success: true,
        checkpoint: null,
        escalations: [],
        note: "Checkpoint logic disabled before cutover.",
      });
    }

    const index = await fetchCheckpointIndex();
    const checkpointsAsc = (index.checkpoints ?? [])
      .slice()
      .sort((a, b) => a.checkpointOrdinal - b.checkpointOrdinal);

    const recordsAsc = [];
    for (const c of checkpointsAsc) {
      const r = await fetchCheckpointRecord(c.checkpointId);
      if (r) recordsAsc.push(r);
    }

    const rows = Array.isArray(snapshot.parsedRows) ? snapshot.parsedRows : [];
    const eligibleRows = rows.filter((r: any) => isEligibleForEscalation(r?.sentDate));

    const escalations = eligibleRows.map((r: any) => {
      const email = normalizeEmail(r?.email);
      const title = typeof r?.title === "string" ? r.title.trim() : "";
      const sentDate = typeof r?.sentDate === "string" ? r.sentDate.trim() : "";
      const sessionKey = buildSessionKey(sentDate, title);
      const derived = email && sessionKey
        ? deriveEscalationStateForSession({
            recordsAsc,
            email,
            sessionKey,
            currentCheckpointId: checkpoint.checkpointId,
          })
        : null;
      const consecutive = derived?.consecutiveCheckpointCount ?? 0;
      const nextEscalationCheckpoint =
        derived && consecutive > 0 && consecutive < 5
          ? addDaysIsoDateOnly(checkpoint.checkpointDate, 7)
          : null;
      const actionDueNow = Boolean(derived && consecutive > 0 && consecutive <= 5);
      return {
        name: typeof r?.fullName === "string" ? r.fullName.trim() : "",
        email,
        sessionTitle: title,
        sentDate,
        firstCheckpointSeen: derived?.firstCheckpointSeen ?? "",
        consecutiveCheckpointCount: derived?.consecutiveCheckpointCount ?? 0,
        escalationLevel: derived?.escalationLevel ?? "",
        nextEscalationCheckpoint: nextEscalationCheckpoint ?? "",
        actionDueNow,
        sessionId: sessionKey,
      };
    });

    return NextResponse.json({
      success: true,
      checkpoint,
      weekId: snapshot.weekId ?? null,
      escalations,
    });
  } catch (error) {
    console.error("[escalations]", error);
    return NextResponse.json({ success: false, error: "Failed to derive escalations" }, { status: 500 });
  }
}
