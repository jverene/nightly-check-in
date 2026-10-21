/**
 * End-to-end smoke test against a RUNNING dev server.
 *
 *   # server: CHECKIN_WINDOW_OVERRIDE=true npm run dev
 *   # test:   npm run smoke
 *
 * Requires the server to run with CHECKIN_WINDOW_OVERRIDE=true (it drives
 * time via the x-test-now header) and a seeded DB (npm run seed).
 * Exercises: claim → setup → check-in → resubmit → Sunday supplement → late
 * window → closed states → roster → consent-filtered export → withdrawal →
 * PIN lockout → token rotation.
 */
import "dotenv/config";
import { addDays, todayLocal, weekdayOf } from "../src/lib/time";

const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const SECTIONS = { INTERVENTION: "AP Statistics", CONTROL: "Data Management" } as const;

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    passed++;
    console.log(`  ok  ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`FAIL  ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  }
}

type Response = { status: number; json: any; text: string; setCookie: string[] };

async function api(
  method: string,
  path: string,
  opts: { body?: unknown; cookie?: string; now?: string; ip?: string } = {},
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.now) headers["x-test-now"] = opts.now;
  if (opts.ip) headers["x-forwarded-for"] = opts.ip;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    redirect: "manual",
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* csv or html */
  }
  return { status: res.status, json, text, setCookie: res.headers.getSetCookie() };
}

function sessionCookie(res: Response): string {
  const raw = res.setCookie.find((c) => c.startsWith("nc_session="));
  if (!raw) throw new Error("no session cookie set");
  return raw.split(";")[0];
}

/** Most recent date (<= today) with the given weekday. */
function recentWeekday(target: number): string {
  const today = todayLocal();
  const delta = (weekdayOf(today) - target + 7) % 7;
  return addDays(today, -delta);
}

const wellbeing = (over: Record<string, unknown> = {}) => ({
  stress_0_10: 4,
  pna_stress: false,
  sleep_band: "6_7",
  pna_sleep: false,
  sleep_quality: 3,
  pna_quality: false,
  workload_next_3d_0_10: 7,
  pna_workload: false,
  ...over,
});

async function main() {
  console.log(`smoke: ${BASE}`);

  // Dates used throughout (all school nights unless noted).
  const tue = recentWeekday(2); // Tuesday — school night
  const sun = recentWeekday(0); // Sunday — school night + supplement
  const monLate = `${addDays(sun, 1)}T01:30`; // Monday 1:30am → late for Sunday
  const fri = addDays(tue, 3); // Friday — not a school night
  const tueNight = `${tue}T20:00`;
  const tueLate = `${tue}T22:00`;
  const sunNight = `${sun}T20:00`;

  // --- health ---
  const health = await api("GET", "/api/health");
  check("health ok", health.status === 200 && health.json?.ok === true, health.json);

  // --- sponsor login ---
  const sponsorLogin = await api("POST", "/api/auth/staff-login", {
    body: {
      email: process.env.SEED_SPONSOR_EMAIL || "sponsor@example.com",
      password: process.env.SEED_SPONSOR_PASSWORD || "change-this-password",
    },
  });
  check("sponsor login", sponsorLogin.status === 200 && sponsorLogin.json?.role === "SPONSOR", sponsorLogin.json);
  const sponsor = sessionCookie(sponsorLogin);

  // --- generate slots for this run ---
  const genI = await api("POST", "/api/slots/generate", {
    cookie: sponsor,
    body: { arm: "INTERVENTION", count: 1, class_section: SECTIONS.INTERVENTION },
  });
  const genC = await api("POST", "/api/slots/generate", {
    cookie: sponsor,
    body: { arm: "CONTROL", count: 2, class_section: SECTIONS.CONTROL },
  });
  check("generate slots", genI.status === 200 && genC.status === 200, { genI: genI.json, genC: genC.json });

  const status = await api("GET", "/api/slots/status", { cookie: sponsor });
  const unclaimed = (arm: string) =>
    status.json.slots.find((s: any) => s.arm === arm && !s.claimed);
  const slotA = unclaimed("INTERVENTION");
  const controlSlots = status.json.slots.filter((s: any) => s.arm === "CONTROL" && !s.claimed);
  const slotB = controlSlots[0];
  const slotC = controlSlots[1];
  check("found unclaimed slots", !!slotA && !!slotB && !!slotC);

  // --- export filter: nothing consented yet, so new codes must be absent ---
  const exportBefore = await api("GET", "/api/export", { cookie: sponsor });
  const allExportedCodes = (exp: any) =>
    new Set(
      Object.values(exp.json.tables as Record<string, any[]>)
        .flat()
        .map((r: any) => r.participant_code),
    );
  check(
    "export excludes unconsented codes",
    exportBefore.status === 200 && !allExportedCodes(exportBefore).has(slotA.participant_code),
  );

  // --- student A: claim, setup, check in (Tuesday) ---
  const claimA = await api("POST", "/api/auth/claim", { body: { token: slotA.claim_token, pin: "1234" } });
  check("A claim", claimA.status === 200 && claimA.json?.arm === "INTERVENTION", claimA.json);
  const cookieA = sessionCookie(claimA);

  const setupInfo = await api("GET", "/api/setup", { cookie: cookieA });
  const [course1, course2] = setupInfo.json.presets as string[];
  const setupA = await api("POST", "/api/setup", {
    cookie: cookieA,
    body: { courses: [course1, course2], test_dates: [{ course_name: course1, test_date: addDays(tue, 2) }] },
  });
  check("A setup", setupA.status === 200, setupA.json);

  const todayA = await api("GET", "/api/today", { cookie: cookieA, now: tueNight });
  check("A today open", todayA.json?.state === "open" && todayA.json?.local_date === tue, todayA.json?.state);
  check(
    "A today shows test countdown",
    todayA.json?.tests?.some((t: any) => t.course_name === course1 && t.label === "2 days"),
    todayA.json?.tests,
  );
  check("A today has courses", todayA.json?.courses?.length === 2);

  const coursesA = todayA.json.courses as { id: string; course_name: string }[];
  const idOf = (name: string) => coursesA.find((c) => c.course_name === name)!.id;

  const submitA = await api("POST", "/api/checkin", {
    cookie: cookieA,
    now: `${tue}T20:15`,
    body: {
      local_date: tue,
      ...wellbeing(),
      plans: [
        { course_id: idOf(course1), minutes: 30 },
        { course_id: idOf(course2), minutes: 0 },
      ],
    },
  });
  check("A checkin", submitA.status === 200 && !!submitA.json?.confirmation_code, submitA.json);
  const codeA1 = submitA.json?.confirmation_code;

  // Resubmit same night with pna on stress and no plans: stable code, plans wiped.
  const pnaSubmit = await api("POST", "/api/checkin", {
    cookie: cookieA,
    now: tueLate,
    body: {
      local_date: tue,
      ...wellbeing({ stress_0_10: null, pna_stress: true }),
      plans: [],
    },
  });
  check("pna accepted", pnaSubmit.status === 200, pnaSubmit.json);
  check("pna resubmit keeps code", pnaSubmit.json?.confirmation_code === codeA1);

  // Final resubmit: real answers, one planned course. Export should reflect THIS state.
  const resubmitA = await api("POST", "/api/checkin", {
    cookie: cookieA,
    now: tueLate,
    body: {
      local_date: tue,
      ...wellbeing({ stress_0_10: 9 }),
      plans: [{ course_id: idOf(course1), minutes: 60 }],
    },
  });
  check("A resubmit keeps code", resubmitA.status === 200 && resubmitA.json?.confirmation_code === codeA1, {
    first: codeA1,
    second: resubmitA.json?.confirmation_code,
  });

  const todayAfter = await api("GET", "/api/today", { cookie: cookieA, now: tueLate });
  check(
    "A existing answers updated",
    todayAfter.json?.already_submitted === true &&
      todayAfter.json?.existing?.stress_0_10 === 9 &&
      todayAfter.json?.existing?.plans?.length === 1,
    todayAfter.json?.existing,
  );

  // Strict-schema rejections.
  const freeText = await api("POST", "/api/checkin", {
    cookie: cookieA,
    now: tueLate,
    body: { local_date: tue, ...wellbeing(), note: "free text injection" },
  });
  check("reject unexpected field", freeText.status === 400);

  const nullAnswer = await api("POST", "/api/checkin", {
    cookie: cookieA,
    now: tueLate,
    body: { local_date: tue, ...wellbeing({ stress_0_10: null }) },
  });
  check("reject null without pna", nullAnswer.status === 400);

  const weeklyWrongDay = await api("POST", "/api/checkin", {
    cookie: cookieA,
    now: tueLate,
    body: {
      local_date: tue,
      ...wellbeing(),
      weekly: { late_nights_0_7: 2, pna_late_nights: false, challenge_0_10: 5, pna_challenge: false },
    },
  });
  check("reject weekly on Tuesday", weeklyWrongDay.status === 400);

  // --- Sunday supplement ---
  const todaySun = await api("GET", "/api/today", { cookie: cookieA, now: sunNight });
  check("Sunday flagged", todaySun.json?.is_sunday === true, todaySun.json?.state);
  const submitSun = await api("POST", "/api/checkin", {
    cookie: cookieA,
    now: `${sun}T21:00`,
    body: {
      local_date: sun,
      ...wellbeing(),
      weekly: { late_nights_0_7: 3, pna_late_nights: false, challenge_0_10: 8, pna_challenge: false },
      plans: [{ course_id: idOf(course1), minutes: 15 }],
    },
  });
  check("A Sunday checkin with supplement", submitSun.status === 200, submitSun.json);

  // --- closed states ---
  const closedFri = await api("GET", "/api/today", { cookie: cookieA, now: `${fri}T20:00` });
  check("Friday closed", closedFri.json?.state === "closed", closedFri.json?.state);
  const beforeTen = await api("GET", "/api/today", { cookie: cookieA, now: `${tue}T10:00` });
  check("morning before-window", beforeTen.json?.state === "before", beforeTen.json?.state);
  const closedSubmit = await api("POST", "/api/checkin", {
    cookie: cookieA,
    now: `${fri}T20:00`,
    body: { local_date: fri, ...wellbeing() },
  });
  check("submit while closed rejected", closedSubmit.status === 403);

  // --- student B (control): late window + plans rejection ---
  const claimB = await api("POST", "/api/auth/claim", { body: { token: slotB.claim_token, pin: "9999" } });
  check("B claim", claimB.status === 200 && claimB.json?.arm === "CONTROL", claimB.json);
  const cookieB = sessionCookie(claimB);

  const plansRejected = await api("POST", "/api/checkin", {
    cookie: cookieB,
    now: monLate,
    body: { local_date: sun, ...wellbeing(), plans: [] },
  });
  check("control plans rejected", plansRejected.status === 400);

  const submitB = await api("POST", "/api/checkin", {
    cookie: cookieB,
    now: monLate,
    body: { local_date: sun, ...wellbeing() },
  });
  check("B late submission flagged", submitB.status === 200 && submitB.json?.late === true, submitB.json);

  const historyB = await api("GET", "/api/history", { cookie: cookieB });
  check(
    "B history shows late code only",
    historyB.json?.confirmations?.length === 1 &&
      historyB.json?.confirmations?.[0]?.late === true &&
      !("stress_0_10" in (historyB.json?.confirmations?.[0] ?? {})),
    historyB.json,
  );

  // --- teacher roster (confirmations only) ---
  const teacherLogin = await api("POST", "/api/auth/staff-login", {
    body: {
      email: process.env.SEED_TEACHER_EMAIL || "teacher@example.com",
      password: process.env.SEED_TEACHER_PASSWORD || "change-this-password",
    },
  });
  check("teacher login", teacherLogin.status === 200 && teacherLogin.json?.role === "TEACHER");
  const teacher = sessionCookie(teacherLogin);

  const rosterI = await api(
    "GET",
    `/api/roster?section=${encodeURIComponent(SECTIONS.INTERVENTION)}&week=${tue}`,
    { cookie: teacher },
  );
  const rowA = rosterI.json?.rows?.find((r: any) => r.participant_code === slotA.participant_code);
  check("roster counts A", !!rowA && rowA.completions_total >= 2, rowA);
  check(
    "roster has no response fields",
    !!rowA && !("stress_0_10" in rowA) && !("sleep_band" in rowA),
    rowA,
  );

  // teacher cannot reach sponsor endpoints
  const teacherExport = await api("GET", "/api/export", { cookie: teacher });
  check("teacher blocked from export", teacherExport.status === 401);

  // --- consent-filtered export ---
  const consentA = await api("POST", "/api/consent", {
    cookie: sponsor,
    body: { participant_code: slotA.participant_code, status: "CONSENTED" },
  });
  check("consent A", consentA.status === 200);

  const exportAfter = await api("GET", "/api/export", { cookie: sponsor });
  const codesAfter = allExportedCodes(exportAfter);
  check("export includes consented A", codesAfter.has(slotA.participant_code));
  check("export still excludes B", !codesAfter.has(slotB.participant_code));
  const confRows = exportAfter.json.tables.confirmations as any[];
  check(
    "export includes confirmations with late flag",
    confRows.some((r) => r.participant_code === slotA.participant_code && "late" in r && "submitted_at" in r),
  );
  const planRows = (exportAfter.json.tables.plans as any[]).filter(
    (r) => r.participant_code === slotA.participant_code,
  );
  check(
    "plans export reflects replace-all (Tue 60, Sun 15, no leftovers)",
    planRows.some((r) => r.local_date === tue && r.minutes === 60) &&
      planRows.some((r) => r.local_date === sun && r.minutes === 15) &&
      !planRows.some((r) => r.minutes === 0 || r.minutes === 30) &&
      planRows.filter((r) => r.local_date === tue).length === 1,
    planRows,
  );

  const csv = await api("GET", "/api/export?format=csv&table=checkins", { cookie: sponsor });
  check(
    "csv export respects filter",
    csv.status === 200 &&
      csv.text.includes(slotA.participant_code) &&
      !csv.text.includes(slotB.participant_code),
  );

  // --- withdrawal: real deletion ---
  const badConfirm = await api("DELETE", `/api/data/${slotB.participant_code}`, {
    cookie: sponsor,
    body: { confirm: "wrong-code-00" },
  });
  check("delete requires typed code", badConfirm.status === 400);

  const del = await api("DELETE", `/api/data/${slotB.participant_code}`, {
    cookie: sponsor,
    body: { confirm: slotB.participant_code },
  });
  check(
    "withdrawal deletes rows",
    del.status === 200 && del.json?.deleted?.confirmations === 1 && del.json?.deleted?.checkins === 1,
    del.json,
  );
  const historyBAfter = await api("GET", "/api/history", { cookie: cookieB });
  check("B session killed by deletion", historyBAfter.status === 401);
  const rosterCAfter = await api(
    "GET",
    `/api/roster?section=${encodeURIComponent(SECTIONS.CONTROL)}&week=${sun}`,
    { cookie: teacher },
  );
  const rowBAfter = rosterCAfter.json?.rows?.find((r: any) => r.participant_code === slotB.participant_code);
  check("roster shows zero for withdrawn B", rowBAfter?.completions_total === 0, rowBAfter);

  // --- PIN lockout + rotation recovery ---
  const claimC = await api("POST", "/api/auth/claim", { body: { token: slotC.claim_token, pin: "0000" } });
  check("C claim", claimC.status === 200);

  // Five bad PINs from one IP → 401; the sixth hits the per-IP 5/min limit.
  let badPinOk = true;
  for (let i = 0; i < 5; i++) {
    const r = await api("POST", "/api/auth/login", {
      ip: "10.1.0.1",
      body: { participant_code: slotC.participant_code, pin: "1111" },
    });
    if (r.status !== 401) badPinOk = false;
  }
  check("bad PINs return 401", badPinOk);
  const sixth = await api("POST", "/api/auth/login", {
    ip: "10.1.0.1",
    body: { participant_code: slotC.participant_code, pin: "1111" },
  });
  check("per-IP 5/min limit kicks in", sixth.status === 429, sixth.status);

  // Five more from distinct IPs → failed_attempts reaches 10 → slot locks.
  for (let i = 0; i < 5; i++) {
    await api("POST", "/api/auth/login", {
      ip: `10.1.1.${i + 1}`,
      body: { participant_code: slotC.participant_code, pin: "1111" },
    });
  }
  const lockedLogin = await api("POST", "/api/auth/login", {
    ip: "10.1.2.1",
    body: { participant_code: slotC.participant_code, pin: "0000" },
  });
  check("locked after 10 failures", lockedLogin.status === 423, lockedLogin.status);

  const rotate = await api("POST", "/api/slots/rotate", {
    cookie: sponsor,
    body: { participant_code: slotC.participant_code },
  });
  check("rotate issues new link", rotate.status === 200 && !!rotate.json?.claim_url, rotate.json);

  const oldTokenLogin = await api("POST", "/api/auth/login", {
    ip: "10.1.3.1",
    body: { claim_token: slotC.claim_token, pin: "0000" },
  });
  check("old token dead", oldTokenLogin.status === 401, oldTokenLogin.status);

  // The 10 bad attempts exhausted the per-code 10/min budget; wait out the window.
  console.log("  ..  waiting 61s for the per-code rate-limit window to pass");
  await new Promise((r) => setTimeout(r, 61_000));

  const newToken = rotate.json.claim_url.split("/claim/")[1];
  const newLogin = await api("POST", "/api/auth/login", {
    ip: "10.1.3.2",
    body: { claim_token: newToken, pin: "0000" },
  });
  check("new token logs in (lockout cleared)", newLogin.status === 200, newLogin.json);

  // --- cron auth ---
  const cronNoAuth = await api("GET", "/api/cron/remind");
  check("cron rejects without secret", cronNoAuth.status === 401);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log("failures:", failures.join("; "));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
