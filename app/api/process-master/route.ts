import { NextResponse } from 'next/server';
import { processMasterCsv, type MasterMapping } from '@/lib/processMaster';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const fileUrl = body?.fileUrl;
    const mapping = body?.mapping as Partial<MasterMapping> | undefined;

    if (!fileUrl || typeof fileUrl !== 'string') {
      return NextResponse.json({ success: false, error: 'fileUrl is required' }, { status: 400 });
    }

    if (!mapping?.firstName || !mapping?.lastName) {
      return NextResponse.json(
        { success: false, error: 'mapping with firstName and lastName is required' },
        { status: 400 }
      );
    }

    const { names } = await processMasterCsv(fileUrl, mapping as MasterMapping);

    return NextResponse.json({ success: true, count: names.length });
  } catch (err: any) {
    const message = err?.message || 'Failed to process master CSV';
    const status = message?.includes('not found') || message?.includes('expired') ? 400 : 400;
    console.error('[process-master] ERROR:', err);
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
