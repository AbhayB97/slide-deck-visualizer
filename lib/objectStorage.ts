import crypto from 'crypto';
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export type StoredObject = {
  url: string;
  downloadUrl: string;
  pathname: string;
};

const endpoint = process.env.OBJECT_STORAGE_ENDPOINT;
const bucket = process.env.OBJECT_STORAGE_BUCKET;
const accessKeyId = process.env.OBJECT_STORAGE_ACCESS_KEY;
const secretAccessKey = process.env.OBJECT_STORAGE_SECRET_KEY;
const publicBaseUrl = process.env.OBJECT_STORAGE_PUBLIC_BASE_URL;

function requireEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function encodePathname(pathname: string) {
  return pathname
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function getClient() {
  return new S3Client({
    region: process.env.OBJECT_STORAGE_REGION || 'us-east-1',
    endpoint: requireEnv(endpoint, 'OBJECT_STORAGE_ENDPOINT'),
    forcePathStyle: process.env.OBJECT_STORAGE_FORCE_PATH_STYLE !== 'false',
    credentials: {
      accessKeyId: requireEnv(accessKeyId, 'OBJECT_STORAGE_ACCESS_KEY'),
      secretAccessKey: requireEnv(secretAccessKey, 'OBJECT_STORAGE_SECRET_KEY'),
    },
  });
}

function objectUrl(pathname: string) {
  const base = publicBaseUrl || `${requireEnv(endpoint, 'OBJECT_STORAGE_ENDPOINT').replace(/\/$/, '')}/${requireEnv(bucket, 'OBJECT_STORAGE_BUCKET')}`;
  return `${base.replace(/\/$/, '')}/${encodePathname(pathname)}`;
}

function addRandomSuffix(pathname: string) {
  const suffix = crypto.randomUUID();
  const lastSlash = pathname.lastIndexOf('/');
  const directory = lastSlash >= 0 ? pathname.slice(0, lastSlash + 1) : '';
  const filename = lastSlash >= 0 ? pathname.slice(lastSlash + 1) : pathname;
  const dot = filename.lastIndexOf('.');

  if (dot <= 0) {
    return `${directory}${filename}-${suffix}`;
  }

  return `${directory}${filename.slice(0, dot)}-${suffix}${filename.slice(dot)}`;
}

export function pathnameFromUrlOrPath(urlOrPath: string): string {
  if (!/^https?:\/\//i.test(urlOrPath)) {
    return urlOrPath.replace(/^\/+/, '');
  }

  const parsed = new URL(urlOrPath);
  const pathname = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  const bucketName = requireEnv(bucket, 'OBJECT_STORAGE_BUCKET');

  if (pathname === bucketName) {
    return '';
  }

  if (pathname.startsWith(`${bucketName}/`)) {
    return pathname.slice(bucketName.length + 1);
  }

  return pathname;
}

export function isObjectNotFound(err: any) {
  const status = err?.$metadata?.httpStatusCode ?? err?.status ?? err?.statusCode;
  return status === 404 || err?.name === 'NotFound' || err?.name === 'NoSuchKey' || err?.Code === 'NoSuchKey';
}

export async function putObject(
  pathname: string,
  body: Blob | Buffer | Uint8Array | string,
  options: {
    contentType: string;
    addRandomSuffix?: boolean;
  }
): Promise<StoredObject> {
  const finalPathname = options.addRandomSuffix ? addRandomSuffix(pathname) : pathname;
  const client = getClient();

  let payload: Buffer | Uint8Array | string;
  if (body instanceof Blob) {
    payload = Buffer.from(await body.arrayBuffer());
  } else {
    payload = body;
  }

  await client.send(
    new PutObjectCommand({
      Bucket: requireEnv(bucket, 'OBJECT_STORAGE_BUCKET'),
      Key: finalPathname,
      Body: payload,
      ContentType: options.contentType,
    })
  );

  const downloadUrl = await getSignedDownloadUrl(finalPathname);

  return {
    url: objectUrl(finalPathname),
    downloadUrl,
    pathname: finalPathname,
  };
}

export async function headObject(pathnameOrUrl: string): Promise<StoredObject> {
  const pathname = pathnameFromUrlOrPath(pathnameOrUrl);
  const client = getClient();

  await client.send(
    new HeadObjectCommand({
      Bucket: requireEnv(bucket, 'OBJECT_STORAGE_BUCKET'),
      Key: pathname,
    })
  );

  return {
    url: objectUrl(pathname),
    downloadUrl: await getSignedDownloadUrl(pathname),
    pathname,
  };
}

export async function getSignedDownloadUrl(pathnameOrUrl: string, expiresInSeconds = 600) {
  const pathname = pathnameFromUrlOrPath(pathnameOrUrl);
  const client = getClient();

  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: requireEnv(bucket, 'OBJECT_STORAGE_BUCKET'),
      Key: pathname,
    }),
    { expiresIn: expiresInSeconds }
  );
}
