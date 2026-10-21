import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { requireStudent } from "@/lib/session";
import { claimUrlFor } from "@/lib/codes";

export const dynamic = "force-dynamic";

/** Own short code + claim URL + QR, for adding a second device. */
export async function GET() {
  const session = await requireStudent();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const claimUrl = claimUrlFor(session.slot.claimToken);
  const qrSvg = await QRCode.toString(claimUrl, { type: "svg", margin: 1, errorCorrectionLevel: "M" });

  return NextResponse.json({
    participant_code: session.slot.participantCode,
    arm: session.slot.arm,
    class_section: session.slot.classSection,
    claim_url: claimUrl,
    qr_svg: qrSvg,
    vapid_public_key: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null,
  });
}
