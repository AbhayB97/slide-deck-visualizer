import { head, list } from '@vercel/blob';
import { HistoryIndexEntry, readHistoryIndex } from './storage';

export type SnapshotBlob = {
  url: string;
  pathname: string;
  uploadedAt: Date;
  downloadUrl: string;
};

export type SnapshotFile = {
  weekId?: string;
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

const SNAPSHOT_PREFIX = 'snapshots/';
const WEEK_FORMAT = /^(\d{4})-Week-(\d{2})$/i;

function isSnapshotFile(pathname: string) {
  return pathname.startsWith(SNAPSHOT_PREFIX) && pathname.toLowerCase().endsWith('.json');
}

export async function listSnapshotBlobs(): Promise<SnapshotBlob[]> {
  const { blobs } = await list({ prefix: SNAPSHOT_PREFIX, limit: 1000, token: process.env.BLOB_READ_WRITE_TOKEN });
  return blobs
    .filter(({ pathname }) => isSnapshotFile(pathname))
    .map((blob) => ({
      url: blob.url,
      pathname: blob.pathname,
      uploadedAt: blob.uploadedAt,
      downloadUrl: blob.downloadUrl,
    }));
}

export function parseWeekId(weekId: string) {
  const match = WEEK_FORMAT.exec(weekId);
  if (!match) return null;
  return {
    year: Number(match[1]),
    week: Number(match[2]),
  };
}

export function compareWeekIdsDesc(a: string, b: string) {
  const parsedA = parseWeekId(a);
  const parsedB = parseWeekId(b);
  if (!parsedA && !parsedB) return 0;
  if (!parsedA) return 1;
  if (!parsedB) return -1;

  if (parsedA.year !== parsedB.year) {
    return parsedB.year - parsedA.year;
  }
  return parsedB.week - parsedA.week;
}

export async function fetchSnapshot(snapshotId: string): Promise<SnapshotFile | null> {
  const metadata = await head(snapshotId, { token: process.env.BLOB_READ_WRITE_TOKEN });
  if (!isSnapshotFile(metadata.pathname)) return null;

  const response = await fetch(metadata.downloadUrl);
  if (!response.ok) {
    throw new Error(`Failed to download snapshot: ${response.statusText}`);
  }

  const data = await response.json();
  const derivedWeekId = data.weekId ?? metadata.pathname.replace(`${SNAPSHOT_PREFIX}`, '').replace('.json', '');

  return {
    weekId: derivedWeekId,
    snapshotId: metadata.pathname,
    uploadedAt: metadata.uploadedAt.toISOString(),
    offenderCount: data.offenderCount ?? 0,
    offenderList: data.offenderList ?? [],
    parsedRows: data.parsedRows ?? [],
    incompleteSessions: data.incompleteSessions,
  };
}

export async function fetchSnapshotByWeek(weekId: string): Promise<SnapshotFile | null> {
  const history = await readHistoryIndex();
  const entry = history.find((item) => item.weekId === weekId);
  if (!entry) return null;
  return fetchSnapshot(entry.path);
}

export async function listHistoryEntries(): Promise<HistoryIndexEntry[]> {
  const entries = await readHistoryIndex();
  return entries.sort((a, b) => compareWeekIdsDesc(a.weekId, b.weekId));
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
