import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { fetchCurrentLists } from "@/lib/lists";
import { getAuthPayloadFromRequest } from "@/lib/auth";

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const payload = getAuthPayloadFromRequest(request);
  if (!payload) {
    return NextResponse.json(
      { success: false, highRiskUsers: [], rouletteUsers: [], error: "Unauthorized" },
      { status: 401 }
    );
  }
  try {
    const { highRiskUsers, rouletteUsers } = await fetchCurrentLists();
    return NextResponse.json({ success: true, highRiskUsers, rouletteUsers });
  } catch (err) {
    console.error('[current-lists]', err);
    return NextResponse.json(
      { success: false, highRiskUsers: [], rouletteUsers: [], error: 'Failed to load lists' },
      { status: 500 }
    );
  }
}
