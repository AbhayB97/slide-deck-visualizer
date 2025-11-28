import { head, list } from '@vercel/blob';

type SnapshotBlob = {
  url: string;
  pathname: string;
  uploadedAt: Date;
  downloadUrl: string;
};

type SnapshotFile = {
  snapshotId: string;
  uploadedAt: string;
  offenderCount: number;
  offenderList: string[];
  parsedRows: any[];
};

const SNAPSHOT_PREFIX = 'snapshots/';

function isSnapshotFile(pathname: string) {
  return pathname.startsWith(SNAPSHOT_PREFIX) && pathname.toLowerCase().endsWith('.json');
}

export async function listSnapshotBlobs(): Promise<SnapshotBlob[]> {
  const { blobs } = await list({ prefix: SNAPSHOT_PREFIX, limit: 1000 });
  return blobs
    .filter(({ pathname }) => isSnapshotFile(pathname))
    .map((blob) => ({
      url: blob.url,
      pathname: blob.pathname,
      uploadedAt: blob.uploadedAt,
      downloadUrl: blob.downloadUrl,
    }));
}

export async function fetchSnapshot(snapshotId: string): Promise<SnapshotFile | null> {
  const metadata = await head(snapshotId);
  if (!isSnapshotFile(metadata.pathname)) return null;

  const response = await fetch(metadata.downloadUrl);
  if (!response.ok) {
    throw new Error(`Failed to download snapshot: ${response.statusText}`);
  }

  const data = await response.json();
  return {
    snapshotId: metadata.pathname,
    uploadedAt: metadata.uploadedAt.toISOString(),
    offenderCount: data.offenderCount ?? 0,
    offenderList: data.offenderList ?? [],
    parsedRows: data.parsedRows ?? [],
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
