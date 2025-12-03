import { NextResponse } from 'next/server';
import { fetchHistoryIndex } from '@/lib/history';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const history = await fetchHistoryIndex();
    return NextResponse.json({ success: true, history });
  } catch (error) {
    console.error('[history]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load history index' },
      { status: 500 }
    );
  }
}
