import { head } from '@vercel/blob';
import { SNAPSHOT_PATH } from '@/lib/storage';
import type { ParsedRow, Snapshot } from '@/lib/processCsvSnapshot';

function toDate(value: unknown) {
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

export async function fetchSnapshot(snapshotId: string = SNAPSHOT_PATH): Promise<Snapshot | null> {
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

    return {
      ...data,
      snapshotId: metadata.pathname ?? snapshotId,
      uploadedAt: uploadedAt.toISOString(),
    };
  } catch (err: any) {
    if (err?.status === 404 || err?.code === 'blob_not_found' || err?.statusCode === 404) {
      return null;
    }
    console.error('[snapshots] Failed to fetch snapshot', err);
    throw err;
  }
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
