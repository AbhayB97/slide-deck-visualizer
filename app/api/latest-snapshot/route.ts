import { NextResponse } from 'next/server';
import { fetchSnapshot } from '@/lib/snapshots';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const snapshot = await fetchSnapshot();
    if (!snapshot) {
      return NextResponse.json(
        { success: false, error: 'No snapshot available' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      snapshot,
    });
  } catch (error) {
    console.error('[latest-snapshot]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load latest snapshot' },
      { status: 500 }
    );
  }
}
