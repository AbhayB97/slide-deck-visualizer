import { put, list, head } from '@vercel/blob';

const CSV_CONTENT_TYPE = 'text/csv';
const HISTORY_INDEX_PATH = 'history/index.json';

export type HistoryIndexEntry = {
  weekId: string;
  path: string;
};

function ensureCsvExtension(filename: string) {
  return filename.toLowerCase().endsWith('.csv') ? filename : `${filename}.csv`;
}

/**
 * Upload a CSV file to Vercel Blob correctly.
 */
export async function uploadCsv(file: File, filename: string) {
  const pathname = ensureCsvExtension(filename.trim());

  // Convert File → Blob (always accepted by Vercel Blob)
  const arrayBuffer = await file.arrayBuffer();
  const blob = new Blob([arrayBuffer], { type: CSV_CONTENT_TYPE });

  const result = await put(pathname, blob, {
    access: 'public',
    addRandomSuffix: true,
    contentType: CSV_CONTENT_TYPE,
    token: process.env.BLOB_READ_WRITE_TOKEN, // REQUIRED
  });

  return {
    url: result.url,
    pathname: result.pathname,
    uploadedAt: new Date().toISOString(),
  };
}

/**
 * List all CSV files stored in Blob.
 */
export async function listCsvFiles() {
  const { blobs } = await list({
    limit: 1000,
    token: process.env.BLOB_READ_WRITE_TOKEN, // REQUIRED
  });

  return blobs
    .filter((b) => b.pathname.toLowerCase().endsWith('.csv'))
    .map((b) => ({
      url: b.url,
      pathname: b.pathname,
      size: b.size,
      uploadedAt: b.uploadedAt,
    }));
}

/**
 * Download CSV content as text.
 */
export async function getCsv(url: string) {
  const metadata = await head(url, {
    token: process.env.BLOB_READ_WRITE_TOKEN, // REQUIRED
  });

  const response = await fetch(metadata.downloadUrl);

  if (!response.ok) {
    throw new Error(`Failed to download CSV: ${response.statusText}`);
  }

  return response.text();
}

/**
 * Load the history index (list of weekly snapshots).
 */
export async function readHistoryIndex(): Promise<HistoryIndexEntry[]> {
  try {
    const metadata = await head(HISTORY_INDEX_PATH, {
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    const response = await fetch(metadata.downloadUrl);
    if (!response.ok) {
      throw new Error(`Failed to load history index: ${response.statusText}`);
    }

    const data = await response.json();
    if (!Array.isArray(data)) return [];

    return data
      .map((item) => ({
        weekId: item?.weekId ?? '',
        path: item?.path ?? '',
      }))
      .filter((item) => item.weekId && item.path);
  } catch (err: any) {
    // If the file is missing, treat it as empty history.
    if (err?.status === 404 || err?.code === 'blob_not_found') {
      return [];
    }
    console.error('[history-index] Failed to read index', err);
    throw err;
  }
}

/**
 * Persist the history index.
 */
export async function writeHistoryIndex(entries: HistoryIndexEntry[]) {
  const blob = new Blob([JSON.stringify(entries, null, 2)], {
    type: 'application/json',
  });

  await put(HISTORY_INDEX_PATH, blob, {
    access: 'public',
    addRandomSuffix: false,
    contentType: 'application/json',
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
}
