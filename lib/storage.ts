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
    const fetchDirect = async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) {
        const message = res.status === 404 ? 'File not found or expired' : `Failed to download CSV: ${res.status} ${res.statusText}`;
        throw new Error(message);
      }
      const buffer = await res.arrayBuffer();
      const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
      if (!utf8.includes('\uFFFD')) {
        return utf8;
      }
      try {
        return new TextDecoder('windows-1252').decode(buffer);
      } catch {
        return utf8;
      }
    };

    if (isUrl) {
      return await fetchDirect(urlOrPath);
    }

    const metadata = await head(urlOrPath, { token: process.env.BLOB_READ_WRITE_TOKEN });
    if (!metadata?.downloadUrl) {
      throw new Error('File not found or expired');
    }
    return await fetchDirect(metadata.downloadUrl);
  } catch (err) {
    console.error('[storage:getCsv] Failed to read CSV', err);
    throw err;
  }
}
