import { NextRequest, NextResponse } from "next/server";

import { cancelOrder } from "@/lib/server/app-service";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { actorId: string; orderId: string };
    const snapshot = await cancelOrder(body);
    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось отменить заказ.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
