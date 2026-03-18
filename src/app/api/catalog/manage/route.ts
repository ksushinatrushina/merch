import { NextRequest, NextResponse } from "next/server";

import type { MerchItem } from "@/lib/domain/types";
import {
  deleteCatalogItem,
  duplicateCatalogItem,
  setCatalogItemVisibility,
  upsertCatalogItem,
} from "@/lib/server/app-service";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as
      | { action: "upsert"; actorId: string; item: MerchItem }
      | { action: "duplicate"; actorId: string; itemId: string }
      | { action: "delete"; actorId: string; itemId: string }
      | { action: "visibility"; actorId: string; itemId: string; isActive: boolean };

    const snapshot =
      body.action === "upsert"
        ? await upsertCatalogItem({ actorId: body.actorId, item: body.item })
        : body.action === "duplicate"
          ? await duplicateCatalogItem({ actorId: body.actorId, itemId: body.itemId })
          : body.action === "delete"
            ? await deleteCatalogItem({ actorId: body.actorId, itemId: body.itemId })
            : await setCatalogItemVisibility({ actorId: body.actorId, itemId: body.itemId, isActive: body.isActive });

    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось изменить каталог.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
