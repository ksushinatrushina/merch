import { NextRequest, NextResponse } from "next/server";

import { searchEmployees } from "@/lib/server/app-service";

export async function GET(request: NextRequest) {
  try {
    const query = request.nextUrl.searchParams.get("q") ?? "";
    const limit = Number(request.nextUrl.searchParams.get("limit") ?? "50");
    const employees = await searchEmployees({ query, limit });
    return NextResponse.json({ employees });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось загрузить сотрудников.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
