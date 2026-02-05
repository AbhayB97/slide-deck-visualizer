import { NextResponse } from "next/server";
import { fetchCheckpointIndex, fetchCheckpointRecord } from "@/lib/checkpointHistory";
import { computeCheckpointHistory } from "@/lib/checkpointRecords";

export const runtime = "nodejs";

export async function GET() {
  try {
    const index = await fetchCheckpointIndex();
    const checkpointsAsc = (index.checkpoints ?? [])
      .slice()
      .sort((a, b) => a.checkpointOrdinal - b.checkpointOrdinal);

    const recordsAsc = [];
    for (const c of checkpointsAsc) {
      const r = await fetchCheckpointRecord(c.checkpointId);
      if (r) recordsAsc.push(r);
    }

    const history = computeCheckpointHistory(recordsAsc);

    return NextResponse.json({
      success: true,
      totalCheckpoints: checkpointsAsc.length,
      recordCount: history.length,
      records: history,
    });
  } catch (error) {
    console.error("[checkpoint-records]", error);
    return NextResponse.json(
      { success: false, error: "Failed to load checkpoint records" },
      { status: 500 }
    );
  }
}

