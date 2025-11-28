import { NextResponse } from 'next/server';
import { buildHeatmapCounts, fetchSnapshot } from '@/lib/snapshots';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const snapshotId = searchParams.get('snapshotId');

    if (!snapshotId) {
      return NextResponse.json(
        { success: false, error: 'snapshotId is required' },
        { status: 400 }
      );
    }

    const snapshot = await fetchSnapshot(snapshotId);
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
