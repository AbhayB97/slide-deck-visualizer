import { put } from '@vercel/blob';
import { parse } from 'csv-parse/sync';
import { getCsv, SNAPSHOT_PATH } from '@/lib/storage';
import { buildSnapshotPath, getIsoWeekId, upsertHistoryEntry } from '@/lib/history';
import { findPrevWeekId, saveWeekMetrics, type WeekMetrics } from '@/lib/metrics';
import { fetchSnapshotByWeek } from '@/lib/snapshots';
import { getCheckpointInfo } from "@/lib/checkpoints";
import { upsertCheckpointFromSnapshot } from "@/lib/checkpointHistory";
import { isSentDateInScope } from "@/lib/scope";

export type ParsedRow = {
  email: string;
  fullName: string;
  firstName: string;
  lastName: string;
  title: string;
  sentDate: string;
  status: string;
};

export type Snapshot = {
  snapshotId: string;
  snapshotUrl: string;
  uploadedAt: string;
  weekId: string;
  checkpointId?: string;
  checkpointDate?: string;
  checkpointOrdinal?: number;
  offenderCount: number;
  offenderList: string[];
  highRiskEmails: string[];
  parsedRows: ParsedRow[];
  incompleteSessions: {
    notStarted: number;
    inProgress: number;
    total: number;
  };
};

export type FieldMapping = {
  email: string;
  firstName: string;
  lastName: string;
  status: string;
  title: string;
  sentDate: string;
};

const INCOMPLETE_STATUSES = ['not started', 'in progress'];

function normalize(value: string | undefined | null) {
  return (value ?? '').trim();
}

function normalizeEmail(value: string | undefined | null) {
  return normalize(value).toLowerCase();
}

function detectDelimiter(headerLine: string) {
  const delimiters = [',', '\t', ';', '|'];
  const scored = delimiters.map((d) => ({
    d,
    count: (headerLine.match(new RegExp(`\\${d}`, 'g')) || []).length,
  }));
  const best = scored.sort((a, b) => b.count - a.count)[0];
  return best && best.count > 0 ? best.d : ',';
}

function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const firstLine = text.split(/\r?\n/)[0] ?? '';
  const delimiter = detectDelimiter(firstLine);

  const rows = parse(text, {
    bom: true,
    columns: (headers: string[]) => headers.map((h) => (h ?? '').trim()),
    skip_empty_lines: true,
    relax_column_count: true,
    delimiter,
    info: false,
  }) as Record<string, string>[];

  const headers = Object.keys(rows[0] ?? {});
  if (!headers.length) {
    throw new Error('No headers detected in CSV');
  }

  return { headers, rows };
}

function isIncomplete(status: string) {
  return INCOMPLETE_STATUSES.includes(status.toLowerCase());
}

function buildParsedRows(rows: Record<string, string>[], mapping: FieldMapping): ParsedRow[] {
  return rows
    .map((row) => {
      const email = normalizeEmail(row[mapping.email]);
      const firstName = normalize(row[mapping.firstName]);
      const lastName = normalize(row[mapping.lastName]);
      const status = normalize(row[mapping.status]);
      if (!firstName && !lastName) return null;
      if (!email) return null;
      if (!status) return null;

      const fullName = `${firstName} ${lastName}`.trim();
      const sentDate = normalize(row[mapping.sentDate]);
      const title = normalize(row[mapping.title]);

      return {
        email,
        fullName,
        firstName,
        lastName,
        title,
        sentDate,
        status,
      };
    })
    .filter(Boolean)
    .filter((row) => isIncomplete((row as ParsedRow).status)) as ParsedRow[];
}

export async function processCsvSnapshot(fileUrl: string, mapping: FieldMapping): Promise<Snapshot> {
  const csvText = await getCsv(fileUrl);
  const { rows, headers } = parseCsv(csvText);

  const required = ['email', 'firstName', 'lastName', 'status', 'title', 'sentDate'] as const;
  for (const key of required) {
    const header = mapping[key];
    if (!header) {
      throw new Error(`Missing mapping for ${key}`);
    }
    if (!headers.includes(header)) {
      throw new Error(`Mapping refers to missing column "${header}"`);
    }
  }

  const parsedRows = buildParsedRows(rows, mapping);
  // Eligibility rule: only sessions in configured scope years participate in escalation + checkpoint logic.
  const eligibleRows = parsedRows.filter((r) => isSentDateInScope(r.sentDate));
  const uploadedAt = new Date();
  const weekId = getIsoWeekId(uploadedAt);
  const checkpoint = getCheckpointInfo(uploadedAt);

  const offenderList = Array.from(
    new Set(eligibleRows.map((row) => row.fullName).filter(Boolean))
  );
  const highRiskEmails = Array.from(
    new Set(eligibleRows.map((row) => row.email).filter(Boolean))
  );

  const currentCountsByEmail = eligibleRows.reduce<Record<string, { email: string; name: string; count: number }>>(
    (acc, row) => {
      const email = row.email;
      if (!email) return acc;
      acc[email] = acc[email] ?? { email, name: row.fullName ?? '', count: 0 };
      acc[email].count += 1;
      if (!acc[email].name && row.fullName) acc[email].name = row.fullName;
      return acc;
    },
    {}
  );

  const notStarted = eligibleRows.filter(
    (row) => row.status.toLowerCase() === 'not started'
  ).length;
  const inProgress = eligibleRows.filter(
    (row) => row.status.toLowerCase() === 'in progress'
  ).length;

  const payload: Snapshot = {
    snapshotId: buildSnapshotPath(weekId),
    snapshotUrl: '', // populated after upload
    uploadedAt: uploadedAt.toISOString(),
    weekId,
    checkpointId: checkpoint?.checkpointId,
    checkpointDate: checkpoint?.checkpointDate,
    checkpointOrdinal: checkpoint?.checkpointOrdinal,
    offenderCount: offenderList.length,
    offenderList,
    highRiskEmails,
    parsedRows,
    incompleteSessions: {
      notStarted,
      inProgress,
      total: notStarted + inProgress,
    },
  };

  const blob = new Blob([JSON.stringify(payload)], {
    type: 'application/json',
  });

  const snapshotPath = buildSnapshotPath(weekId);
  const uploaded = await put(snapshotPath, blob, {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });

  // Maintain the legacy "latest" pointer for existing consumers.
  await put(SNAPSHOT_PATH, blob, {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });

  await upsertHistoryEntry({
    weekId,
    snapshotPath,
    snapshotUrl: uploaded.url,
    uploadedAt: payload.uploadedAt,
    offenderCount: payload.offenderCount,
    totalIncomplete: payload.incompleteSessions.total,
  });

  // Generate/overwrite per-week metrics (counts + deltas) for reporting.
  const prevWeekId = await findPrevWeekId(weekId);
  let prevCountsByEmail: Record<string, number> = {};
  if (prevWeekId) {
    const prevSnapshot = await fetchSnapshotByWeek(prevWeekId);
    const prevRows = Array.isArray(prevSnapshot?.parsedRows) ? prevSnapshot.parsedRows : [];
    prevCountsByEmail = prevRows.reduce<Record<string, number>>((acc, row: any) => {
      const email = typeof row?.email === 'string' ? row.email.trim().toLowerCase() : '';
      const sentDate = typeof row?.sentDate === 'string' ? row.sentDate : '';
      if (!isSentDateInScope(sentDate)) return acc;
      if (!email) return acc;
      acc[email] = (acc[email] ?? 0) + 1;
      return acc;
    }, {});
  }

  const metrics: WeekMetrics = {
    weekId,
    prevWeekId,
    generatedAt: new Date().toISOString(),
    users: Object.values(currentCountsByEmail)
      .map((u) => ({
        weekId,
        prevWeekId,
        email: u.email,
        name: u.name,
        incompleteCount: u.count,
        deltaFromPrevWeek: u.count - (prevCountsByEmail[u.email] ?? 0),
      }))
      .sort((a, b) => b.incompleteCount - a.incompleteCount || a.name.localeCompare(b.name)),
  };
  await saveWeekMetrics(metrics);

  // Persist a per-checkpoint view of "who is on the list" (checkpoint is anchored to Thursdays).
  await upsertCheckpointFromSnapshot(payload);

  return {
    ...payload,
    snapshotId: snapshotPath,
    snapshotUrl: uploaded.url,
  };
}
