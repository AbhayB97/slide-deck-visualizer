import { NextResponse } from "next/server";
import { getCsv } from "@/lib/storage";
import { parseCsvText } from "@/lib/csv";
import { previewSnapshotCsv, type FieldMapping } from "@/lib/processCsvSnapshot";
import { previewMasterCsv, type MasterMapping } from "@/lib/processMaster";

export const runtime = "nodejs";

function countBlankRows(rows: Record<string, string>[]) {
  return rows.filter((row) =>
    Object.values(row).every((value) => String(value ?? "").trim().length === 0)
  ).length;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const filePath = typeof body?.filePath === "string" ? body.filePath : "";
    const fileUrl = typeof body?.fileUrl === "string" ? body.fileUrl : "";
    const mode = body?.mode === "master" ? "master" : "snapshot";
    const fileRef = filePath || fileUrl;

    if (!fileRef) {
      return NextResponse.json(
        { success: false, error: "filePath or fileUrl is required" },
        { status: 400 }
      );
    }

    const csvText = await getCsv(fileRef);
    const { headers, rows } = parseCsvText(csvText);

    if (!body?.mapping) {
      return NextResponse.json({
        success: true,
        headers,
        sourceRowCount: rows.length,
        blankRowCount: countBlankRows(rows),
      });
    }

    if (mode === "master") {
      const review = previewMasterCsv(csvText, body.mapping as MasterMapping);
      const { headers: reviewHeaders, ...rest } = review;
      return NextResponse.json({
        success: true,
        mode,
        headers: reviewHeaders ?? headers,
        blankRowCount: countBlankRows(rows),
        ...rest,
      });
    }

    const review = previewSnapshotCsv(csvText, body.mapping as FieldMapping);
    const { headers: reviewHeaders, ...rest } = review;
    return NextResponse.json({
      success: true,
      mode,
      blankRowCount: countBlankRows(rows),
      headers: reviewHeaders ?? headers,
      ...rest,
      writeImpact: {
        targetWeekId: review.inferredWeekId,
        checkpointId: review.inferredCheckpoint?.checkpointId ?? null,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to review upload";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
