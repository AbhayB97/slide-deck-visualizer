import { NextResponse } from 'next/server';
import { fetchSnapshot, listHistoryEntries } from '@/lib/snapshots';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const entries = await listHistoryEntries();
    const weeks = entries.map((item) => item.weekId);

    const history = await Promise.all(
      entries.map(async (entry) => {
        try {
          const snapshot = await fetchSnapshot(entry.path);
          return {
            weekId: entry.weekId,
            snapshotId: entry.path,
            uploadedAt: snapshot?.uploadedAt ?? null,
            offenderCount: snapshot?.offenderCount ?? null,
          };
        } catch {
          return { weekId: entry.weekId, snapshotId: entry.path };
        }
      })
    );

    return NextResponse.json({ success: true, weeks, history });
  } catch (error) {
    console.error('[history]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load history' },
      { status: 500 }
    );
  }
}
