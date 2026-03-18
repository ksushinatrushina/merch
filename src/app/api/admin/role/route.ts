import { NextRequest, NextResponse } from "next/server";

import { setUserRole } from "@/lib/server/app-service";
import type { Role } from "@/lib/domain/types";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { actorId: string; targetUserId: string; role: Role };
    const snapshot = await setUserRole(body);
    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось обновить роль.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
