import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { uploadAvatar } from "@/lib/avatarStorage";
import { formatNameForBlob } from "@/lib/avatarNames";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const displayName = formData.get("displayName");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "Photo file is required" },
        { status: 400 }
      );
    }

    if (typeof displayName !== "string" || !displayName.trim()) {
      return NextResponse.json(
        { success: false, error: "Display name is required" },
        { status: 400 }
      );
    }

    const result = await uploadAvatar(file, displayName);

    return NextResponse.json({
      success: true,
      fileUrl: result.url,
      filePath: result.pathname,
      uploadedAt: result.uploadedAt,
      contentType: result.contentType,
      slug: formatNameForBlob(displayName),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to upload photo";
    const status =
      message.includes("required") ||
      message.includes("must be") ||
      message.includes("Content-Type")
        ? 400
        : 500;
    console.error("[upload-photo] ERROR:", err);
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
