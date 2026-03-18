import { NextRequest, NextResponse } from "next/server";

import { toggleCatalogItem } from "@/lib/server/app-service";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { actorId: string; itemId: string };
    const snapshot = await toggleCatalogItem(body);
    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось изменить доступность товара.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
