import { NextResponse } from "next/server";
import { fetchLatestSnapshot } from "@/lib/snapshots";
import { fetchWeekMetrics, saveWeekMetrics, type WeekMetrics } from "@/lib/metrics";

export const runtime = "nodejs";

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

    const metrics = await fetchWeekMetrics(weekId);
    if (!metrics) {
      return NextResponse.json(
        { success: false, error: "Metrics not found" },
        { status: 404 }
      );
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

