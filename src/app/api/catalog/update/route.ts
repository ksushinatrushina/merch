import { NextRequest, NextResponse } from "next/server";

import { updateCatalogField, updateCatalogSize, uploadCatalogImage } from "@/lib/server/app-service";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as
      | {
          actorId: string;
          type: "field";
          itemId: string;
          field:
            | "title"
            | "description"
            | "priceCoins"
            | "stock"
            | "imageFit"
            | "imagePositionX"
            | "imagePositionY";
          value: string;
        }
      | {
          actorId: string;
          type: "size";
          itemId: string;
          size: string;
          value: number;
        }
      | {
          actorId: string;
          type: "image";
          itemId: string;
          imageUrl: string;
          imageFit?: "contain" | "cover";
          imagePositionX?: number;
          imagePositionY?: number;
        };

    const snapshot =
      body.type === "field"
        ? await updateCatalogField(body)
        : body.type === "size"
          ? await updateCatalogSize(body)
          : await uploadCatalogImage(body);

    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось обновить каталог.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
