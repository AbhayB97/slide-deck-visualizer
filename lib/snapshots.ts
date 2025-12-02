import { head } from '@vercel/blob';

export const SNAPSHOT_LATEST_PATH = 'snapshots/latest.json';

export type SnapshotFile = {
  snapshotId: string;
  uploadedAt: string;
  offenderCount: number;
  offenderList: string[];
  parsedRows: any[];
  incompleteSessions?: {
    notStarted: number;
    inProgress: number;
    total: number;
  };
};

function isSnapshotFile(pathname: string) {
  return pathname.startsWith('snapshots/') && pathname.toLowerCase().endsWith('.json');
}

function toDate(value: unknown) {
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

export async function fetchSnapshot(snapshotId: string = SNAPSHOT_LATEST_PATH): Promise<SnapshotFile | null> {
  const metadata = await head(snapshotId, { token: process.env.BLOB_READ_WRITE_TOKEN });
  if (!isSnapshotFile(metadata.pathname)) return null;
  const uploadedAt = toDate((metadata as any).uploadedAt) ?? new Date();

  const response = await fetch(metadata.downloadUrl);
  if (!response.ok) {
    throw new Error(`Failed to download snapshot: ${response.statusText}`);
  }

  const data = await response.json();

  return {
    snapshotId: metadata.pathname,
    uploadedAt: uploadedAt.toISOString(),
    offenderCount: data.offenderCount ?? 0,
    offenderList: data.offenderList ?? [],
    parsedRows: data.parsedRows ?? [],
    incompleteSessions: data.incompleteSessions,
  };
}

export function buildHeatmapCounts(rows: any[]) {
  return rows.reduce<Record<string, number>>((acc, row) => {
    const status = (row.status ?? row.type ?? '').toLowerCase();
    if (status === 'not started' || status === 'in progress') {
      const name = row.fullName ?? '';
      if (!name) return acc;
      acc[name] = (acc[name] ?? 0) + 1;
    }
    return acc;
  }, {});
}
