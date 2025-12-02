import { put, head } from '@vercel/blob';

const CSV_CONTENT_TYPE = 'text/csv';
export const SNAPSHOT_PATH = 'snapshots/latest.json';

function ensureCsvExtension(filename: string) {
  return filename.toLowerCase().endsWith('.csv') ? filename : `${filename}.csv`;
}

export type UploadedFile = {
  url: string;
  pathname: string;
  uploadedAt: string;
};

/**
 * Upload a CSV file to Vercel Blob.
 */
export async function uploadCsv(file: File, filename: string): Promise<UploadedFile> {
  const pathname = ensureCsvExtension(filename.trim());

  const arrayBuffer = await file.arrayBuffer();
  const blob = new Blob([arrayBuffer], { type: CSV_CONTENT_TYPE });

  const result = await put(pathname, blob, {
    access: 'public',
    addRandomSuffix: true,
    contentType: CSV_CONTENT_TYPE,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });

  return {
    url: result.url,
    pathname: result.pathname,
    uploadedAt: new Date().toISOString(),
  };
}

/**
 * Download CSV content as text.
 * Supports either a public blob URL or a blob pathname.
 */
export async function getCsv(urlOrPath: string): Promise<string> {
  try {
    const isUrl = /^https?:\/\//i.test(urlOrPath);
    const downloadUrl = isUrl
      ? urlOrPath
      : (await head(urlOrPath, { token: process.env.BLOB_READ_WRITE_TOKEN })).downloadUrl;

    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error(`Failed to download CSV: ${response.status} ${response.statusText}`);
    }

    return await response.text();
  } catch (err) {
    console.error('[storage:getCsv] Failed to read CSV', err);
    throw err;
  }
}
