import { put } from '@vercel/blob';
import { getCsv } from '@/lib/storage';
import { parseCsvText } from '@/lib/csv';

export type MasterMapping = {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email: string;
};

export const MASTER_PATH = 'master/latest.json';

function normalize(value: string | undefined | null) {
  return (value ?? '').trim();
}

function normalizeEmail(value: string | undefined | null) {
  return normalize(value).toLowerCase();
}

export function previewMasterCsv(text: string, mapping: MasterMapping) {
  const { headers, rows } = parseCsvText(text);

  if (!mapping.email) {
    throw new Error('Mapping for email is required');
  }
  if (!headers.includes(mapping.email)) {
    throw new Error(`Mapping refers to missing column "${mapping.email}"`);
  }

  const hasFull = Boolean(mapping.fullName);
  const hasFirstLast = Boolean(mapping.firstName && mapping.lastName);
  if (!hasFull && !hasFirstLast) {
    throw new Error('Mapping for either fullName or both firstName and lastName is required');
  }
  if (hasFull && !headers.includes(mapping.fullName as string)) {
    throw new Error(`Mapping refers to missing column "${mapping.fullName}"`);
  }
  if (hasFirstLast) {
    if (!headers.includes(mapping.firstName as string) || !headers.includes(mapping.lastName as string)) {
      throw new Error('Mapping refers to missing column(s)');
    }
  }

  const rejectedRows: Array<{ rowNumber: number; reason: string }> = [];
  const duplicateEmails = new Map<string, number>();
  const uniqueEmails = new Set<string>();

  rows.forEach((row, index) => {
    const email = normalizeEmail(row[mapping.email]);
    if (!email) {
      rejectedRows.push({ rowNumber: index + 2, reason: 'Missing email' });
      return;
    }
    const fullName = mapping.fullName
      ? normalize(row[mapping.fullName])
      : `${normalize(row[mapping.firstName as string])} ${normalize(row[mapping.lastName as string])}`.trim();
    if (!fullName) {
      rejectedRows.push({ rowNumber: index + 2, reason: 'Missing name' });
      return;
    }
    if (uniqueEmails.has(email)) {
      duplicateEmails.set(email, (duplicateEmails.get(email) ?? 1) + 1);
      return;
    }
    uniqueEmails.add(email);
  });

  return {
    headers,
    sourceRowCount: rows.length,
    acceptedRowCount: uniqueEmails.size,
    rejectedRowCount: rejectedRows.length,
    rejectedRows: rejectedRows.slice(0, 12),
    duplicateEmails: Array.from(duplicateEmails.entries()).map(([email, count]) => ({
      email,
      count,
    })),
  };
}

export async function processMasterCsv(fileUrl: string, mapping: MasterMapping): Promise<{ names: string[] }> {
  const csvText = await getCsv(fileUrl);
  const { rows } = parseCsvText(csvText);
  previewMasterCsv(csvText, mapping);

  const entries = rows
    .map((row) => {
      const email = normalizeEmail(row[mapping.email]);
      if (!email) return null;
      if (mapping.fullName) {
        const full = normalize(row[mapping.fullName]);
        const name = full || null;
        if (!name) return null;
        return { email, name };
      }
      const first = normalize(row[mapping.firstName as string]);
      const last = normalize(row[mapping.lastName as string]);
      const full = `${first} ${last}`.trim();
      if (!full) return null;
      return { email, name: full };
    })
    .filter(Boolean) as { email: string; name: string }[];

  const uniqueByEmail = new Map<string, { email: string; name: string }>();
  for (const entry of entries) {
    if (!uniqueByEmail.has(entry.email)) {
      uniqueByEmail.set(entry.email, entry);
    }
  }
  const uniqueEntries = Array.from(uniqueByEmail.values());
  const uniqueNames = uniqueEntries.map((e) => e.name);

  const blob = new Blob([JSON.stringify(uniqueEntries)], { type: 'application/json' });

  await put(MASTER_PATH, blob, {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });

  return { names: uniqueNames };
}
