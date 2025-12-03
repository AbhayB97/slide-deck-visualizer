import { NextResponse } from 'next/server';
import { processCsvSnapshot, type FieldMapping } from '@/lib/processCsvSnapshot';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const fileUrl = body?.fileUrl;
    const mapping = body?.mapping as Partial<FieldMapping> | undefined;

    if (!fileUrl || typeof fileUrl !== 'string') {
      return NextResponse.json(
        { success: false, error: 'fileUrl is required' },
        { status: 400 }
      );
    }

    if (
      !mapping ||
      typeof mapping !== 'object' ||
      !mapping.firstName ||
      !mapping.lastName ||
      !mapping.status ||
      !mapping.title ||
      !mapping.sentDate
    ) {
      return NextResponse.json(
        { success: false, error: 'mapping is required for all fields' },
        { status: 400 }
      );
    }

    const snapshot = await processCsvSnapshot(fileUrl, mapping as FieldMapping);

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
