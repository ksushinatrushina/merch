import { NextRequest, NextResponse } from "next/server";

import { reactToPost } from "@/lib/server/app-service";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      postId: string;
      reaction: "thanks" | "celebrate" | "support" | "fire" | "sparkle";
      userId?: string;
    };
    const snapshot = await reactToPost(body);
    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось поставить реакцию.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
