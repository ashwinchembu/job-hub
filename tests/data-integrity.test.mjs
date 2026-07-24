import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dataSource = await readFile(new URL("../app/data.ts", import.meta.url), "utf8");
const hubSource = await readFile(new URL("../app/JobHub.tsx", import.meta.url), "utf8");
const trackerSource = await readFile(new URL("../build/local-job-tracker.ts", import.meta.url), "utf8");
const journalSyncSource = await readFile(new URL("../build/local-google-journal.ts", import.meta.url), "utf8");

function numbersFrom(source) {
  return [...source.matchAll(/\b\d+\b/g)].map((match) => Number(match[0]));
}

test("the plan includes every canonical Blind 75 problem", () => {
  const canonicalBlock = dataSource.match(/const blind75ProblemIds = new Set\(\[([\s\S]*?)\]\);/);
  const rawPlanBlock = dataSource.match(/const rawProblems = \[([\s\S]*?)\] as const/);
  assert.ok(canonicalBlock, "Blind 75 ID set is present");
  assert.ok(rawPlanBlock, "raw interview plan is present");

  const canonicalIds = new Set(numbersFrom(canonicalBlock[1]));
  const planIds = new Set([...rawPlanBlock[1].matchAll(/^\s*\[(\d+),/gm)].map((match) => Number(match[1])));
  assert.equal(canonicalIds.size, 75);
  assert.equal([...canonicalIds].filter((id) => !planIds.has(id)).length, 0);
  assert.equal(planIds.size, 113);
});

test("hint independence and final submission remain separate scores", () => {
  assert.match(hubSource, /const HINT_PENALTY = 10/);
  assert.match(hubSource, />Final submission</);
  assert.match(hubSource, />Independence</);
  assert.match(hubSource, /hintsUsed: string\[\]/);
});

test("application sync covers interval, visibility, focus, and reconnect", () => {
  assert.match(hubSource, /SHEET_SYNC_INTERVAL_MS = 30_000/);
  assert.match(hubSource, /addEventListener\("focus"/);
  assert.match(hubSource, /addEventListener\("online"/);
  assert.match(hubSource, /addEventListener\("visibilitychange"/);
});

test("workbook saves stream to the app as live updates", () => {
  assert.match(trackerSource, /watchFile\(trackerPath/);
  assert.match(trackerSource, /event: workbook-change/);
  assert.match(trackerSource, /request.method === "POST" && isWebhook/);
  assert.match(hubSource, /new EventSource\("\/api\/job-tracker\/stream"\)/);
  assert.match(hubSource, /setLiveSyncConnected\(true\)/);
});

test("practice and sync timing retain second precision", () => {
  assert.match(hubSource, /Time logged \(seconds\)/);
  assert.match(hubSource, /second: "2-digit"/);
  assert.match(hubSource, /safeSeconds % 60/);
  assert.match(hubSource, /totalSeconds: updatedSeconds/);
});

test("journal saves and AI reviews both trigger Google Sheets upserts", () => {
  assert.match(hubSource, /GOOGLE_JOURNAL_KEY = "job-hub:google-journal:v1"/);
  assert.match(hubSource, /fetch\("\/api\/journal-sync"/);
  assert.equal([...hubSource.matchAll(/void syncProblemToGoogle\(selectedProblem,/g)].length, 2);
  assert.match(journalSyncSource, /hostname === "script\.google\.com"/);
  assert.match(journalSyncSource, /\/macros\\\/s\\\/\[\^\/\]\+\\\/exec/);
});

test("daily coaching uses the latest three scored journals", () => {
  assert.match(hubSource, /function buildDailyCoaching/);
  assert.match(hubSource, /\.slice\(0, 3\)/);
  assert.match(hubSource, /Most often missing/);
  assert.match(hubSource, /Lowest recent skill/);
  assert.match(hubSource, /Do this next/);
});

test("the overview carousel can move backward through completed problems", () => {
  assert.match(hubSource, /const minimumOffset = -planDayIndex/);
  assert.match(hubSource, /Math\.max\(0, Math\.min\(LAST_PLAN_INDEX, planDayIndex \+ focusDayOffset\)\)/);
  assert.match(hubSource, /Show previous or completed problem/);
  assert.match(hubSource, /focusOffset === -1/);
});
