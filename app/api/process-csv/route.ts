import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { processCsvSnapshot, type FieldMapping } from "@/lib/processCsvSnapshot";

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const filePath = body?.filePath;
    const fileUrl = body?.fileUrl;
    const fileRef = typeof filePath === 'string' && filePath ? filePath : fileUrl;
    const mapping = body?.mapping as Partial<FieldMapping> | undefined;

    if (!fileRef || typeof fileRef !== 'string') {
      return NextResponse.json(
        { success: false, error: 'filePath or fileUrl is required' },
        { status: 400 }
      );
    }

    if (
      !mapping ||
      typeof mapping !== 'object' ||
      !mapping.email ||
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

    const snapshot = await processCsvSnapshot(fileRef, mapping as FieldMapping);

    return NextResponse.json({
      success: true,
      snapshotPath: snapshot.snapshotId,
      offenderCount: snapshot.offenderCount,
      snapshot,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to process CSV';
    console.error('[process-csv] ERROR:', err);
    const status = 400;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
