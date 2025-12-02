import { put } from '@vercel/blob';
import { parse } from 'csv-parse/sync';
import { getCsv, SNAPSHOT_PATH } from '@/lib/storage';

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
  offenderCount: number;
  offenderList: string[];
  parsedRows: ParsedRow[];
  incompleteSessions: {
    notStarted: number;
    inProgress: number;
    total: number;
  };
};

const INCOMPLETE_STATUSES = ['not started', 'in progress'];

const REQUIRED_HEADERS: { key: string; label: string }[] = [
  { key: 'user first name', label: 'User First Name' },
  { key: 'user last name', label: 'User Last Name' },
  { key: 'status', label: 'Status' },
  { key: 'title', label: 'Title' },
  { key: 'sent date (utc)', label: 'Sent Date (UTC)' },
];

function normalize(value: string | undefined | null) {
  return (value ?? '').trim();
}

function isIncomplete(status: string) {
  return INCOMPLETE_STATUSES.includes(status.toLowerCase());
}

function parseCsv(text: string): Record<string, string>[] {
  const records = parse(text, {
    bom: true,
    columns: (headers: string[]) => headers.map((h) => h?.trim().toLowerCase()),
    skip_empty_lines: true,
    relax_column_count: true,
    info: true,
  }) as (Record<string, string>[] & { info?: { columns?: string[] } });

  const info = (records as any)?.info as { columns?: string[] } | undefined;
  const headers = new Set((info?.columns ?? []).map((h) => h.toLowerCase()));
  for (const { key, label } of REQUIRED_HEADERS) {
    if (!headers.has(key)) {
      throw new Error(`Invalid CSV format: missing column "${label}"`);
    }
  }

  return records;
}

function buildParsedRows(rows: Record<string, string>[]): ParsedRow[] {
  return rows
    .map((row) => {
      const firstName = normalize(row['user first name']);
      const lastName = normalize(row['user last name']);
      const status = normalize(row['status']);
      if (!firstName && !lastName) return null;
      if (!status) return null;

      const fullName = `${firstName} ${lastName}`.trim();
      const sentDate = normalize(row['sent date (utc)']);
      const title = normalize(row['title']);

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

export async function processCsvSnapshot(fileUrl: string): Promise<Snapshot> {
  const csvText = await getCsv(fileUrl);
  const rows = parseCsv(csvText);
  const parsedRows = buildParsedRows(rows);

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
    snapshotId: SNAPSHOT_PATH,
    snapshotUrl: '', // populated after upload
    uploadedAt: new Date().toISOString(),
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

  const uploaded = await put(SNAPSHOT_PATH, blob, {
    access: 'public',
    addRandomSuffix: false,
    contentType: 'application/json',
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });

  return {
    ...payload,
    snapshotUrl: uploaded.url,
  };
}
