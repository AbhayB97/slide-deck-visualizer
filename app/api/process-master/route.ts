import { NextResponse } from 'next/server';
import { processMasterCsv, type MasterMapping } from '@/lib/processMaster';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const filePath = body?.filePath;
    const fileUrl = body?.fileUrl;
    const fileRef = typeof filePath === 'string' && filePath ? filePath : fileUrl;
    const mapping = body?.mapping as Partial<MasterMapping> | undefined;

    if (!fileRef || typeof fileRef !== 'string') {
      return NextResponse.json({ success: false, error: 'filePath or fileUrl is required' }, { status: 400 });
    }

    if (!mapping?.email) {
      return NextResponse.json(
        { success: false, error: 'mapping with email is required' },
        { status: 400 }
      );
    }

    if (!mapping?.fullName && !(mapping?.firstName && mapping?.lastName)) {
      return NextResponse.json(
        { success: false, error: 'mapping for fullName or firstName+lastName is required' },
        { status: 400 }
      );
    }

    const { names } = await processMasterCsv(fileRef, mapping as MasterMapping);

    return NextResponse.json({ success: true, count: names.length });
  } catch (err: any) {
    const message = err?.message || 'Failed to process master CSV';
    const status = message?.includes('not found') || message?.includes('expired') ? 400 : 400;
    console.error('[process-master] ERROR:', err);
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
