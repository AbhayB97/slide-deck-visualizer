import { NextResponse } from 'next/server';
import { buildHeatmapCounts, fetchSnapshot, listHistoryEntries } from '@/lib/snapshots';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const entries = await listHistoryEntries();
    if (!entries.length) {
      return NextResponse.json({ success: true, leaderboard: [], weeks: [] });
    }

    const combined: Record<string, number> = {};
    for (const entry of entries) {
      try {
        const snapshot = await fetchSnapshot(entry.path);
        if (!snapshot) continue;
        const counts = buildHeatmapCounts(snapshot.parsedRows ?? []);
        for (const [name, count] of Object.entries(counts)) {
          if (!name) continue;
          combined[name] = (combined[name] ?? 0) + count;
        }
      } catch (err) {
        console.warn('[leaderboard] Skipping snapshot', entry.path, err);
      }
    }

    const leaderboard = Object.entries(combined)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    const weeks = entries.map((item) => item.weekId);

    return NextResponse.json({ success: true, leaderboard, weeks });
  } catch (error) {
    console.error('[leaderboard]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to build leaderboard' },
      { status: 500 }
    );
  }
}
