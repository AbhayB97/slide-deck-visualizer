import { NextResponse } from 'next/server';
import { buildHeatmapCounts, fetchSnapshot, fetchSnapshotByWeek } from '@/lib/snapshots';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const weekId = searchParams.get('week');
    const snapshotId = searchParams.get('snapshotId');

    if (!weekId && !snapshotId) {
      return NextResponse.json(
        { success: false, error: 'week or snapshotId is required' },
        { status: 400 }
      );
    }

    const snapshot = weekId
      ? await fetchSnapshotByWeek(weekId)
      : await fetchSnapshot(snapshotId as string);

    if (!snapshot) {
      return NextResponse.json(
        { success: false, error: 'Snapshot not found' },
        { status: 404 }
      );
    }

    const heatmap = buildHeatmapCounts(snapshot.parsedRows);

    return NextResponse.json({
      success: true,
      snapshot: {
        ...snapshot,
        heatmap,
      },
    });
  } catch (error) {
    console.error('[snapshot]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load snapshot' },
      { status: 500 }
    );
  }
}
