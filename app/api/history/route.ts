import { NextResponse } from 'next/server';
import { fetchSnapshot, listSnapshotBlobs } from '@/lib/snapshots';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const blobs = await listSnapshotBlobs();
    if (!blobs.length) {
      return NextResponse.json({ success: true, history: [] });
    }

    const snapshots = await Promise.all(
      blobs
        .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime())
        .map(async (blob) => {
          try {
            const snapshot = await fetchSnapshot(blob.pathname);
            return snapshot
              ? {
                  snapshotId: snapshot.snapshotId,
                  uploadedAt: snapshot.uploadedAt,
                  offenderCount: snapshot.offenderCount,
                }
              : null;
          } catch {
            return null;
          }
        })
    );

    const history = snapshots.filter(Boolean);

    return NextResponse.json({ success: true, history });
  } catch (error) {
    console.error('[history]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load history' },
      { status: 500 }
    );
  }
}
