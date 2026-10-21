import { asc, eq } from "drizzle-orm";
import QRCode from "qrcode";
import { db } from "@/db";
import { slots } from "@/db/schema";
import { claimUrlFor } from "@/lib/codes";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

/**
 * Print-ready claim strips: QR of the claim URL + short code + section,
 * nothing else. Cut, hand out, and have students write their code next to
 * their name on the paper roster — the only identity mapping that exists.
 */
export default async function PrintPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string; all?: string }>;
}) {
  const { section, all } = await searchParams;
  const database = db();

  const rows = await database
    .select({
      participantCode: slots.participantCode,
      claimToken: slots.claimToken,
      classSection: slots.classSection,
      claimedAt: slots.claimedAt,
    })
    .from(slots)
    .where(section ? eq(slots.classSection, section) : undefined)
    .orderBy(asc(slots.classSection), asc(slots.participantCode));

  const strips = (all === "1" ? rows : rows.filter((r) => !r.claimedAt)).map((r) => ({
    code: r.participantCode,
    section: r.classSection,
    url: claimUrlFor(r.claimToken),
  }));

  const qrSvgs = await Promise.all(
    strips.map((s) => QRCode.toString(s.url, { type: "svg", margin: 0, errorCorrectionLevel: "M" })),
  );

  return (
    <div className="stack">
      <div className="no-print stack">
        <h1>Claim strips</h1>
        <p className="muted small">
          {strips.length} strip{strips.length === 1 ? "" : "s"}
          {section ? ` for ${section}` : ""}
          {all !== "1" ? " (unclaimed only)" : ""}. Print, cut along the dashed lines, and hand
          one to each student. Students write their code next to their name on your paper
          roster.
        </p>
        <div className="nav-row" style={{ padding: 0 }}>
          <PrintButton />
          <a className="btn-link" href="/admin/slots">
            Back to slots
          </a>
          <a className="btn-link" href={`/admin/slots/print?${section ? `section=${encodeURIComponent(section)}&` : ""}all=1`}>
            Include already-claimed
          </a>
        </div>
      </div>

      {strips.length === 0 ? (
        <p className="muted no-print">Nothing to print. Generate slots first.</p>
      ) : (
        <div className="strip-grid">
          {strips.map((s, i) => (
            <div className="strip" key={s.code}>
              <div dangerouslySetInnerHTML={{ __html: qrSvgs[i] }} />
              <p className="code">{s.code}</p>
              <p className="section">{s.section} · Nightly Check-In</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
