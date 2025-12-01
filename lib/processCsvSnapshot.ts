import { getCsv, readHistoryIndex, writeHistoryIndex } from '@/lib/storage';
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
  weekId: string;
  snapshotId: string;
  snapshotUrl: string;
  uploadedAt: string;
  offenderCount: number;
  offenderList: string[];
  incompleteSessions: {
    notStarted: number;
    inProgress: number;
    total: number;
  };
  parsedRows: ParsedRow[];
};

function getIsoWeekId(timestamp: Date) {
  const date = new Date(Date.UTC(timestamp.getFullYear(), timestamp.getMonth(), timestamp.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-Week-${String(weekNo).padStart(2, "0")}`;
}

function parseCsv(text: string): CsvRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  const headers = lines[0].split(",").map((h) => h.trim());

  return lines.slice(1).map((line) => {
    const cells = line.split(",").map((c) => c.trim());
    const row: CsvRow = {};

    headers.forEach((header, index) => {
      row[header] = cells[index] ?? "";
    });

    return row;
  });
}

function buildParsedRows(rows: CsvRow[]): ParsedRow[] {
  return rows.map((row) => {
    const firstName =
      row["User First Name"] ?? row.FirstName ?? row.firstname ?? "";
    const lastName =
      row["User Last Name"] ?? row.LastName ?? row.lastname ?? "";
    const title = row.Title ?? row.title ?? row["Title"] ?? "";
    const sentDate =
      row["Sent Date (UTC)"] ?? row.SentDate ?? row.sentDate ?? "";
    const status = row.Status ?? row.status ?? "";

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
  // --- 1. Download the CSV ---
  const csvText = await getCsv(fileUrl);

  // --- 2. Parse CSV rows ---
  const rows = parseCsv(csvText);
  const parsedRows = buildParsedRows(rows);

  // --- 3. Build offender list ---
  const offenderList = Array.from(
    new Set(
      parsedRows
        .filter((row) => row.status === "Not Started" || row.status === "In Progress")
        .map((row) => row.fullName)
        .filter(Boolean)
    )
  );

  // --- 4. Count incomplete sessions ---
  const notStarted = parsedRows.filter(
    (row) => row.status === "Not Started"
  ).length;

  const inProgress = parsedRows.filter(
    (row) => row.status === "In Progress"
  ).length;

  const incompleteSessions = {
    notStarted,
    inProgress,
    total: notStarted + inProgress,
  };

  // --- 5. Snapshot filename ---
  const timestamp = new Date();
  const weekId = getIsoWeekId(timestamp);
  const snapshotPathname = `snapshots/${weekId}.json`;

  // --- 6. Snapshot payload ---
  const payload = {
    weekId,
    snapshotId: snapshotPathname,
    sourceFileUrl: fileUrl,
    offenderCount: offenderList.length,
    offenderList,
    incompleteSessions,
    parsedRows,
    uploadedAt: timestamp.toISOString(),
  };

  // --- 7. Upload snapshot JSON to Vercel Blob ---
  const blob = new Blob([JSON.stringify(payload)], {
    type: "application/json",
  });

  const upload = await put(snapshotPathname, blob, {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json",
    token: process.env.BLOB_READ_WRITE_TOKEN, // REQUIRED FOR WRITE
  });

  // --- 8. Return snapshot summary ---
  const existingHistory = await readHistoryIndex();
  const updatedHistory = [
    ...existingHistory.filter((item) => item.weekId !== weekId),
    { weekId, path: snapshotPathname },
  ];
  await writeHistoryIndex(updatedHistory);

  return {
    weekId,
    snapshotId: snapshotPathname,
    snapshotUrl: upload.url,
    uploadedAt: timestamp.toISOString(),
    offenderCount: offenderList.length,
    offenderList,
    incompleteSessions,
    parsedRows,
  };
}
