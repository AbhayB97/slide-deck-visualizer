import { getObjectJson, isObjectNotFound, putObject } from '@/lib/objectStorage';
import { getCheckpointInfo } from '@/lib/checkpoints';
import type { Snapshot } from '@/lib/processCsvSnapshot';

export const CHECKPOINT_INDEX_PATH = 'checkpoints/index.json';
export const CHECKPOINT_DIR = 'checkpoints';

export type CheckpointIndexEntry = {
  checkpointId: string;
  checkpointDate: string; // YYYY-MM-DD (UTC Thursday)
  checkpointOrdinal: number;
  latestWeekId: string;
  latestUploadedAt: string;
};

export type CheckpointIndex = {
  checkpoints: CheckpointIndexEntry[];
};

export type CheckpointRecord = {
  checkpointId: string;
  checkpointDate: string;
  checkpointOrdinal: number;
  weekId: string;
  uploadedAt: string;
  highRiskEmails: string[]; // may contain names if legacy snapshot
};

function normalizeEmail(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

function toDate(value: unknown) {
  const d = typeof value === 'string' || typeof value === 'number' ? new Date(value) : value;
  return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
}

function buildCheckpointPath(checkpointId: string): string {
  return `${CHECKPOINT_DIR}/${checkpointId}.json`;
}

export async function fetchCheckpointIndex(): Promise<CheckpointIndex> {
  try {
    const data = await getObjectJson<CheckpointIndex>(CHECKPOINT_INDEX_PATH);
    return {
      checkpoints: Array.isArray(data?.checkpoints) ? data.checkpoints : [],
    };
  } catch (err: unknown) {
    if (isObjectNotFound(err)) {
      return { checkpoints: [] };
    }
    throw err;
  }
}

async function saveCheckpointIndex(index: CheckpointIndex): Promise<CheckpointIndex> {
  const blob = new Blob([JSON.stringify(index)], { type: 'application/json' });
  await putObject(CHECKPOINT_INDEX_PATH, blob, {
    allowOverwrite: true,
    contentType: 'application/json',
  });
  return index;
}

export async function fetchCheckpointRecord(checkpointId: string): Promise<CheckpointRecord | null> {
  try {
    const data = await getObjectJson<CheckpointRecord>(buildCheckpointPath(checkpointId));
    if (!data || data.checkpointId !== checkpointId) return null;
    return {
      ...data,
      highRiskEmails: Array.isArray(data.highRiskEmails)
        ? data.highRiskEmails.map(normalizeEmail).filter(Boolean)
        : [],
    };
  } catch (err: unknown) {
    if (isObjectNotFound(err)) return null;
    throw err;
  }
}

async function saveCheckpointRecord(record: CheckpointRecord): Promise<CheckpointRecord> {
  const blob = new Blob([JSON.stringify(record)], { type: 'application/json' });
  await putObject(buildCheckpointPath(record.checkpointId), blob, {
    allowOverwrite: true,
    contentType: 'application/json',
  });
  return record;
}

export async function upsertCheckpointFromSnapshot(snapshot: Snapshot): Promise<CheckpointRecord | null> {
  const uploadedAt = toDate(snapshot.uploadedAt) ?? new Date();
  const info = getCheckpointInfo(uploadedAt);
  if (!info) return null;

  const riskListRaw: unknown[] = Array.isArray((snapshot as unknown as { highRiskEmails?: unknown }).highRiskEmails)
    ? (((snapshot as unknown as { highRiskEmails?: unknown }).highRiskEmails as unknown[]) ?? [])
    : Array.isArray((snapshot as unknown as { offenderList?: unknown }).offenderList)
      ? (((snapshot as unknown as { offenderList?: unknown }).offenderList as unknown[]) ?? [])
      : [];
  const highRiskEmails = Array.from(
    new Set(riskListRaw.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean).map(normalizeEmail))
  );

  const checkpointRecord: CheckpointRecord = {
    checkpointId: info.checkpointId,
    checkpointDate: info.checkpointDate,
    checkpointOrdinal: info.checkpointOrdinal,
    weekId: snapshot.weekId ?? '',
    uploadedAt: uploadedAt.toISOString(),
    highRiskEmails,
  };

  const existing = await fetchCheckpointRecord(info.checkpointId);
  if (existing) {
    const existingTime = toDate(existing.uploadedAt)?.getTime() ?? 0;
    const nextTime = uploadedAt.getTime();
    if (nextTime < existingTime) {
      checkpointRecord.weekId = existing.weekId;
      checkpointRecord.uploadedAt = existing.uploadedAt;
      checkpointRecord.highRiskEmails = existing.highRiskEmails ?? [];
    }
  }

  await saveCheckpointRecord(checkpointRecord);

  const index = await fetchCheckpointIndex();
  const checkpoints = [...(index.checkpoints ?? [])];
  const idx = checkpoints.findIndex((c) => c.checkpointId === info.checkpointId);
  const entry: CheckpointIndexEntry = {
    checkpointId: info.checkpointId,
    checkpointDate: info.checkpointDate,
    checkpointOrdinal: info.checkpointOrdinal,
    latestWeekId: checkpointRecord.weekId,
    latestUploadedAt: checkpointRecord.uploadedAt,
  };
  if (idx >= 0) checkpoints[idx] = entry;
  else checkpoints.push(entry);

  checkpoints.sort((a, b) => {
    const at = toDate(a.latestUploadedAt)?.getTime() ?? 0;
    const bt = toDate(b.latestUploadedAt)?.getTime() ?? 0;
    return bt - at;
  });

  await saveCheckpointIndex({ checkpoints });
  return checkpointRecord;
}
