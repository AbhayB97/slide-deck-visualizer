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

    return NextResponse.json({ success: true, snapshot });
  } catch (error) {
    console.error('[process-csv]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process CSV' },
      { status: 500 }
    );
  }
}
