import { NextResponse } from 'next/server';
import { processCsvSnapshot } from '@/lib/processCsvSnapshot';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const fileUrl = body?.fileUrl;

    if (!fileUrl || typeof fileUrl !== 'string') {
      return NextResponse.json(
        { success: false, error: 'fileUrl is required' },
        { status: 400 }
      );
    }

    const snapshot = await processCsvSnapshot(fileUrl);

    return NextResponse.json({
      success: true,
      snapshotPath: snapshot.snapshotId,
      offenderCount: snapshot.offenderCount,
      snapshot,
    });
  } catch (err: any) {
    const message = err?.message || 'Failed to process CSV';
    console.error('[process-csv] ERROR:', err);
    const status = 400;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
