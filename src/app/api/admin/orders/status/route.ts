import { NextRequest, NextResponse } from "next/server";

import { updateOrderStatuses } from "@/lib/server/app-service";
import type { OrderStatus } from "@/lib/app-types";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      actorId: string;
      orderIds: string[];
      status: OrderStatus;
    };

    const snapshot = await updateOrderStatuses(body);
    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось обновить статус заказа.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
