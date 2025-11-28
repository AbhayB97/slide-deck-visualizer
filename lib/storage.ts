import { head, list, put, type PutBody } from '@vercel/blob';

const CSV_CONTENT_TYPE = 'text/csv';

function ensureCsvExtension(filename: string) {
  return filename.toLowerCase().endsWith('.csv') ? filename : `${filename}.csv`;
}

export async function uploadCsv(buffer: PutBody, filename: string) {
  const pathname = ensureCsvExtension(filename.trim());
  const result = await put(pathname, buffer, {
    access: 'public',
    addRandomSuffix: true,
    contentType: CSV_CONTENT_TYPE,
  });

  return {
    url: result.url,
    pathname: result.pathname,
    uploadedAt: result.uploadedAt,
  };
}

export async function listCsvFiles() {
  const { blobs } = await list({ limit: 1000 });

  return blobs
    .filter(({ pathname }) => pathname.toLowerCase().endsWith('.csv'))
    .map(({ url, pathname, size, uploadedAt }) => ({
      url,
      pathname,
      size,
      uploadedAt,
    }));
}

export async function getCsv(url: string) {
  const metadata = await head(url);
  const response = await fetch(metadata.downloadUrl);

  if (!response.ok) {
    throw new Error(`Failed to download CSV: ${response.statusText}`);
  }

  return response.text();
}
