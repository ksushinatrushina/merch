import { NextResponse } from "next/server";

import { resetAppModel } from "@/lib/server/app-service";
import { currentUser } from "@/lib/mock-data";

export async function POST() {
  const snapshot = await resetAppModel(currentUser.id);
  return NextResponse.json(snapshot);
}
