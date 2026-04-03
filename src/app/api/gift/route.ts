import { NextRequest, NextResponse } from "next/server";

import { sendGift } from "@/lib/server/app-service";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      senderId: string;
      recipientId: string;
      amount: number;
      reason: string;
    };
    const snapshot = await sendGift(body);
    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось отправить мерчики.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
