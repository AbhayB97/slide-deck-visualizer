import { NextResponse } from 'next/server';
import { uploadCsv } from '@/lib/storage';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: 'CSV file is required' },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const upload = await uploadCsv(arrayBuffer, file.name || 'upload.csv');

    return NextResponse.json({
      success: true,
      fileUrl: upload.url,
      fileName: upload.pathname,
      uploadedAt: upload.uploadedAt,
    });
  } catch (error) {
    console.error('[upload-csv]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to upload CSV' },
      { status: 500 }
    );
  }
}
