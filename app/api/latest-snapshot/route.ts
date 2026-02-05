import { NextResponse } from 'next/server';
import { fetchLatestSnapshot } from '@/lib/snapshots';
import { getCheckpointInfo } from "@/lib/checkpoints";

export const runtime = 'nodejs';

export async function GET() {
  try {
    const snapshot = await fetchLatestSnapshot();
    if (!snapshot) {
      return NextResponse.json(
        { success: false, error: 'No snapshot available' },
        { status: 404 }
      );
    }

    const info = snapshot.uploadedAt ? getCheckpointInfo(new Date(snapshot.uploadedAt)) : null;
    const enriched = info
      ? {
          ...snapshot,
          checkpointId: snapshot.checkpointId ?? info.checkpointId,
          checkpointDate: snapshot.checkpointDate ?? info.checkpointDate,
          checkpointOrdinal: snapshot.checkpointOrdinal ?? info.checkpointOrdinal,
        }
      : snapshot;

    return NextResponse.json({
      success: true,
      snapshot: enriched,
    });
  } catch (error) {
    console.error('[latest-snapshot]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load latest snapshot' },
      { status: 500 }
    );
  }
}
