import { NextResponse } from 'next/server';
import { fetchMasterUsers } from '@/lib/lists';

export const runtime = 'nodejs';

function escapeCsvCell(value: string) {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET() {
  try {
    const users = await fetchMasterUsers();
    const rows = ['email,name', ...users.map((user) => (
      `${escapeCsvCell(user.email)},${escapeCsvCell(user.name)}`
    ))];
    const csv = `${rows.join('\r\n')}\r\n`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="master-current.csv"',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to export master file';
    console.error('[master-file:export] ERROR:', err);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
