import { NextResponse } from 'next/server';
import { fetchHistoryIndex } from '@/lib/history';
import { buildLeaderboardFromSnapshots, fetchSnapshot } from '@/lib/snapshots';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const history = await fetchHistoryIndex();

    if (!history.weeks.length) {
      return NextResponse.json(
        { success: false, error: 'No snapshots available' },
        { status: 404 }
      );
    }

    const snapshots = (
      await Promise.all(history.weeks.map((entry) => fetchSnapshot(entry.snapshotPath)))
    ).filter(Boolean);

    const leaderboard = buildLeaderboardFromSnapshots(snapshots);

    return NextResponse.json({
      success: true,
      leaderboard,
      weeks: history.weeks,
      snapshotCount: snapshots.length,
    });
  } catch (error) {
    console.error('[leaderboard]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to build leaderboard' },
      { status: 500 }
    );
  }
}
