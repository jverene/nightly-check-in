/**
 * Browser click-through test for the /demo wizard, using the locally
 * installed Chrome. Run with a server on :3000 (next start or next dev):
 *   node scripts/demo-e2e.mjs
 */
import puppeteer from "puppeteer-core";

const BASE = process.env.DEMO_BASE_URL || "http://localhost:3000";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond, detail) {
  if (cond) {
    passed++;
    console.log(`  ok  ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`FAIL  ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  }
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

  const t0 = Date.now();
  await page.goto(`${BASE}/demo`, { waitUntil: "networkidle0" });
  console.log(`  ..  /demo loaded in ${Date.now() - t0}ms`);

  const text = () => page.evaluate(() => document.body.innerText);
  const progress = async () => (await text()).match(/(\d+) of 12/)?.[1];

  // Hydration must attach handlers — clicking No advances to course 2.
  await page.waitForSelector(".yn-btn", { timeout: 5000 });
  check("page 1 is AP Statistics", (await text()).includes("AP Statistics"));
  const before = await progress();

  const [noBtn] = await page.$$(".yn-btn");
  await noBtn.click();
  await page.waitForFunction(
    () => document.body.innerText.includes("Data Management"),
    { timeout: 2000 },
  ).catch(() => {});
  check("click No advances to course 2", (await text()).includes("Data Management"), await text());
  check("progress moved", (await progress()) !== before, { before, after: await progress() });

  // Yes expands minutes on the same page; minutes chip advances.
  const [, yesBtn] = await page.$$(".yn-btn");
  await yesBtn.click();
  await page.waitForSelector(".chip-strip input", { timeout: 2000 }).catch(() => {});
  check("Yes expands minutes strip", !!(await page.$(".chip-strip input")));
  const chips = await page.evaluate(() => {
    const strip = document.querySelector(".chip-strip");
    const rects = [...strip.querySelectorAll(".chip")].map((c) => c.getBoundingClientRect());
    return {
      count: rects.length,
      overflows: strip.scrollWidth > strip.clientWidth + 1,
      // Every chip must sit inside the card's horizontal bounds.
      outside: rects.filter((r) => r.left < -0.5 || r.right > window.innerWidth + 0.5).length,
    };
  });
  check(
    "all 13 minute chips visible without horizontal scrolling",
    chips.count === 13 && !chips.overflows && chips.outside === 0,
    chips,
  );
  check("still on course 2", (await text()).includes("Data Management"));
  await page.evaluate(() => {
    const chip = [...document.querySelectorAll(".chip-strip .chip")].find((c) => c.textContent === "30");
    chip.click();
  });
  await page.waitForFunction(() => document.body.innerText.includes("English"), { timeout: 2000 }).catch(() => {});
  check("minutes chip advances to course 3", (await text()).includes("English"));

  // Same as yesterday: jumps to first Yes needing minutes (Biology=d4... AP Stats d1 was answered No, so first unconfirmed prefill-Yes is Biology).
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Same as yesterday"));
    btn?.click();
  });
  await page.waitForFunction(() => document.body.innerText.includes("Biology"), { timeout: 2000 }).catch(() => {});
  check("same-as-yesterday jumps to Biology minutes", (await text()).includes("Biology"), await text());
  await page.evaluate(() => {
    const chip = [...document.querySelectorAll(".chip-strip .chip")].find((c) => c.textContent === "1h");
    chip?.click();
  });
  await page.waitForFunction(() => document.body.innerText.includes("stressed"), { timeout: 2000 }).catch(() => {});
  check("lands on stress slider after last minutes", (await text()).includes("stressed"), await text());

  // Slider: set value and commit (pointerup) → advances.
  await page.evaluate(() => {
    const slider = document.querySelector('input[type="range"].slider');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(slider, "6");
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    slider.dispatchEvent(new Event("change", { bubbles: true }));
    slider.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
  });
  await page.waitForFunction(() => document.body.innerText.includes("hours did you sleep"), { timeout: 2000 }).catch(() => {});
  check("slider commit advances to sleep", (await text()).includes("hours did you sleep"), await text());

  // Back via ArrowUp returns to stress; forward again via slider commit.
  await page.keyboard.press("ArrowUp");
  await page.waitForFunction(() => document.body.innerText.includes("stressed"), { timeout: 2000 }).catch(() => {});
  check("ArrowUp goes back to stress", (await text()).includes("stressed"));
  await page.evaluate(() => {
    const slider = document.querySelector('input[type="range"].slider');
    slider.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
  });
  await page.waitForFunction(() => document.body.innerText.includes("hours did you sleep"), { timeout: 2000 }).catch(() => {});

  // Segmented sleep band → quality; segmented quality → workload.
  await page.evaluate(() => {
    const seg = [...document.querySelectorAll(".segmented .seg")].find((s) => s.textContent === "6–7");
    seg.click();
  });
  await page.waitForFunction(() => document.body.innerText.includes("quality of your sleep"), { timeout: 2000 }).catch(() => {});
  check("sleep band advances to quality", (await text()).includes("quality of your sleep"), await text());
  await page.evaluate(() => {
    const seg = [...document.querySelectorAll(".segmented .seg")].find((s) => s.textContent === "4");
    seg.click();
  });
  await page.waitForFunction(() => document.body.innerText.includes("next 3 days"), { timeout: 2000 }).catch(() => {});
  check("quality advances to workload", (await text()).includes("next 3 days"), await text());

  // Workload slider → submit page.
  await page.evaluate(() => {
    const slider = document.querySelector('input[type="range"].slider');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(slider, "3");
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    slider.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
  });
  await page.waitForFunction(() => document.body.innerText.includes("That’s it"), { timeout: 2000 }).catch(() => {});
  check("workload commit lands on submit", (await text()).includes("That’s it"), await text());

  // Submit → success screen.
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Submit");
    btn.click();
  });
  await page.waitForFunction(() => document.body.innerText.includes("proof of completion"), { timeout: 2000 }).catch(() => {});
  const finalText = await text();
  check("success screen shows", finalText.includes("proof of completion"));
  check("seconds line shows", /Completed in \d+ seconds/.test(finalText), finalText.slice(0, 400));
  check("confirmation code format", /[A-Z2-9]{4}-[A-Z2-9]{4}/.test(finalText));
  check("week stat shows", finalText.includes("This week: 3 of 5 nights"));
  check("no class-percentage line", !finalText.includes("Your class is at"));

  // Back must retrace the pages actually shown, in reverse order. "Same as
  // yesterday" jumps from course 1 straight to Biology, so one press of Back
  // has to land on course 1 — not on the courses auto-advance skipped.
  const heading = () => page.evaluate(() => document.querySelector("h1")?.textContent?.trim() ?? "");
  const clickBack = () =>
    page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Back"))?.click());
  await page.goto(`${BASE}/demo`, { waitUntil: "networkidle0" });
  await page.waitForSelector(".yn-btn", { timeout: 5000 });
  await page.evaluate(() =>
    [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Same as yesterday"))?.click(),
  );
  await page.waitForSelector(".chip-strip .chip", { timeout: 2000 }).catch(() => {});
  await page.evaluate(() => {
    const chip = [...document.querySelectorAll(".chip-strip .chip")].find((c) => c.textContent === "30");
    chip?.click();
  });
  await page.waitForFunction(() => document.body.innerText.includes("Biology"), { timeout: 2000 }).catch(() => {});
  check("same-as-yesterday lands on Biology", (await heading()) === "Biology", await heading());
  await clickBack();
  await page.waitForFunction(() => document.body.innerText.includes("AP Statistics"), { timeout: 2000 }).catch(() => {});
  check("Back returns to the page actually shown (course 1)", (await heading()) === "AP Statistics", await heading());
  check(
    "no Back button on the first page",
    !(await page.evaluate(() => [...document.querySelectorAll("button")].some((b) => b.textContent.includes("Back")))),
  );

  // The browser's own back button walks the wizard instead of leaving /demo.
  await page.evaluate(() => {
    const chip = [...document.querySelectorAll(".chip-strip .chip")].find((c) => c.textContent === "45");
    chip?.click();
  });
  await page.waitForFunction(() => document.body.innerText.includes("stressed"), { timeout: 2000 }).catch(() => {});
  await page.goBack();
  await new Promise((r) => setTimeout(r, 300));
  check("stays on /demo after browser back", page.url().endsWith("/demo"), page.url());
  // The last history entry before the sliders was the page the in-app Back
  // returned to, so that is what the browser restores.
  check("browser back restores the previous page", (await heading()) === "AP Statistics", await heading());

  check("no console/page errors", consoleErrors.length === 0, consoleErrors.slice(0, 3));
} finally {
  await browser.close();
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("failures:", failures.join("; "));
  process.exit(1);
}
