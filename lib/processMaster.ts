import { parse } from 'csv-parse/sync';
import { putObject } from '@/lib/objectStorage';
import { getCsv } from '@/lib/storage';

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
  const headerLine = text.split(/\r?\n/).find((line) => line.trim().length > 0) ?? '';
  const delimiter = detectDelimiter(headerLine);

  const headers = ((parse(headerLine, {
    bom: true,
    delimiter,
    relax_column_count: true,
    skip_empty_lines: true,
  }) as string[][])[0] ?? []).map((header) => (header ?? '').trim());

  if (!headers.length || headers.every((header) => !header)) {
    throw new Error('No headers detected in CSV');
  }

  const rows = parse(text, {
    bom: true,
    columns: (headers: string[]) => headers.map((h) => (h ?? '').trim()),
    skip_empty_lines: true,
    relax_column_count: true,
    delimiter,
    info: false,
  }) as Record<string, string>[];

  return { headers: headers.filter(Boolean), rows };
}

export async function processMasterCsv(fileUrl: string, mapping: MasterMapping): Promise<{ names: string[] }> {
  const csvText = await getCsv(fileUrl);
  const { headers, rows } = parseCsv(csvText);

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

  await putObject(MASTER_PATH, blob, {
    contentType: 'application/json',
    allowOverwrite: true,
  });

  return { names: uniqueNames };
}
