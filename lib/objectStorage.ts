import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const OBJECT_STORAGE_ENDPOINT = process.env.OBJECT_STORAGE_ENDPOINT?.trim();
const OBJECT_STORAGE_BUCKET = process.env.OBJECT_STORAGE_BUCKET?.trim();
const OBJECT_STORAGE_ACCESS_KEY = process.env.OBJECT_STORAGE_ACCESS_KEY?.trim();
const OBJECT_STORAGE_SECRET_KEY = process.env.OBJECT_STORAGE_SECRET_KEY?.trim();
const OBJECT_STORAGE_REGION = process.env.OBJECT_STORAGE_REGION?.trim() || 'us-east-1';
const OBJECT_STORAGE_FORCE_PATH_STYLE = String(process.env.OBJECT_STORAGE_FORCE_PATH_STYLE).toLowerCase() === 'true';
const OBJECT_STORAGE_PUBLIC_BASE_URL = process.env.OBJECT_STORAGE_PUBLIC_BASE_URL?.replace(/\/+$/, '');

function requireBucket(): string {
  if (!OBJECT_STORAGE_BUCKET) {
    throw new Error('OBJECT_STORAGE_BUCKET is required');
  }
  return OBJECT_STORAGE_BUCKET;
}

function requireEndpoint(): string {
  if (!OBJECT_STORAGE_ENDPOINT) {
    throw new Error('OBJECT_STORAGE_ENDPOINT is required');
  }
  return OBJECT_STORAGE_ENDPOINT;
}

const s3 = new S3Client({
  endpoint: OBJECT_STORAGE_ENDPOINT || undefined,
  region: OBJECT_STORAGE_REGION,
  credentials:
    OBJECT_STORAGE_ACCESS_KEY && OBJECT_STORAGE_SECRET_KEY
      ? {
          accessKeyId: OBJECT_STORAGE_ACCESS_KEY,
          secretAccessKey: OBJECT_STORAGE_SECRET_KEY,
        }
      : undefined,
  forcePathStyle: OBJECT_STORAGE_FORCE_PATH_STYLE,
});

function normalizePathname(pathname: string): string {
  return pathname.replace(/^\/+/, '');
}

function isAbsoluteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function buildPublicUrl(pathname: string): string {
  const normalized = normalizePathname(pathname);
  if (OBJECT_STORAGE_PUBLIC_BASE_URL) {
    return `${OBJECT_STORAGE_PUBLIC_BASE_URL}/${encodeURI(normalized)}`;
  }

  const endpoint = requireEndpoint().replace(/\/+$/, '');
  const bucket = requireBucket();
  if (OBJECT_STORAGE_FORCE_PATH_STYLE) {
    return `${endpoint}/${encodeURI(bucket)}/${encodeURI(normalized)}`;
  }

  return `${endpoint}/${encodeURI(normalized)}`;
}

function pathnameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (OBJECT_STORAGE_PUBLIC_BASE_URL) {
      const publicBase = new URL(OBJECT_STORAGE_PUBLIC_BASE_URL);
      if (parsed.href.startsWith(publicBase.href)) {
        return normalizePathname(parsed.href.slice(publicBase.href.length));
      }
    }

    const endpoint = OBJECT_STORAGE_ENDPOINT ? new URL(requireEndpoint()) : null;
    if (endpoint && parsed.hostname === endpoint.hostname) {
      const path = normalizePathname(parsed.pathname);
      if (OBJECT_STORAGE_FORCE_PATH_STYLE) {
        const prefix = `${requireBucket()}/`;
        if (path.startsWith(prefix)) {
          return normalizePathname(path.slice(prefix.length));
        }
      }
      return path;
    }

    return normalizePathname(parsed.pathname);
  } catch {
    return normalizePathname(url);
  }
}

function addRandomSuffix(pathname: string): string {
  const normalized = normalizePathname(pathname);
  const randomSegment = Math.random().toString(36).slice(2, 10);
  const dotIndex = normalized.lastIndexOf('.');
  if (dotIndex > 0) {
    return `${normalized.slice(0, dotIndex)}-${randomSegment}${normalized.slice(dotIndex)}`;
  }
  return `${normalized}-${randomSegment}`;
}

function isObjectNotFoundError(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return false;
  }
  const anyErr = err as Record<string, unknown>;
  const status = anyErr.status ?? anyErr.statusCode ?? (anyErr.$metadata as any)?.httpStatusCode;
  const code = String(anyErr.code ?? anyErr.name ?? '').toLowerCase();
  return (
    status === 404 ||
    code === 'notfound' ||
    code === 'nosuchkey' ||
    code === 'object_not_found' ||
    code === 'notfoundexception'
  );
}

async function normalizeBody(body: Blob | ArrayBuffer | ArrayBufferView | string) {
  if (typeof body === 'string') {
    return body;
  }
  if (typeof Blob !== 'undefined' && body instanceof Blob) {
    return Buffer.from(await body.arrayBuffer());
  }
  if (body instanceof ArrayBuffer) {
    return Buffer.from(body);
  }
  if (ArrayBuffer.isView(body)) {
    return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  }
  return body;
}

export async function putObject(
  pathname: string,
  body: Blob | ArrayBuffer | ArrayBufferView | string,
  options: { contentType?: string; addRandomSuffix?: boolean; allowOverwrite?: boolean } = {}
) {
  let key = normalizePathname(pathname);
  if (options.addRandomSuffix) {
    key = addRandomSuffix(key);
  }

  if (options.allowOverwrite === false) {
    try {
      await headObject(key);
      const err = new Error(`Object already exists: ${key}`);
      (err as any).code = 'object_already_exists';
      throw err;
    } catch (err) {
      if (!isObjectNotFoundError(err)) {
        throw err;
      }
    }
  }

  const bodyValue = await normalizeBody(body);
  await s3.send(
    new PutObjectCommand({
      Bucket: requireBucket(),
      Key: key,
      Body: bodyValue,
      ContentType: options.contentType,
    })
  );

  const url = buildPublicUrl(key);
  return {
    pathname: key,
    url,
    downloadUrl: url,
    contentType: options.contentType,
  };
}

export async function headObject(pathnameOrUrl: string) {
  const key = isAbsoluteUrl(pathnameOrUrl)
    ? pathnameFromUrl(pathnameOrUrl)
    : normalizePathname(pathnameOrUrl);

  try {
    const metadata = await s3.send(
      new HeadObjectCommand({
        Bucket: requireBucket(),
        Key: key,
      })
    );

    return {
      pathname: key,
      url: buildPublicUrl(key),
      downloadUrl: buildPublicUrl(key),
      contentType: metadata.ContentType,
      contentLength: metadata.ContentLength,
      lastModified: metadata.LastModified?.toISOString(),
      metadata: metadata.Metadata,
    };
  } catch (err) {
    if (isObjectNotFoundError(err)) {
      const error = new Error('Object not found');
      (error as any).code = 'object_not_found';
      (error as any).status = 404;
      throw error;
    }
    throw err;
  }
}

export function isObjectNotFound(err: unknown) {
  return isObjectNotFoundError(err);
}

export function getSignedDownloadUrl(pathnameOrUrl: string) {
  if (isAbsoluteUrl(pathnameOrUrl)) {
    return pathnameOrUrl;
  }
  return buildPublicUrl(pathnameOrUrl);
}

export function pathnameFromUrlOrPath(urlOrPath: string) {
  if (isAbsoluteUrl(urlOrPath)) {
    return pathnameFromUrl(urlOrPath);
  }
  return normalizePathname(urlOrPath);
}
