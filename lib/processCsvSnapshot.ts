import { put } from '@vercel/blob';
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

function normalize(value: string | undefined | null) {
  return (value ?? '').trim();
}

function isIncomplete(status: string) {
  return INCOMPLETE_STATUSES.includes(status.toLowerCase());
}

function parseCsv(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());

  return lines.slice(1).map((line) => {
    const cells = line.split(',').map((c) => c.trim());
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? '';
    });
    return row;
  });
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
