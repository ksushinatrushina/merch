import { NextRequest, NextResponse } from "next/server";

import { authenticateUser } from "@/lib/server/app-service";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { username: string; password: string };
    const result = await authenticateUser(body);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось выполнить вход.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
