import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { fetchCurrentLists } from "@/lib/lists";

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const { highRiskUsers, rouletteUsers, activeUsers, masterCount } = await fetchCurrentLists();
    return NextResponse.json({ success: true, highRiskUsers, rouletteUsers, activeUsers, masterCount });
  } catch (err) {
    console.error('[current-lists]', err);
    return NextResponse.json(
      {
        success: false,
        highRiskUsers: [],
        rouletteUsers: [],
        activeUsers: [],
        masterCount: 0,
        error: 'Failed to load lists',
      },
      { status: 500 }
    );
  }
}
