import { NextResponse } from 'next/server';
import { buildHeatmapCounts, listSnapshotBlobs } from '@/lib/snapshots';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const blobs = await listSnapshotBlobs();

    if (!blobs.length) {
      return NextResponse.json(
        { success: false, error: 'No snapshots found' },
        { status: 404 }
      );
    }

    const latest = blobs.sort(
      (a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime()
    )[0];

    const response = await fetch(latest.downloadUrl);
    if (!response.ok) {
      throw new Error(`Failed to download snapshot: ${response.statusText}`);
    }
    const data = await response.json();

    const parsedRows = data.parsedRows ?? [];
    const offenderList = data.offenderList ?? [];
    const offenderCount = data.offenderCount ?? offenderList.length ?? 0;
    const heatmap = buildHeatmapCounts(parsedRows);

    return NextResponse.json({
      success: true,
      snapshotId: latest.pathname,
      uploadedAt: latest.uploadedAt.toISOString(),
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
