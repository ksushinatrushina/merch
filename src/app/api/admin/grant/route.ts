import { NextRequest, NextResponse } from "next/server";

import { grantCoins } from "@/lib/server/app-service";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      actorId: string;
      employeeIds: string[];
      coins: number;
      operation?: "grant" | "deduct";
      reason?: string;
    };
    const snapshot = await grantCoins(body);
    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось выполнить операцию с мерчиками.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
