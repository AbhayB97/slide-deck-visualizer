import { put } from '@vercel/blob';
import { parse } from 'csv-parse/sync';
import { getCsv, SNAPSHOT_PATH } from '@/lib/storage';
import { buildSnapshotPath, getIsoWeekId, upsertHistoryEntry } from '@/lib/history';

export type ParsedRow = {
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
  offenderCount: number;
  offenderList: string[];
  parsedRows: ParsedRow[];
  incompleteSessions: {
    notStarted: number;
    inProgress: number;
    total: number;
  };
};

export type FieldMapping = {
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
      const firstName = normalize(row[mapping.firstName]);
      const lastName = normalize(row[mapping.lastName]);
      const status = normalize(row[mapping.status]);
      if (!firstName && !lastName) return null;
      if (!status) return null;

      const fullName = `${firstName} ${lastName}`.trim();
      const sentDate = normalize(row[mapping.sentDate]);
      const title = normalize(row[mapping.title]);

      return {
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

  const required = ['firstName', 'lastName', 'status', 'title', 'sentDate'] as const;
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
  const uploadedAt = new Date();
  const weekId = getIsoWeekId(uploadedAt);

  const offenderList = Array.from(
    new Set(parsedRows.map((row) => row.fullName).filter(Boolean))
  );

  const notStarted = parsedRows.filter(
    (row) => row.status.toLowerCase() === 'not started'
  ).length;
  const inProgress = parsedRows.filter(
    (row) => row.status.toLowerCase() === 'in progress'
  ).length;

  const payload: Snapshot = {
    snapshotId: buildSnapshotPath(weekId),
    snapshotUrl: '', // populated after upload
    uploadedAt: uploadedAt.toISOString(),
    weekId,
    offenderCount: offenderList.length,
    offenderList,
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
    contentType: 'application/json',
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });

  // Maintain the legacy "latest" pointer for existing consumers.
  await put(SNAPSHOT_PATH, blob, {
    access: 'public',
    addRandomSuffix: false,
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

  return {
    ...payload,
    snapshotId: snapshotPath,
    snapshotUrl: uploaded.url,
  };
}
