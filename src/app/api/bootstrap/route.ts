import { NextResponse } from "next/server";
import { NextRequest } from "next/server";

import { getAppSnapshot } from "@/lib/server/app-service";
import { currentUser } from "@/lib/mock-data";

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId") ?? currentUser.id;
  const snapshot = await getAppSnapshot(userId);
  return NextResponse.json(snapshot);
}
