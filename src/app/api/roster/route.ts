import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/session";
import { rosterAggregate, rosterData } from "@/lib/roster";

export const dynamic = "force-dynamic";

/**
 * Teacher roster. Default: per-code completion counts (confirmations only).
 * ?aggregate=1: per-section weekly completion percentage with no codes —
 * the view for a skeptical teacher.
 */
export async function GET(request: Request) {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const week = url.searchParams.get("week");

  if (url.searchParams.get("aggregate") === "1") {
    return NextResponse.json(await rosterAggregate(week));
  }

  const section = url.searchParams.get("section");
  if (!section) return NextResponse.json({ error: "missing_section" }, { status: 400 });
  return NextResponse.json(await rosterData(section, week));
}
