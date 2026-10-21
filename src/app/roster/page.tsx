import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import { slots } from "@/db/schema";
import { requireStaff } from "@/lib/session";
import { rosterAggregate, rosterData } from "@/lib/roster";
import { addDays, todayLocal, weekStartMonday, weekdayName } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function RosterPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; section?: string; view?: string }>;
}) {
  const staff = await requireStaff();
  if (!staff) redirect("/login");

  const { week, section, view } = await searchParams;

  if (view === "aggregate") {
    const agg = await rosterAggregate(week ?? null);
    return (
      <div className="stack">
        <div>
          <h1>Weekly roster</h1>
          <p className="muted small" style={{ marginTop: 6 }}>
            Class-level completion for the week of {agg.week_start}. Percentages only.
          </p>
        </div>
        <div className="nav-row" style={{ padding: 0 }}>
          <Link href={`/roster?week=${agg.week_start}`}>By code</Link>
          <Link href={`/roster?view=aggregate&week=${agg.week_start}`} style={{ color: "inherit", fontWeight: 500 }}>
            Class aggregate
          </Link>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Class</th>
              <th>This week</th>
            </tr>
          </thead>
          <tbody>
            {agg.rows.map((r) => (
              <tr key={r.class_section}>
                <td>{r.class_section}</td>
                <td>{r.percent}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        {staff.admin.role === "SPONSOR" && (
          <nav className="nav-row">
            <Link href="/admin">Admin</Link>
          </nav>
        )}
      </div>
    );
  }

  const sections = (await db().selectDistinct({ s: slots.classSection }).from(slots)).map(
    (r) => r.s,
  );
  const activeSection = section && sections.includes(section) ? section : sections[0];
  if (!activeSection) {
    return <p className="muted">No class sections exist yet. The sponsor creates them first.</p>;
  }

  const data = await rosterData(activeSection, week ?? null);
  const thisMonday = weekStartMonday(todayLocal());
  const prevWeek = addDays(data.week_start, -7);
  const nextWeek = addDays(data.week_start, 7);

  return (
    <div className="stack">
      <div>
        <h1>Weekly roster</h1>
        <p className="muted small" style={{ marginTop: 6 }}>
          Completion counts by code. Match codes to names on the sponsor&rsquo;s paper sheet.
        </p>
      </div>

      <div className="nav-row" style={{ padding: 0 }}>
        {sections.map((s) => (
          <Link
            key={s}
            href={`/roster?section=${encodeURIComponent(s)}&week=${data.week_start}`}
            style={s === activeSection ? { color: "inherit", fontWeight: 500 } : {}}
          >
            {s}
          </Link>
        ))}
        <Link href={`/roster?view=aggregate&week=${data.week_start}`}>Class aggregate</Link>
      </div>

      <div className="row-between">
        <Link className="btn-link" href={`/roster?section=${encodeURIComponent(activeSection)}&week=${prevWeek}`}>
          ← Previous week
        </Link>
        <span className="small">
          {weekdayName(data.week_start).slice(0, 3)} {data.week_start} – {weekdayName(data.week_end).slice(0, 3)}{" "}
          {data.week_end}
        </span>
        {data.week_start < thisMonday ? (
          <Link className="btn-link" href={`/roster?section=${encodeURIComponent(activeSection)}&week=${nextWeek}`}>
            Next week →
          </Link>
        ) : (
          <span />
        )}
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>Code</th>
            <th>This week</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => (
            <tr key={r.participant_code}>
              <td>{r.participant_code}</td>
              <td>{r.completions_this_week}</td>
              <td>{r.completions_total}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {staff.admin.role === "SPONSOR" && (
        <nav className="nav-row">
          <Link href="/admin">Admin</Link>
        </nav>
      )}
    </div>
  );
}
