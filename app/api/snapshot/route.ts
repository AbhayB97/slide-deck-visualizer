import { NextResponse } from 'next/server';
import { fetchLatestSnapshot, fetchSnapshotByWeek } from '@/lib/snapshots';
import { getCheckpointInfo } from "@/lib/checkpoints";

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const weekId = searchParams.get('week');

    const snapshot = weekId ? await fetchSnapshotByWeek(weekId) : await fetchLatestSnapshot();

    if (!snapshot) {
      return NextResponse.json(
        { success: false, error: 'Snapshot not found' },
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

    return NextResponse.json({ success: true, snapshot: enriched });
  } catch (error) {
    console.error('[snapshot]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load snapshot' },
      { status: 500 }
    );
  }
}
