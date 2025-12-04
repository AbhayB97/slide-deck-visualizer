import { put } from '@vercel/blob';
import { parse } from 'csv-parse/sync';
import { getCsv } from '@/lib/storage';

export type MasterMapping = {
  firstName?: string;
  lastName?: string;
  fullName?: string;
};

export const MASTER_PATH = 'master/latest.json';

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

export async function processMasterCsv(fileUrl: string, mapping: MasterMapping): Promise<{ names: string[] }> {
  const csvText = await getCsv(fileUrl);
  const { headers, rows } = parseCsv(csvText);

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

  const names = rows
    .map((row) => {
      if (mapping.fullName) {
        const full = normalize(row[mapping.fullName]);
        return full || null;
      }
      const first = normalize(row[mapping.firstName as string]);
      const last = normalize(row[mapping.lastName as string]);
      const full = `${first} ${last}`.trim();
      return full || null;
    })
    .filter(Boolean) as string[];

  const uniqueNames = Array.from(new Set(names));

  const blob = new Blob([JSON.stringify(uniqueNames)], { type: 'application/json' });

  await put(MASTER_PATH, blob, {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });

  return { names: uniqueNames };
}
