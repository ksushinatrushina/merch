import { NextRequest, NextResponse } from "next/server";

import { setWishlist } from "@/lib/server/app-service";
import { currentUser } from "@/lib/mock-data";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { itemId: string; userId?: string };
    const snapshot = await setWishlist({ userId: body.userId ?? currentUser.id, itemId: body.itemId });
    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось обновить wishlist.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
