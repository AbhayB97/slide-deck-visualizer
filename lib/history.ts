import { head, put } from '@vercel/blob';

export const HISTORY_INDEX_PATH = 'history/index.json';
export const SNAPSHOT_DIR = 'snapshots';

export type HistoryEntry = {
  weekId: string;
  snapshotPath: string;
  snapshotUrl: string;
  uploadedAt: string;
  offenderCount: number;
  totalIncomplete: number;
};

export type HistoryIndex = {
  weeks: HistoryEntry[];
};

function toDate(value: unknown) {
  const d = typeof value === 'string' || typeof value === 'number' ? new Date(value) : value;
  return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
}

export function getIsoWeekId(date: Date = new Date()): string {
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${utc.getUTCFullYear()}-Week-${String(weekNo).padStart(2, '0')}`;
}

export function buildSnapshotPath(weekId: string): string {
  return `${SNAPSHOT_DIR}/${weekId}.json`;
}


export async function fetchHistoryIndex(): Promise<HistoryIndex> {
  try {
    const metadata = await head(HISTORY_INDEX_PATH, { token: process.env.BLOB_READ_WRITE_TOKEN });
    const response = await fetch(metadata.downloadUrl);
    if (!response.ok) {
      throw new Error(`Failed to download history index: ${response.status} ${response.statusText}`);
    }
    const data = (await response.json()) as HistoryIndex;
    return {
      weeks: Array.isArray(data?.weeks) ? data.weeks : [],
    };
  } catch (err: any) {
    // FIX: Check for the specific SDK error message "does not exist"
    if (
      err?.status === 404 || 
      err?.statusCode === 404 || 
      err?.code === 'blob_not_found' ||
      err?.message?.includes('does not exist')
    ) {
      // If the index file doesn't exist yet (first run), return an empty list
      return { weeks: [] };
    }
    console.error('[history] Failed to fetch history index', err);
    throw err;
  }
}
async function saveHistoryIndex(index: HistoryIndex): Promise<HistoryIndex> {
  const blob = new Blob([JSON.stringify(index)], { type: 'application/json' });
  await put(HISTORY_INDEX_PATH, blob, {
    access: 'public',
    addRandomSuffix: false,
    contentType: 'application/json',
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  return index;
}

export async function upsertHistoryEntry(entry: HistoryEntry): Promise<HistoryIndex> {
  const current = await fetchHistoryIndex();
  const weeks = [...current.weeks];
  const existingIdx = weeks.findIndex((w) => w.weekId === entry.weekId);
  if (existingIdx >= 0) {
    weeks[existingIdx] = entry;
  } else {
    weeks.push(entry);
  }

  weeks.sort((a, b) => {
    const aDate = toDate(a.uploadedAt)?.getTime() ?? 0;
    const bDate = toDate(b.uploadedAt)?.getTime() ?? 0;
    return bDate - aDate;
  });

  return saveHistoryIndex({ weeks });
}

export function weekIdFromSnapshotPath(snapshotPath: string | undefined | null): string | null {
  if (!snapshotPath) return null;
  const match = /snapshots\/([^/]+)\.json$/i.exec(snapshotPath);
  return match?.[1] ?? null;
}
