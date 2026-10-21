import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireStaff } from "@/lib/session";
import { isValidDateStr } from "@/lib/time";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

const TABLES = ["checkins", "weekly_supplements", "plans", "test_dates", "confirmations"] as const;
type ExportTable = (typeof TABLES)[number];

// Date column used for range filtering per table; test_dates exports in full
// because the test calendar is needed to derive study lead-time.
const DATE_COLUMN: Record<ExportTable, string | null> = {
  checkins: "local_date",
  weekly_supplements: "week_start_date",
  plans: "local_date",
  test_dates: null,
  confirmations: "local_date",
};

/**
 * THE consent filter. It lives in the SQL, not the UI: rows for any code
 * whose consent is not exactly CONSENTED, or that is excluded from the study
 * (research-team members), are never read at all.
 */
const CONSENT_FILTER = sql`
  participant_code in (
    select participant_code from consent
    where status = 'CONSENTED' and excluded_from_study = false
  )
`;

async function exportTable(
  table: ExportTable,
  from: string | null,
  to: string | null,
): Promise<Record<string, unknown>[]> {
  const dateCol = DATE_COLUMN[table];
  const range =
    dateCol && (from || to)
      ? sql` and ${sql.raw(dateCol)} between ${from ?? "0001-01-01"} and ${to ?? "9999-12-31"}`
      : sql``;
  const orderCol = dateCol ?? "created_at";
  const rows = await db().execute(sql`
    select * from ${sql.raw(table)}
    where ${CONSENT_FILTER} ${range}
    order by participant_code, ${sql.raw(orderCol)}
  `);
  return rows as unknown as Record<string, unknown>[];
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const cols = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = v instanceof Date ? v.toISOString() : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.join(",")];
  for (const row of rows) lines.push(cols.map((c) => escape(row[c])).join(","));
  return lines.join("\n");
}

export async function GET(request: Request) {
  const staff = await requireStaff("SPONSOR");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rl = await rateLimit(`export:${staff.admin.id}`, 20, 60);
  if (!rl.ok) return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });

  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const format = url.searchParams.get("format") ?? "json";
  const table = url.searchParams.get("table");

  if ((from && !isValidDateStr(from)) || (to && !isValidDateStr(to))) {
    return NextResponse.json({ error: "invalid_date_range" }, { status: 400 });
  }
  if (format === "csv" && (!table || !TABLES.includes(table as ExportTable))) {
    return NextResponse.json({ error: "csv_requires_valid_table_param" }, { status: 400 });
  }

  if (format === "csv") {
    const rows = await exportTable(table as ExportTable, from, to);
    await audit("SPONSOR", "export", null, { format, table, from, to, rows: rows.length });
    return new NextResponse(toCsv(rows), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${table}_${from ?? "all"}_${to ?? "all"}.csv"`,
      },
    });
  }

  const tables: Record<string, Record<string, unknown>[]> = {};
  for (const t of TABLES) tables[t] = await exportTable(t, from, to);
  await audit("SPONSOR", "export", null, {
    format: "json",
    from,
    to,
    rows: Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length])),
  });

  return NextResponse.json({
    generated_at: new Date().toISOString(),
    range: { from, to },
    consent_filter: "status = CONSENTED and excluded_from_study = false (enforced in SQL)",
    tables,
  });
}
