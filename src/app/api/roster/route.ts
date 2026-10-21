import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/session";
import { rosterData } from "@/lib/roster";

export const dynamic = "force-dynamic";

/** Teacher roster: codes + completion counts. No response data exists here. */
export async function GET(request: Request) {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const section = url.searchParams.get("section");
  const week = url.searchParams.get("week");
  if (!section) return NextResponse.json({ error: "missing_section" }, { status: 400 });

  return NextResponse.json(await rosterData(section, week));
}
