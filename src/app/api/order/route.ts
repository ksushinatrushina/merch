import { NextRequest, NextResponse } from "next/server";

import { createOrder } from "@/lib/server/app-service";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      userId: string;
      itemId: string;
      quantity: number;
      size: string;
      delivery: {
        method: "moscow-office" | "samara-office" | "delivery";
        address?: string;
        postalCode?: string;
        phone?: string;
      };
    };
    const snapshot = await createOrder(body);
    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось оформить заказ.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
