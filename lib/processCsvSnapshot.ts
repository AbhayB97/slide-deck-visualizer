import { getCsv } from '@/lib/storage';
import { put } from '@vercel/blob';

type CsvRow = Record<string, string>;

type ParsedRow = {
  fullName: string;
  firstName: string;
  lastName: string;
  title: string;
  sentDate: string;
  status: string;
  type: string;
} & CsvRow;

type Snapshot = {
  snapshotId: string;
  snapshotUrl: string;
  uploadedAt: Date;
  offenderCount: number;
  offenderList: string[];
  incompleteSessions: {
    notStarted: number;
    inProgress: number;
    total: number;
  };
  parsedRows: ParsedRow[];
};

function parseCsv(text: string): CsvRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  const headers = lines[0].split(',').map((header) => header.trim());

  return lines.slice(1).map((line) => {
    const cells = line.split(',').map((cell) => cell.trim());
    const row: CsvRow = {};

    headers.forEach((header, index) => {
      row[header] = cells[index] ?? '';
    });

    return row;
  });
}

function buildParsedRows(rows: CsvRow[]): ParsedRow[] {
  return rows.map((row) => {
    const firstName = row.FirstName ?? row.firstname ?? row.firstName ?? '';
    const lastName = row.LastName ?? row.lastname ?? row.lastName ?? '';
    const title = row.Title ?? row.title ?? '';
    const sentDate = row.SentDate ?? row.sentDate ?? '';
    const status = row.Status ?? row.status ?? '';

    return {
      ...row,
      fullName: `${firstName} ${lastName}`.trim(),
      firstName,
      lastName,
      title,
      sentDate,
      status,
      type: status,
    };
  });
}

export async function processCsvSnapshot(fileUrl: string): Promise<Snapshot> {
  const csvText = await getCsv(fileUrl);
  const rows = parseCsv(csvText);
  const parsedRows = buildParsedRows(rows);

  const offenderList = Array.from(
    new Set(
      parsedRows
        .map((row) => row.fullName)
        .filter((name) => Boolean(name))
    )
  );

  const notStarted = parsedRows.filter(
    (row) => row.status === 'Not Started'
  ).length;
  const inProgress = parsedRows.filter(
    (row) => row.status === 'In Progress'
  ).length;
  const incompleteSessions = {
    notStarted,
    inProgress,
    total: notStarted + inProgress,
  };

  const timestamp = new Date();
  const datePart = timestamp.toISOString().slice(0, 10);
  const snapshotPathname = `snapshots/snapshot-${datePart}-${timestamp.getTime()}.json`;

  const payload = {
    snapshotId: snapshotPathname,
    sourceFileUrl: fileUrl,
    offenderCount: offenderList.length,
    offenderList,
    incompleteSessions,
    parsedRows,
    uploadedAt: timestamp.toISOString(),
  };

  const upload = await put(snapshotPathname, JSON.stringify(payload), {
    access: 'public',
    addRandomSuffix: false,
    contentType: 'application/json',
  });

  return {
    snapshotId: snapshotPathname,
    snapshotUrl: upload.url,
    uploadedAt: timestamp,
    offenderCount: offenderList.length,
    offenderList,
    incompleteSessions,
    parsedRows,
  };
}
