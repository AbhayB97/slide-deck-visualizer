import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const ALLOWED_CSV_CONTENT_TYPES = [
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
  "text/plain",
];

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => ({
        allowedContentTypes: ALLOWED_CSV_CONTENT_TYPES,
        addRandomSuffix: true,
        pathname,
      }),
      onUploadCompleted: async ({ blob }) => {
        console.log("[upload-csv-client] upload completed", blob.pathname);
      },
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error("[upload-csv-client] ERROR:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to prepare CSV upload" },
      { status: 400 }
    );
  }
}
