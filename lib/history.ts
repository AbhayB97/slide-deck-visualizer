import { headObject, isObjectNotFound, putObject } from '@/lib/objectStorage';

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
    const metadata = await headObject(HISTORY_INDEX_PATH);
    const response = await fetch(metadata.downloadUrl);
    if (!response.ok) {
      throw new Error(`Failed to download history index: ${response.status} ${response.statusText}`);
    }
    const data = (await response.json()) as HistoryIndex;
    return {
      weeks: Array.isArray(data?.weeks) ? data.weeks : [],
    };
  } catch (err: unknown) {
    if (
      isObjectNotFound(err) ||
      (typeof err === 'object' && err !== null &&
        ((err as { message?: string }).message?.includes('does not exist') ?? false))
    ) {
      return { weeks: [] };
    }
    console.error('[history] Failed to fetch history index', err);
    throw err;
  }
}

async function saveHistoryIndex(index: HistoryIndex): Promise<HistoryIndex> {
  const blob = new Blob([JSON.stringify(index)], { type: 'application/json' });
  await putObject(HISTORY_INDEX_PATH, blob, {
    allowOverwrite: true,
    contentType: 'application/json',
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
