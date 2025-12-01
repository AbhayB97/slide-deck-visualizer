import { NextResponse } from 'next/server';
import { buildHeatmapCounts, fetchSnapshot, listHistoryEntries, listSnapshotBlobs } from '@/lib/snapshots';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const entries = await listHistoryEntries();
    let snapshotPath = entries[0]?.path;

    if (!snapshotPath) {
      const blobs = await listSnapshotBlobs();
      if (!blobs.length) {
        return NextResponse.json(
          { success: false, error: 'No snapshots found' },
          { status: 404 }
        );
      }
      snapshotPath = blobs.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime())[0].pathname;
    }

    const snapshot = snapshotPath ? await fetchSnapshot(snapshotPath) : null;
    if (!snapshot) {
      return NextResponse.json(
        { success: false, error: 'Snapshot not found' },
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
