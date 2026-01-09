import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { uploadCsv } from "@/lib/storage";
import { getAuthPayloadFromRequest } from "@/lib/auth";

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const payload = getAuthPayloadFromRequest(request);
  if (!payload) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: 'CSV file is required' },
        { status: 400 }
      );
    }

    const result = await uploadCsv(file, file.name || 'upload.csv');

    return NextResponse.json({
      success: true,
      fileUrl: result.url,
      fileName: result.pathname,
      uploadedAt: result.uploadedAt,
    });
  } catch (err) {
    console.error('[upload-csv] ERROR:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to upload CSV' },
      { status: 500 }
    );
  }
}
