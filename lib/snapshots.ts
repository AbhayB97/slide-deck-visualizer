import { head } from '@vercel/blob';
import { SNAPSHOT_PATH } from '@/lib/storage';
import { buildSnapshotPath, fetchHistoryIndex, weekIdFromSnapshotPath } from '@/lib/history';
import type { ParsedRow, Snapshot } from '@/lib/processCsvSnapshot';

function toDate(value: unknown) {
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

async function downloadSnapshot(snapshotId: string): Promise<Snapshot | null> {
  try {
    const metadata = await head(snapshotId, { token: process.env.BLOB_READ_WRITE_TOKEN });
    const response = await fetch(metadata.downloadUrl);
    if (!response.ok) {
      throw new Error(`Failed to download snapshot: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as Snapshot;
    const uploadedAt =
      toDate(data.uploadedAt) ??
      toDate((metadata as any).uploadedAt) ??
      new Date();

    const weekId = data.weekId ?? weekIdFromSnapshotPath(metadata.pathname ?? snapshotId) ?? '';

    return {
      ...data,
      snapshotId: metadata.pathname ?? snapshotId,
      uploadedAt: uploadedAt.toISOString(),
      weekId,
    };
  } catch (err: any) {
    if (err?.status === 404 || err?.code === 'blob_not_found' || err?.statusCode === 404) {
      return null;
    }
    console.error('[snapshots] Failed to fetch snapshot', err);
    throw err;
  }
}

export async function fetchSnapshot(snapshotId: string = SNAPSHOT_PATH): Promise<Snapshot | null> {
  return downloadSnapshot(snapshotId);
}

export async function fetchSnapshotByWeek(weekId: string): Promise<Snapshot | null> {
  return downloadSnapshot(buildSnapshotPath(weekId));
}

export async function fetchLatestSnapshot(): Promise<Snapshot | null> {
  const history = await fetchHistoryIndex();
  const latestWeek = history.weeks[0];
  if (latestWeek) {
    const snap = await downloadSnapshot(latestWeek.snapshotPath);
    if (snap) return snap;
  }
  // Fallback to legacy latest snapshot if history is empty or missing.
  return downloadSnapshot(SNAPSHOT_PATH);
}

export function buildHeatmapCounts(rows: ParsedRow[]) {
  return rows.reduce<Record<string, number>>((acc, row) => {
    const status = (row.status ?? '').toLowerCase();
    if (status === 'not started' || status === 'in progress') {
      const name = row.fullName ?? '';
      if (!name) return acc;
      acc[name] = (acc[name] ?? 0) + 1;
    }
    return acc;
  }, {});
}

export function buildLeaderboardFromSnapshots(snapshots: Snapshot[]) {
  const counts = snapshots.reduce<Record<string, number>>((acc, snapshot) => {
    for (const row of snapshot.parsedRows ?? []) {
      const name = (row.fullName ?? '').trim();
      if (!name) continue;
      const status = (row.status ?? '').toLowerCase();
      if (status !== 'not started' && status !== 'in progress') continue;
      acc[name] = (acc[name] ?? 0) + 1;
    }
    return acc;
  }, {});

  return Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
