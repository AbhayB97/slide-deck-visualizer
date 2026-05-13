import { NextResponse } from 'next/server';
import { fetchMasterFileMetadata, fetchMasterUsers } from '@/lib/lists';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const [metadata, users] = await Promise.all([
      fetchMasterFileMetadata(),
      fetchMasterUsers(),
    ]);

    return NextResponse.json({
      success: true,
      uploadedAt: metadata.uploadedAt,
      count: users.length,
      hasFile: Boolean(metadata.uploadedAt) || users.length > 0,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load master file metadata';
    console.error('[master-file] ERROR:', err);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
