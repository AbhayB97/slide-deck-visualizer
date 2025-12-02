import { NextResponse } from 'next/server';
import { buildHeatmapCounts, fetchSnapshot } from '@/lib/snapshots';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const snapshot = await fetchSnapshot();
    if (!snapshot) {
      return NextResponse.json(
        { success: false, error: 'No snapshot available' },
        { status: 404 }
      );
    }

    const parsedRows = snapshot.parsedRows ?? [];
    const offenderList = snapshot.offenderList ?? [];
    const offenderCount = snapshot.offenderCount ?? offenderList.length ?? 0;
    const heatmap = buildHeatmapCounts(parsedRows);

    return NextResponse.json({
      success: true,
      weekId: snapshot.weekId,
      snapshotId: snapshot.snapshotId,
      uploadedAt: snapshot.uploadedAt,
      parsedRows,
      offenderCount,
      offenderList,
      heatmap,
    });
  } catch (error) {
    console.error('[latest-snapshot]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load latest snapshot' },
      { status: 500 }
    );
  }
}
