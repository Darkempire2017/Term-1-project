import { NextResponse } from 'next/server';
import { runCabinetCommand, cabinetErrorMessage } from '@/lib/mqtt';
import { getSessionIndex } from '@/lib/session';
import { isDevIndex } from '@/lib/dev';

export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const indexNo = await getSessionIndex();
    if (!indexNo) {
      return NextResponse.json({ success: false, message: 'Please sign in.' }, { status: 401 });
    }

    if (!isDevIndex(indexNo)) {
      return NextResponse.json({ success: false, message: 'Developer access required.' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const slot = Number(body?.slot);
    const action = String(body?.action || '').toUpperCase();

    if (!Number.isInteger(slot) || slot < 1 || slot > 4) {
      return NextResponse.json({ success: false, message: 'Choose a slot from 1 to 4.' }, { status: 400 });
    }

    if (action !== 'OPEN' && action !== 'CLOSE') {
      return NextResponse.json({ success: false, message: 'Action must be OPEN or CLOSE.' }, { status: 400 });
    }

    const result = await runCabinetCommand(action, slot, 12000);
    if (!result.ok) {
      return NextResponse.json(
        { success: false, message: cabinetErrorMessage(result.error, action), slot, action },
        { status: result.error === 'TIMEOUT' ? 504 : 502 }
      );
    }

    return NextResponse.json({
      success: result.response.status === 'SUCCESS',
      message: result.response.message || `Slot #${slot} lock ${action === 'OPEN' ? 'opened' : 'closed'}.`,
      slot,
      action,
    });
  } catch (err: any) {
    console.error('❌ [API/Dev/Lock] Unhandled exception:', err);
    return NextResponse.json(
      { success: false, message: 'Internal server error while operating lock.' },
      { status: 500 }
    );
  }
}
