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

const INCOMPLETE_STATUSES = ['not started', 'in progress'];

const HEADER_ALIASES: Record<
  'firstName' | 'lastName' | 'status' | 'title' | 'sentDate',
  string[]
> = {
  firstName: ['User First Name', 'First Name', 'FirstName', 'UserFirstName'],
  lastName: ['User Last Name', 'Last Name', 'LastName', 'UserLastName'],
  status: ['Status', 'State', 'Training Status'],
  title: ['Title', 'Session Title', 'Course Name', 'Module Title'],
  sentDate: ['Sent Date (UTC)', 'Sent Date', 'SentDate', 'Assigned Date'],
};

function normalize(value: string | undefined | null) {
  return (value ?? '').trim();
}

function normalizeHeaderKey(raw: string | undefined | null) {
  const trimmed = (raw ?? '').replace(/^\uFEFF/, '').trim();
  const withoutQuotes = trimmed.replace(/^["']+|["']+$/g, '');
  const collapsed = withoutQuotes.replace(/\s+/g, ' ').toLowerCase();
  const compact = collapsed.replace(/[^a-z0-9]+/g, '');
  return compact;
}

function isIncomplete(status: string) {
  return INCOMPLETE_STATUSES.includes(status.toLowerCase());
}

function buildAliasLookup(): {
  normalizedAliases: Record<keyof typeof HEADER_ALIASES, string[]>;
  prettyList: Record<keyof typeof HEADER_ALIASES, string>;
} {
  const normalizedAliases: Partial<Record<keyof typeof HEADER_ALIASES, string[]>> = {};
  const prettyList: Partial<Record<keyof typeof HEADER_ALIASES, string>> = {};

  (Object.keys(HEADER_ALIASES) as (keyof typeof HEADER_ALIASES)[]).forEach((key) => {
    const aliases = HEADER_ALIASES[key];
    normalizedAliases[key] = aliases.map((a) => normalizeHeaderKey(a));
    prettyList[key] = aliases.join(', ');
  });

  return { normalizedAliases: normalizedAliases as Record<keyof typeof HEADER_ALIASES, string[]>, prettyList: prettyList as Record<keyof typeof HEADER_ALIASES, string> };
}

function ensureRequiredHeaders(headers: Set<string>) {
  const { normalizedAliases, prettyList } = buildAliasLookup();
  (Object.keys(normalizedAliases) as (keyof typeof HEADER_ALIASES)[]).forEach((key) => {
    const hasAlias = normalizedAliases[key].some((alias) => headers.has(alias));
    if (!hasAlias) {
      throw new Error(
        `Missing required column for ${key.replace(/([A-Z])/g, ' $1').toLowerCase()} (tried: ${prettyList[key]})`
      );
    }
  });
}

function getField(row: Record<string, string>, aliases: string[]) {
  for (const alias of aliases) {
    if (alias in row) return normalize(row[alias]);
  }
  return '';
}

function parseCsv(text: string): Record<string, string>[] {
  const firstLine = text.split(/\r?\n/)[0] ?? '';
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const delimiter = tabCount > commaCount ? '\t' : ',';

  const records = parse(text, {
    bom: true,
    columns: (headers: string[]) => headers.map((h) => normalizeHeaderKey(h)),
    skip_empty_lines: true,
    relax_column_count: true,
    delimiter,
    info: true,
  }) as (Record<string, string>[] & { info?: { columns?: string[] } });

  const info = (records as any)?.info as { columns?: string[] } | undefined;
  const discoveredHeaders =
    info?.columns && info.columns.length
      ? info.columns
      : records.length
      ? Object.keys(records[0])
      : [];
  const headers = new Set(discoveredHeaders.map((h) => normalizeHeaderKey(h)));
  ensureRequiredHeaders(headers);

  return records;
}

function buildParsedRows(rows: Record<string, string>[]): ParsedRow[] {
  const { normalizedAliases } = buildAliasLookup();

  return rows
    .map((row) => {
      const firstName = getField(row, normalizedAliases.firstName);
      const lastName = getField(row, normalizedAliases.lastName);
      const status = getField(row, normalizedAliases.status);
      if (!firstName && !lastName) return null;
      if (!status) return null;

      const fullName = `${firstName} ${lastName}`.trim();
      const sentDate = getField(row, normalizedAliases.sentDate);
      const title = getField(row, normalizedAliases.title);

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
