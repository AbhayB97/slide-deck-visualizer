import { NextResponse } from 'next/server';
import { fetchCurrentLists } from '@/lib/lists';

export const runtime = 'nodejs';

export async function GET() {
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
