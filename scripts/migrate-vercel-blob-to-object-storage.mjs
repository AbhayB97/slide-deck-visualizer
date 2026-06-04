import { list } from '@vercel/blob';
import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

const requiredEnv = [
  'BLOB_READ_WRITE_TOKEN',
  'OBJECT_STORAGE_ENDPOINT',
  'OBJECT_STORAGE_BUCKET',
  'OBJECT_STORAGE_ACCESS_KEY',
  'OBJECT_STORAGE_SECRET_KEY',
];

for (const name of requiredEnv) {
  if (!process.env[name]) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
}

const bucket = process.env.OBJECT_STORAGE_BUCKET;
const dryRun = process.argv.includes('--dry-run');
const overwrite = process.argv.includes('--overwrite');
const prefixArg = process.argv.find((arg) => arg.startsWith('--prefix='));
const prefix = prefixArg ? prefixArg.slice('--prefix='.length) : undefined;

const s3 = new S3Client({
  region: process.env.OBJECT_STORAGE_REGION || 'us-east-1',
  endpoint: process.env.OBJECT_STORAGE_ENDPOINT,
  forcePathStyle: process.env.OBJECT_STORAGE_FORCE_PATH_STYLE !== 'false',
  credentials: {
    accessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY,
    secretAccessKey: process.env.OBJECT_STORAGE_SECRET_KEY,
  },
});

function contentTypeFor(pathname, fallback) {
  if (fallback) return fallback;
  const lower = pathname.toLowerCase();
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.csv')) return 'text/csv';
  if (lower.endsWith('.txt')) return 'text/plain';
  return 'application/octet-stream';
}

async function existsInTarget(pathname) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: pathname }));
    return true;
  } catch (err) {
    const status = err?.$metadata?.httpStatusCode;
    if (status === 404 || err?.name === 'NotFound' || err?.name === 'NoSuchKey') {
      return false;
    }
    throw err;
  }
}

async function migrateBlob(blob) {
  const pathname = blob.pathname;
  const sourceUrl = blob.downloadUrl || blob.url;

  if (!overwrite && await existsInTarget(pathname)) {
    console.log(`SKIP existing ${pathname}`);
    return { skipped: 1, copied: 0, failed: 0 };
  }

  console.log(`${dryRun ? 'DRY RUN copy' : 'COPY'} ${pathname}`);
  if (dryRun) {
    return { skipped: 0, copied: 1, failed: 0 };
  }

  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Failed to download ${pathname}: ${response.status} ${response.statusText}`);
  }

  const body = Buffer.from(await response.arrayBuffer());
  const contentType = contentTypeFor(pathname, response.headers.get('content-type'));

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: pathname,
      Body: body,
      ContentType: contentType,
    })
  );

  return { skipped: 0, copied: 1, failed: 0 };
}

async function main() {
  let cursor;
  const totals = { seen: 0, copied: 0, skipped: 0, failed: 0 };

  do {
    const page = await list({
      token: process.env.BLOB_READ_WRITE_TOKEN,
      cursor,
      prefix,
      limit: 1000,
    });

    for (const blob of page.blobs ?? []) {
      totals.seen += 1;
      try {
        const result = await migrateBlob(blob);
        totals.copied += result.copied;
        totals.skipped += result.skipped;
        totals.failed += result.failed;
      } catch (err) {
        totals.failed += 1;
        console.error(`FAIL ${blob.pathname}:`, err?.message || err);
      }
    }

    cursor = page.cursor;
  } while (cursor);

  console.log('Migration complete:', totals);

  if (totals.failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
