import { getObjectBuffer, putObject } from '@/lib/objectStorage';

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

export async function uploadCsv(file: File, filename: string): Promise<UploadedFile> {
  const pathname = ensureCsvExtension(filename.trim());

  const arrayBuffer = await file.arrayBuffer();
  const blob = new Blob([arrayBuffer], { type: CSV_CONTENT_TYPE });

  const result = await putObject(pathname, blob, {
    addRandomSuffix: true,
    contentType: CSV_CONTENT_TYPE,
  });

  return {
    url: result.url,
    pathname: result.pathname,
    uploadedAt: new Date().toISOString(),
  };
}

export async function getCsv(urlOrPath: string): Promise<string> {
  try {
    return decodeCsvBuffer(await getObjectBuffer(urlOrPath));
  } catch (err) {
    console.error('[storage:getCsv] Failed to read CSV', err);
    throw err;
  }
}

function decodeCsvBuffer(buffer: ArrayBuffer | ArrayBufferView) {
  const bytes = ArrayBuffer.isView(buffer)
    ? buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    : buffer;
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  if (!utf8.includes('\uFFFD')) {
    return utf8;
  }
  try {
    return new TextDecoder('windows-1252').decode(bytes);
  } catch {
    return utf8;
  }
}
