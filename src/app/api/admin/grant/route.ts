import { NextRequest, NextResponse } from "next/server";

import { grantCoins } from "@/lib/server/app-service";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      actorId: string;
      employeeIds: string[];
      coins: number;
      reason?: string;
    };
    const snapshot = await grantCoins(body);
    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось начислить коины.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
