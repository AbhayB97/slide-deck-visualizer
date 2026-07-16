import { NextResponse } from "next/server";
import { fetchLatestSnapshot } from "@/lib/snapshots";
import { computeWeekStreaks, fetchWeekStreaks, saveWeekStreaks } from "@/lib/streaks";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    let weekId = searchParams.get("week");

    if (!weekId) {
      const latest = await fetchLatestSnapshot();
      if (!latest?.weekId) {
        return NextResponse.json(
          { success: false, error: "No snapshots available" },
          { status: 404 }
        );
      }
      weekId = latest.weekId;
    }

    let streaks = await fetchWeekStreaks(weekId);
    if (!streaks) {
      // Generate on-demand for weeks processed before streaks existed.
      streaks = await computeWeekStreaks(weekId);
      if (!streaks) {
        return NextResponse.json(
          { success: false, error: "Snapshot not found" },
          { status: 404 }
        );
      }
      await saveWeekStreaks(streaks);
    }

    return NextResponse.json({ success: true, streaks });
  } catch (error) {
    console.error("[streaks]", error);
    return NextResponse.json(
      { success: false, error: "Failed to load streaks" },
      { status: 500 }
    );
  }
}
