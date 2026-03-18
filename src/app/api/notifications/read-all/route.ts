import { NextRequest, NextResponse } from "next/server";

import { markAllNotificationsRead } from "@/lib/server/app-service";
import { currentUser } from "@/lib/mock-data";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { userId?: string };
  const snapshot = await markAllNotificationsRead(body.userId ?? currentUser.id);
  return NextResponse.json(snapshot);
}
