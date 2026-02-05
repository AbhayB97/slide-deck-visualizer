import { NextResponse } from "next/server";
import { fetchLatestSnapshot, fetchSnapshotByWeek } from "@/lib/snapshots";
import { fetchWeekMetrics, findPrevWeekId, saveWeekMetrics, type WeekMetrics } from "@/lib/metrics";
import { isSentDateInScope } from "@/lib/scope";

export const runtime = "nodejs";

function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function normalizeNameKey(name: unknown): string {
  if (typeof name !== "string") return "";
  return name
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.,]/g, "")
    .toLowerCase();
}

function buildCountsByEmail(snapshot: any): Record<string, { email: string; name: string; count: number }> {
  const rows: unknown[] = Array.isArray(snapshot?.parsedRows) ? snapshot.parsedRows : [];
  return rows.reduce(
    (acc: Record<string, { email: string; name: string; count: number }>, row: any) => {
      if (!isSentDateInScope(row?.sentDate)) return acc;
      const email = normalizeEmail(row?.email);
      if (!email) return acc;
      const name = typeof row?.fullName === "string" ? row.fullName.trim() : "";
      acc[email] = acc[email] ?? { email, name, count: 0 };
      acc[email].count += 1;
    if (!acc[email].name && name) acc[email].name = name;
    return acc;
    },
    {}
  );
}

function buildCountsByNameKey(snapshot: any): Record<string, { key: string; name: string; count: number }> {
  const rows: unknown[] = Array.isArray(snapshot?.parsedRows) ? snapshot.parsedRows : [];
  return rows.reduce(
    (acc: Record<string, { key: string; name: string; count: number }>, row: any) => {
      if (!isSentDateInScope(row?.sentDate)) return acc;
      const name = typeof row?.fullName === "string" ? row.fullName.trim() : "";
      const key = normalizeNameKey(name);
      if (!key) return acc;
      acc[key] = acc[key] ?? { key, name, count: 0 };
      acc[key].count += 1;
    return acc;
    },
    {}
  );
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const weekId = searchParams.get("week");

    if (!weekId) {
      const latest = await fetchLatestSnapshot();
      if (!latest?.weekId) {
        return NextResponse.json(
          { success: false, error: "No snapshots available" },
          { status: 404 }
        );
      }
      const metrics = await fetchWeekMetrics(latest.weekId);
      if (!metrics) {
        return NextResponse.json(
          { success: false, error: "Metrics not found for latest week" },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true, metrics });
    }

    let metrics = await fetchWeekMetrics(weekId);
    if (!metrics) {
      // Generate metrics on-demand if missing (handles weeks processed before metrics existed).
      const current = await fetchSnapshotByWeek(weekId);
      if (!current) {
        return NextResponse.json(
          { success: false, error: "Snapshot not found" },
          { status: 404 }
        );
      }

      const prevWeekId = await findPrevWeekId(weekId);
      const prev = prevWeekId ? await fetchSnapshotByWeek(prevWeekId) : null;

      const currentEmailCounts = buildCountsByEmail(current);
      const hasEmails = Object.keys(currentEmailCounts).length > 0;

      if (hasEmails) {
        const prevEmailCounts = prev ? buildCountsByEmail(prev) : {};
        metrics = await saveWeekMetrics({
          weekId,
          prevWeekId,
          generatedAt: new Date().toISOString(),
          users: Object.values(currentEmailCounts)
            .map((u) => ({
              weekId,
              prevWeekId,
              email: u.email,
              name: u.name,
              incompleteCount: u.count,
              deltaFromPrevWeek: u.count - (prevEmailCounts[u.email]?.count ?? 0),
            }))
            .sort(
              (a, b) => b.incompleteCount - a.incompleteCount || a.name.localeCompare(b.name)
            ),
        } satisfies WeekMetrics);
      } else {
        const currentNameCounts = buildCountsByNameKey(current);
        const prevNameCounts = prev ? buildCountsByNameKey(prev) : {};
        metrics = await saveWeekMetrics({
          weekId,
          prevWeekId,
          generatedAt: new Date().toISOString(),
          users: Object.values(currentNameCounts)
            .map((u) => ({
              weekId,
              prevWeekId,
              email: "",
              name: u.name,
              incompleteCount: u.count,
              deltaFromPrevWeek: u.count - (prevNameCounts[u.key]?.count ?? 0),
            }))
            .sort(
              (a, b) => b.incompleteCount - a.incompleteCount || a.name.localeCompare(b.name)
            ),
        } satisfies WeekMetrics);
      }
    }

    return NextResponse.json({ success: true, metrics });
  } catch (error) {
    console.error("[metrics]", error);
    return NextResponse.json(
      { success: false, error: "Failed to load metrics" },
      { status: 500 }
    );
  }
}
