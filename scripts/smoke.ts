/**
 * End-to-end smoke test against a RUNNING dev server (v2).
 *
 *   # server: CHECKIN_WINDOW_OVERRIDE=true npm run dev
 *   # test:   npm run smoke
 *
 * Exercises: claim → course-only setup → check-in (Yes/No plans) → resubmit →
 * prefill from prior night → rows_changed → completion_seconds clamp →
 * flag_fast / flag_flat → Sunday supplement → late window → closed states →
 * strict-schema rejections → roster + class aggregate → calendar CRUD + CSV
 * import → consent-filtered export (incl. assessment_calendar) → withdrawal →
 * PIN lockout → token rotation → demo page.
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

function recentWeekday(target: number): string {
  const today = todayLocal();
  const delta = (weekdayOf(today) - target + 7) % 7;
  return addDays(today, -delta);
}

const W1 = {
  stress_0_10: 4,
  pna_stress: false,
  sleep_band: "6_7",
  pna_sleep: false,
  sleep_quality: 3,
  pna_quality: false,
  workload_next_3d_0_10: 7,
  pna_workload: false,
};
const wellbeing = (over: Record<string, unknown> = {}) => ({ ...W1, ...over });

async function main() {
  console.log(`smoke: ${BASE}`);

  // School nights used: three consecutive (Tue–Thu) plus the prior Sunday.
  const tue = recentWeekday(2);
  const wed = addDays(tue, 1);
  const thu = addDays(tue, 2);
  const sun = recentWeekday(0);
  const monLate = `${addDays(sun, 1)}T01:30`; // late window for Sunday
  const fri = addDays(tue, 3);

  // --- health ---
  const health = await api("GET", "/api/health");
  check("health ok", health.status === 200 && health.json?.ok === true, health.json);

  // --- demo page (public) ---
  const demo = await api("GET", "/demo");
  check("demo page loads", demo.status === 200 && demo.text.includes("Demo"));

  // --- sponsor login ---
  const sponsorLogin = await api("POST", "/api/auth/staff-login", {
    body: {
      email: process.env.SEED_SPONSOR_EMAIL || "sponsor@example.com",
      password: process.env.SEED_SPONSOR_PASSWORD || "change-this-password",
    },
  });
  check("sponsor login", sponsorLogin.status === 200 && sponsorLogin.json?.role === "SPONSOR", sponsorLogin.json);
  const sponsor = sessionCookie(sponsorLogin);

  // --- generate slots ---
  await api("POST", "/api/slots/generate", {
    cookie: sponsor,
    body: { arm: "INTERVENTION", count: 1, class_section: SECTIONS.INTERVENTION },
  });
  await api("POST", "/api/slots/generate", {
    cookie: sponsor,
    body: { arm: "CONTROL", count: 2, class_section: SECTIONS.CONTROL },
  });
  const status = await api("GET", "/api/slots/status", { cookie: sponsor });
  const slotA = status.json.slots.find((s: any) => s.arm === "INTERVENTION" && !s.claimed);
  const controlSlots = status.json.slots.filter((s: any) => s.arm === "CONTROL" && !s.claimed);
  const [slotB, slotC] = controlSlots;
  check("found unclaimed slots", !!slotA && !!slotB && !!slotC);

  // --- student A: claim, course-only setup ---
  const claimA = await api("POST", "/api/auth/claim", { body: { token: slotA.claim_token, pin: "1234" } });
  check("A claim", claimA.status === 200 && claimA.json?.arm === "INTERVENTION", claimA.json);
  const cookieA = sessionCookie(claimA);

  const setupInfo = await api("GET", "/api/setup", { cookie: cookieA });
  check("setup has no test dates", !("test_dates" in setupInfo.json), Object.keys(setupInfo.json));
  const [course1, course2] = setupInfo.json.presets as string[];
  const setupA = await api("POST", "/api/setup", { cookie: cookieA, body: { courses: [course1, course2] } });
  check("A setup (courses only)", setupA.status === 200, setupA.json);
  const setupWithTests = await api("POST", "/api/setup", {
    cookie: cookieA,
    body: { courses: [course1, course2], test_dates: [] },
  });
  check("setup rejects test_dates field", setupWithTests.status === 400);

  // --- Tuesday night: no tests in today, no prefill on night one ---
  const todayA = await api("GET", "/api/today", { cookie: cookieA, now: `${tue}T20:00` });
  check("A today open", todayA.json?.state === "open" && todayA.json?.local_date === tue, todayA.json?.state);
  check("today has no test countdowns", !("tests" in todayA.json));
  check("no prefill on first night", Object.keys(todayA.json?.prefill ?? {}).length === 0);
  const coursesA = todayA.json.courses as { id: string; course_name: string }[];
  const idOf = (name: string) => coursesA.find((c) => c.course_name === name)!.id;

  const submitTue = await api("POST", "/api/checkin", {
    cookie: cookieA,
    now: `${tue}T20:15`,
    body: {
      local_date: tue,
      ...wellbeing(),
      completion_seconds: 42,
      plans: [
        { course_id: idOf(course1), studying: true, minutes: 30 },
        { course_id: idOf(course2), studying: false, minutes: null },
      ],
    },
  });
  check(
    "A Tuesday checkin + stats",
    submitTue.status === 200 &&
      !!submitTue.json?.confirmation_code &&
      submitTue.json?.stats?.week_count === 1 &&
      submitTue.json?.stats?.term_count === 1 &&
      typeof submitTue.json?.stats?.class_percent === "number",
    submitTue.json,
  );
  const codeA1 = submitTue.json?.confirmation_code;

  // Yes-without-minutes and No-with-minutes are schema violations.
  const yesNoMinutes = await api("POST", "/api/checkin", {
    cookie: cookieA,
    now: `${tue}T20:20`,
    body: { local_date: tue, ...wellbeing(), completion_seconds: 30, plans: [{ course_id: idOf(course1), studying: true, minutes: null }] },
  });
  check("yes without minutes rejected", yesNoMinutes.status === 400);
  const noWithMinutes = await api("POST", "/api/checkin", {
    cookie: cookieA,
    now: `${tue}T20:20`,
    body: { local_date: tue, ...wellbeing(), completion_seconds: 30, plans: [{ course_id: idOf(course1), studying: false, minutes: 15 }] },
  });
  check("no with minutes rejected", noWithMinutes.status === 400);
  const freeText = await api("POST", "/api/checkin", {
    cookie: cookieA,
    now: `${tue}T20:20`,
    body: { local_date: tue, ...wellbeing(), completion_seconds: 30, note: "free text injection" },
  });
  check("reject unexpected field", freeText.status === 400);
  const nullAnswer = await api("POST", "/api/checkin", {
    cookie: cookieA,
    now: `${tue}T20:20`,
    body: { local_date: tue, ...wellbeing({ stress_0_10: null }), completion_seconds: 30 },
  });
  check("reject null without pna", nullAnswer.status === 400);

  // --- Wednesday: prefill from Tuesday, flip both rows (rows_changed = 2) ---
  const todayWed = await api("GET", "/api/today", { cookie: cookieA, now: `${wed}T20:00` });
  check(
    "Wednesday prefill from Tuesday",
    todayWed.json?.prefill?.[idOf(course1)] === "yes" && todayWed.json?.prefill?.[idOf(course2)] === "no",
    todayWed.json?.prefill,
  );
  const submitWed = await api("POST", "/api/checkin", {
    cookie: cookieA,
    now: `${wed}T20:10`,
    body: {
      local_date: wed,
      ...wellbeing(),
      completion_seconds: 25,
      plans: [
        { course_id: idOf(course1), studying: false, minutes: null },
        { course_id: idOf(course2), studying: true, minutes: 15 },
      ],
    },
  });
  check("A Wednesday checkin", submitWed.status === 200 && submitWed.json?.stats?.term_count === 2, submitWed.json);

  // --- Thursday: identical wellbeing 3rd consecutive night, clamp seconds ---
  const submitThu = await api("POST", "/api/checkin", {
    cookie: cookieA,
    now: `${thu}T20:00`,
    body: {
      local_date: thu,
      ...wellbeing(),
      completion_seconds: 99999,
      plans: [
        { course_id: idOf(course1), studying: false, minutes: null },
        { course_id: idOf(course2), studying: true, minutes: 45 },
      ],
    },
  });
  check("A Thursday checkin", submitThu.status === 200, submitThu.json);

  // --- Sunday: supplement + fast submission ---
  const submitSun = await api("POST", "/api/checkin", {
    cookie: cookieA,
    now: `${sun}T21:00`,
    body: {
      local_date: sun,
      ...wellbeing({ stress_0_10: 6 }),
      completion_seconds: 3,
      weekly: { late_nights_0_7: 3, pna_late_nights: false, challenge_0_10: 8, pna_challenge: false },
      plans: [{ course_id: idOf(course1), studying: true, minutes: 60 }],
    },
  });
  check("A Sunday checkin with supplement", submitSun.status === 200, submitSun.json);

  const weeklyWrongDay = await api("POST", "/api/checkin", {
    cookie: cookieA,
    now: `${tue}T22:00`,
    body: {
      local_date: tue,
      ...wellbeing(),
      completion_seconds: 20,
      weekly: { late_nights_0_7: 2, pna_late_nights: false, challenge_0_10: 5, pna_challenge: false },
    },
  });
  check("reject weekly on Tuesday", weeklyWrongDay.status === 400);

  // --- closed states ---
  const closedFri = await api("GET", "/api/today", { cookie: cookieA, now: `${fri}T20:00` });
  check("Friday closed", closedFri.json?.state === "closed", closedFri.json?.state);
  const beforeTen = await api("GET", "/api/today", { cookie: cookieA, now: `${tue}T10:00` });
  check("morning before-window", beforeTen.json?.state === "before", beforeTen.json?.state);

  // --- student B (control): setup required, late window, plans rejected ---
  const claimB = await api("POST", "/api/auth/claim", { body: { token: slotB.claim_token, pin: "9999" } });
  check("B claim", claimB.status === 200 && claimB.json?.arm === "CONTROL", claimB.json);
  const cookieB = sessionCookie(claimB);

  const bBeforeSetup = await api("POST", "/api/checkin", {
    cookie: cookieB,
    now: monLate,
    body: { local_date: sun, ...wellbeing(), completion_seconds: 30 },
  });
  check("control needs setup too", bBeforeSetup.status === 400 && bBeforeSetup.json?.error === "setup_required");
  const setupInfoB = await api("GET", "/api/setup", { cookie: cookieB });
  await api("POST", "/api/setup", { cookie: cookieB, body: { courses: [setupInfoB.json.presets[0]] } });

  const plansRejected = await api("POST", "/api/checkin", {
    cookie: cookieB,
    now: monLate,
    body: { local_date: sun, ...wellbeing(), completion_seconds: 30, plans: [{ course_id: "00000000-0000-0000-0000-000000000000", studying: false, minutes: null }] },
  });
  check("control plans rejected", plansRejected.status === 400);

  const submitB = await api("POST", "/api/checkin", {
    cookie: cookieB,
    now: monLate,
    body: { local_date: sun, ...wellbeing(), completion_seconds: 30 },
  });
  check("B late submission flagged", submitB.status === 200 && submitB.json?.late === true, submitB.json);
  check(
    "B stats present",
    typeof submitB.json?.stats?.class_percent === "number" && submitB.json?.stats?.term_count === 1,
    submitB.json?.stats,
  );

  // --- teacher roster + class aggregate ---
  const teacherLogin = await api("POST", "/api/auth/staff-login", {
    body: {
      email: process.env.SEED_TEACHER_EMAIL || "teacher@example.com",
      password: process.env.SEED_TEACHER_PASSWORD || "change-this-password",
    },
  });
  const teacher = sessionCookie(teacherLogin);

  const rosterI = await api(
    "GET",
    `/api/roster?section=${encodeURIComponent(SECTIONS.INTERVENTION)}&week=${tue}`,
    { cookie: teacher },
  );
  const rowA = rosterI.json?.rows?.find((r: any) => r.participant_code === slotA.participant_code);
  check("roster counts A (4 nights)", !!rowA && rowA.completions_total === 4, rowA);

  const aggregate = await api("GET", `/api/roster?aggregate=1&week=${tue}`, { cookie: teacher });
  const aggAP = aggregate.json?.rows?.find((r: any) => r.class_section === SECTIONS.INTERVENTION);
  check(
    "class aggregate view (percentages, no codes)",
    !!aggAP && typeof aggAP.percent === "number" && aggAP.percent > 0 && !("participant_code" in aggAP),
    aggAP,
  );

  const teacherExport = await api("GET", "/api/export", { cookie: teacher });
  check("teacher blocked from export", teacherExport.status === 401);

  // --- assessment calendar CRUD + CSV import ---
  const calBefore = await api("GET", "/api/calendar", { cookie: sponsor });
  const calCountBefore = (calBefore.json?.calendar as any[])?.length ?? 0;

  const calCreate = await api("POST", "/api/calendar", {
    cookie: sponsor,
    body: { course_name: course1, section: null, assess_date: addDays(tue, 9), assess_type: "TEST" },
  });
  check("calendar create", calCreate.status === 200 && !!calCreate.json?.id, calCreate.json);
  const calId = calCreate.json?.id;
  const calUpdate = await api("PATCH", "/api/calendar", {
    cookie: sponsor,
    body: { id: calId, course_name: course1, section: SECTIONS.INTERVENTION, assess_date: addDays(tue, 9), assess_type: "QUIZ" },
  });
  check("calendar update", calUpdate.status === 200);
  const calImport = await api("POST", "/api/calendar/import", {
    cookie: sponsor,
    body: {
      csv_text: `course,section,date,type\nBiology,,${addDays(tue, 10)},QUIZ\nthis-line-is-bad\nHistory,Data Management,${addDays(tue, 11)},ASSIGNMENT`,
    },
  });
  check(
    "calendar CSV import (2 good, 1 bad)",
    calImport.status === 200 && calImport.json?.imported === 2 && calImport.json?.errors?.length === 1,
    calImport.json,
  );

  // --- consent-filtered export incl. instrumentation + calendar ---
  const exportBefore = await api("GET", "/api/export", { cookie: sponsor });
  const exportedCodes = (exp: any) =>
    new Set(
      ["checkins", "weekly_supplements", "plans", "confirmations"]
        .flatMap((t) => exp.json.tables[t] as any[])
        .map((r: any) => r.participant_code),
    );
  check("export excludes unconsented A", !exportedCodes(exportBefore).has(slotA.participant_code));
  check(
    "export includes assessment calendar without filter",
    (exportBefore.json.tables.assessment_calendar as any[]).length === calCountBefore + 3,
    exportBefore.json.tables.assessment_calendar,
  );

  await api("POST", "/api/consent", {
    cookie: sponsor,
    body: { participant_code: slotA.participant_code, status: "CONSENTED" },
  });
  const exportAfter = await api("GET", "/api/export", { cookie: sponsor });
  const codesAfter = exportedCodes(exportAfter);
  check("export includes consented A", codesAfter.has(slotA.participant_code));
  check("export still excludes B", !codesAfter.has(slotB.participant_code));

  const checkinRows = (exportAfter.json.tables.checkins as any[]).filter(
    (r) => r.participant_code === slotA.participant_code,
  );
  const tueRow = checkinRows.find((r) => r.local_date === tue);
  const wedRow = checkinRows.find((r) => r.local_date === wed);
  const thuRow = checkinRows.find((r) => r.local_date === thu);
  const sunRow = checkinRows.find((r) => r.local_date === sun);
  check(
    "instrumentation: seconds, clamp, rows_changed",
    tueRow?.completion_seconds === 42 &&
      tueRow?.rows_changed === 0 &&
      wedRow?.rows_changed === 2 &&
      thuRow?.completion_seconds === 3600,
    { tueRow, wedRow, thuRow },
  );
  check(
    "flags: flag_flat on night 3, flag_fast on 3s submit",
    thuRow?.flag_flat === true &&
      thuRow?.flag_fast === false &&
      sunRow?.flag_fast === true &&
      sunRow?.flag_flat === false &&
      tueRow?.flag_flat === false,
    { thuRow, sunRow },
  );
  check("flags never in today payload", !("flag_flat" in (todayA.json ?? {})) && !("flag_fast" in (todayA.json ?? {})));

  const planRows = (exportAfter.json.tables.plans as any[]).filter(
    (r) => r.participant_code === slotA.participant_code,
  );
  check(
    "plans export: studying/minutes shape, explicit No rows stored",
    planRows.some((r) => r.local_date === tue && r.studying === true && r.minutes === 30) &&
      planRows.some((r) => r.local_date === tue && r.studying === false && r.minutes === null) &&
      planRows.every((r) => r.minutes !== 0),
    planRows,
  );

  const csv = await api("GET", "/api/export?format=csv&table=checkins", { cookie: sponsor });
  check(
    "csv has new columns + respects filter",
    csv.status === 200 &&
      csv.text.includes("completion_seconds") &&
      csv.text.includes("flag_flat") &&
      csv.text.includes(slotA.participant_code) &&
      !csv.text.includes(slotB.participant_code),
  );
  const calCsv = await api("GET", "/api/export?format=csv&table=assessment_calendar", { cookie: sponsor });
  check("calendar csv export", calCsv.status === 200 && calCsv.text.includes("Biology"), calCsv.text.slice(0, 200));

  const calDelete = await api("DELETE", "/api/calendar", { cookie: sponsor, body: { id: calId } });
  check("calendar delete", calDelete.status === 200);

  // --- withdrawal ---
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

  // --- PIN lockout + rotation recovery ---
  const claimC = await api("POST", "/api/auth/claim", { body: { token: slotC.claim_token, pin: "0000" } });
  check("C claim", claimC.status === 200);
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
